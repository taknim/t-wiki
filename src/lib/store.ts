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

export const saveSyncState = (state: SyncState) => set(SYNC_STATE, state)
export const loadSyncState = async (): Promise<SyncState> => (await get<SyncState>(SYNC_STATE)) ?? {}
export const clearSyncState = () => del(SYNC_STATE)

export const saveLastSyncAt = (at: number) => set(LAST_SYNC, at)
export const loadLastSyncAt = () => get<number>(LAST_SYNC)
