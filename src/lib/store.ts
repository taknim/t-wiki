import { del, get, set } from 'idb-keyval'
import type { GitHubConfig, SyncState } from '../types'

const VAULT_HANDLE = 'mdwiki:vault-handle'
const GITHUB_CONFIG = 'mdwiki:github-config'
const SYNC_STATE = 'mdwiki:sync-state'
const LAST_SYNC = 'mdwiki:last-sync-at'

/**
 * FileSystemDirectoryHandle 은 구조화 복제가 되므로 IndexedDB 에 그대로 넣어둘 수 있습니다.
 * 다음 방문 때 권한만 다시 확인하면 같은 폴더를 그대로 씁니다.
 */
export const saveVaultHandle = (handle: FileSystemDirectoryHandle) => set(VAULT_HANDLE, handle)
export const loadVaultHandle = () => get<FileSystemDirectoryHandle>(VAULT_HANDLE)
export const clearVaultHandle = () => del(VAULT_HANDLE)

export const saveGitHubConfig = (config: GitHubConfig) => set(GITHUB_CONFIG, config)
export const loadGitHubConfig = () => get<GitHubConfig>(GITHUB_CONFIG)
export const clearGitHubConfig = () => del(GITHUB_CONFIG)

/**
 * 기준점은 동기화 대상마다 따로 둡니다.
 * 저장소·브랜치·하위 폴더가 바뀌면 같은 문서가 다른 경로로 올라가므로,
 * 옛 기준점을 그대로 쓰면 한쪽은 "사라졌다", 다른 쪽은 "처음 본다" 로 잡혀 파일이 복제됩니다.
 */
type SyncStateStore = Record<string, SyncState>

/** 기준점을 몇 벌까지 들고 있을지. 오래된 것부터 버립니다. */
const MAX_BASELINES = 5

export function syncSignature(config: GitHubConfig): string {
  const owner = config.owner.trim().toLowerCase()
  const repo = config.repo.trim().toLowerCase()
  return `${owner}/${repo}@${config.branch.trim()}:${config.basePath.trim()}`
}

/**
 * 예전에는 경로→해시 한 벌만 저장했습니다.
 * 그 모양이면 지금 대상의 기준점으로 옮겨 담아, 쓰던 사람이 처음부터 다시 맞추지 않게 합니다.
 */
function normalize(raw: unknown, signature: string): SyncStateStore {
  if (!raw || typeof raw !== 'object') return {}

  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length === 0) return {}

  const isLegacy = entries.every(([, value]) => typeof value === 'string')
  if (isLegacy) return { [signature]: raw as SyncState }

  const store: SyncStateStore = {}
  for (const [key, value] of entries) {
    if (value && typeof value === 'object') store[key] = value as SyncState
  }
  return store
}

function prune(store: SyncStateStore, keep: string): SyncStateStore {
  const keys = Object.keys(store)
  if (keys.length <= MAX_BASELINES) return store

  // 지금 쓰는 것은 무조건 남기고, 나머지는 오래된 순으로 버립니다.
  const survivors = new Set([keep, ...keys.filter((key) => key !== keep).slice(-(MAX_BASELINES - 1))])
  return Object.fromEntries(Object.entries(store).filter(([key]) => survivors.has(key)))
}

export async function loadSyncState(signature: string): Promise<SyncState> {
  const store = normalize(await get<unknown>(SYNC_STATE), signature)
  return store[signature] ?? {}
}

/** 어떤 대상으로든 동기화한 적이 있는지. 첫 사용과 대상 변경을 구분할 때 씁니다. */
export async function hasAnyBaseline(): Promise<boolean> {
  const store = normalize(await get<unknown>(SYNC_STATE), '')
  return Object.values(store).some((state) => Object.keys(state).length > 0)
}

/** 이 대상으로 동기화한 적이 있는지. 대상이 바뀌었음을 알려 줄 때 씁니다. */
export async function hasSyncState(signature: string): Promise<boolean> {
  const store = normalize(await get<unknown>(SYNC_STATE), signature)
  return Object.keys(store[signature] ?? {}).length > 0
}

export async function saveSyncState(signature: string, state: SyncState): Promise<void> {
  const store = normalize(await get<unknown>(SYNC_STATE), signature)
  store[signature] = state
  await set(SYNC_STATE, prune(store, signature))
}

export const clearSyncState = () => del(SYNC_STATE)

export const saveLastSyncAt = (at: number) => set(LAST_SYNC, at)
export const loadLastSyncAt = () => get<number>(LAST_SYNC)
