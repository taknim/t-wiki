import { del, get, set } from 'idb-keyval'
import { vaultKeyFor } from './vaultKey'
import type { GitHubConfig, SyncState } from '../types'

const VAULT_HANDLE = 'mdwiki:vault-handle'
const GITHUB_CONFIG = 'mdwiki:github-config'
const SYNC_STATE = 'mdwiki:sync-state'
const LAST_SYNC = 'mdwiki:last-sync-at'
const ASSET_HASHES = 'mdwiki:asset-hashes'

/**
 * FileSystemDirectoryHandle 은 구조화 복제가 되므로 IndexedDB 에 그대로 넣어둘 수 있습니다.
 * 다음 방문 때 권한만 다시 확인하면 같은 폴더를 그대로 씁니다.
 */
/*
 * 옮겨 담기를 먼저 끝냅니다. 이 값을 덮어쓰고 나면 옛 설정의 주인을 알 수 없습니다.
 */
export const saveVaultHandle = async (handle: FileSystemDirectoryHandle) => {
  await migrateLegacy()
  return set(VAULT_HANDLE, handle)
}
export const loadVaultHandle = () => get<FileSystemDirectoryHandle>(VAULT_HANDLE)
export const clearVaultHandle = () => del(VAULT_HANDLE)

/*
 * 아래 것들은 모두 폴더마다 따로 둡니다.
 *
 * 예전에는 한 벌만 두었습니다. 그래서 A 폴더를 어떤 저장소에 맞춰 두고 B 폴더를 열면,
 * B 가 A 의 저장소 설정과 A 의 기준점을 그대로 물려받았습니다. 그 상태로 동기화하면
 * "A 에 있던 파일들이 로컬에서 사라졌다" 로 읽혀 저장소에서 지워집니다.
 * 폴더가 다르면 남남이어야 합니다.
 */
type ByVault<T> = Record<string, T>

async function readByVault<T>(bucket: string): Promise<ByVault<T>> {
  const raw = await get<unknown>(bucket)
  if (!raw || typeof raw !== 'object') return {}
  return raw as ByVault<T>
}

export async function loadGitHubConfig(vault: string): Promise<GitHubConfig | undefined> {
  return (await readByVault<GitHubConfig>(GITHUB_CONFIG))[vault]
}

export async function saveGitHubConfig(vault: string, config: GitHubConfig): Promise<void> {
  const store = await readByVault<GitHubConfig>(GITHUB_CONFIG)
  store[vault] = config
  await set(GITHUB_CONFIG, store)
}

export async function clearGitHubConfig(vault: string): Promise<void> {
  const store = await readByVault<GitHubConfig>(GITHUB_CONFIG)
  delete store[vault]
  await set(GITHUB_CONFIG, store)
}

/**
 * 기준점은 폴더마다, 그 안에서 다시 동기화 대상마다 따로 둡니다.
 * 저장소·브랜치·하위 폴더가 바뀌면 같은 문서가 다른 경로로 올라가므로,
 * 옛 기준점을 그대로 쓰면 한쪽은 "사라졌다", 다른 쪽은 "처음 본다" 로 잡혀 파일이 복제됩니다.
 */
type SyncStateStore = Record<string, SyncState>

/** 한 폴더에서 기준점을 몇 벌까지 들고 있을지. 오래된 것부터 버립니다. */
const MAX_BASELINES = 5

export function syncSignature(config: GitHubConfig): string {
  const owner = config.owner.trim().toLowerCase()
  const repo = config.repo.trim().toLowerCase()
  return `${owner}/${repo}@${config.branch.trim()}:${config.basePath.trim()}`
}

function prune(store: SyncStateStore, keep: string): SyncStateStore {
  const keys = Object.keys(store)
  if (keys.length <= MAX_BASELINES) return store

  // 지금 쓰는 것은 무조건 남기고, 나머지는 오래된 순으로 버립니다.
  const survivors = new Set([keep, ...keys.filter((key) => key !== keep).slice(-(MAX_BASELINES - 1))])
  return Object.fromEntries(Object.entries(store).filter(([key]) => survivors.has(key)))
}

const baselinesOf = async (vault: string): Promise<SyncStateStore> =>
  (await readByVault<SyncStateStore>(SYNC_STATE))[vault] ?? {}

export async function loadSyncState(vault: string, signature: string): Promise<SyncState> {
  return (await baselinesOf(vault))[signature] ?? {}
}

/** 이 폴더가 어떤 대상으로든 동기화한 적이 있는지. 첫 사용과 대상 변경을 구분할 때 씁니다. */
export async function hasAnyBaseline(vault: string): Promise<boolean> {
  return Object.values(await baselinesOf(vault)).some((state) => Object.keys(state).length > 0)
}

/** 이 폴더가 이 대상으로 동기화한 적이 있는지. 대상이 바뀌었음을 알려 줄 때 씁니다. */
export async function hasSyncState(vault: string, signature: string): Promise<boolean> {
  return Object.keys((await baselinesOf(vault))[signature] ?? {}).length > 0
}

export async function saveSyncState(
  vault: string,
  signature: string,
  state: SyncState,
): Promise<void> {
  const store = await readByVault<SyncStateStore>(SYNC_STATE)
  const mine = { ...(store[vault] ?? {}), [signature]: state }
  store[vault] = prune(mine, signature)
  await set(SYNC_STATE, store)
}

export const clearSyncState = () => del(SYNC_STATE)

/** 첨부 해시 캐시. 크기와 수정 시각이 그대로면 다시 읽지 않습니다. */
export interface AssetHash {
  sha: string
  size: number
  lastModified: number
}

export const loadAssetHashes = async (vault: string): Promise<Record<string, AssetHash>> =>
  (await readByVault<Record<string, AssetHash>>(ASSET_HASHES))[vault] ?? {}

export async function saveAssetHashes(
  vault: string,
  hashes: Record<string, AssetHash>,
): Promise<void> {
  const store = await readByVault<Record<string, AssetHash>>(ASSET_HASHES)
  store[vault] = hashes
  await set(ASSET_HASHES, store)
}

export async function saveLastSyncAt(vault: string, at: number): Promise<void> {
  const store = await readByVault<number>(LAST_SYNC)
  store[vault] = at
  await set(LAST_SYNC, store)
}

export const loadLastSyncAt = async (vault: string): Promise<number | undefined> =>
  (await readByVault<number>(LAST_SYNC))[vault]

/**
 * 폴더별로 가르기 전에 쓰던 한 벌짜리 값을 제 주인에게 옮겨 담습니다.
 *
 * 그 값이 어느 폴더 것인지는 적혀 있지 않습니다. 단서는 마지막으로 열어 두었던
 * 폴더뿐인데, 폴더를 새로 열면 그 자리가 곧바로 덮입니다. 그래서 폴더를 열기 전에,
 * 앱이 뜨자마자 한 번만 봅니다. 열고 나서 물으면 방금 연 폴더가 나오고,
 * 처음 보는 폴더에까지 옛 토큰이 딸려 들어갑니다.
 *
 * 주인을 못 찾으면 물려주지 않고 버립니다. 짐작으로 아무 폴더에나 붙이면
 * 남의 저장소에 남의 토큰으로 동기화하게 됩니다.
 */
let migration: Promise<void> | null = null

export function migrateLegacy(): Promise<void> {
  migration ??= runMigration()
  return migration
}

async function runMigration(): Promise<void> {
  try {
    const config = await get<unknown>(GITHUB_CONFIG)
    // 이미 폴더별로 갈라 둔 모양이면 옮길 것이 없습니다.
    if (!config || typeof config !== 'object' || !('token' in config)) return

    const last = await loadVaultHandle()
    const key = last ? await vaultKeyFor(last) : null
    if (!key) {
      await Promise.all([del(GITHUB_CONFIG), del(SYNC_STATE), del(LAST_SYNC), del(ASSET_HASHES)])
      return
    }

    await set(GITHUB_CONFIG, { [key]: config as GitHubConfig })

    const baselines = await get<unknown>(SYNC_STATE)
    if (baselines && typeof baselines === 'object') await set(SYNC_STATE, { [key]: baselines })

    const at = await get<unknown>(LAST_SYNC)
    if (typeof at === 'number') await set(LAST_SYNC, { [key]: at })

    const hashes = await get<unknown>(ASSET_HASHES)
    if (hashes && typeof hashes === 'object') await set(ASSET_HASHES, { [key]: hashes })
  } catch {
    // 옮기지 못해도 쓰던 흐름은 끊지 않습니다. 설정을 다시 넣으면 됩니다.
  }
}
