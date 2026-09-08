export type NodeKind = 'file' | 'dir'

/** 볼트(로컬 폴더) 안의 파일 또는 폴더 한 개. path 는 볼트 루트 기준 상대경로이고 구분자는 항상 '/'. */
export interface VaultNode {
  kind: NodeKind
  name: string
  path: string
  children?: VaultNode[]
  lastModified?: number
  size?: number
}

/** 메모리에 올려둔 문서 본문. 검색·백링크·위키링크 해석이 전부 이 인덱스를 씁니다. */
export interface DocEntry {
  path: string
  content: string
  lastModified: number
}

export type DocIndex = Map<string, DocEntry>

/** 마크다운이 아닌 파일 하나. 본문은 필요할 때만 읽습니다. */
export interface AssetEntry {
  path: string
  size: number
  lastModified: number
  /** 동기화 대상인지. 형식이 맞고 크기 제한을 넘지 않아야 합니다. */
  syncable: boolean
}

/** 경로 → 첨부 정보. */
export type AssetIndex = Map<string, AssetEntry>

export interface SearchHit {
  path: string
  /** 폴더인지 파일인지. 아이콘과 여는 방식이 갈립니다. */
  kind: 'dir' | 'file'
  title: string
  /** 매치 주변 발췌. <mark> 를 쓰지 않고 조각으로 나눠 React 에서 직접 렌더합니다. */
  snippet: { text: string; hit: boolean }[]
  score: number
}

/**
 * 마지막으로 로컬과 원격이 같았던 시점의 blob SHA.
 * git 은 내용으로 해시를 만들기 때문에 이 값 하나로 3-way 비교가 됩니다.
 * (수정 시각을 견주지 않으므로 시계 오차를 신경 쓸 필요가 없습니다.)
 */
export type SyncState = Record<string, string>

export type ConflictPolicy = 'keep-both' | 'local-wins' | 'remote-wins'

/** 마지막으로 저장소에 올린 커밋. 설정 창에서 그 커밋으로 가는 길을 냅니다. */
export interface LastCommit {
  sha: string
  /** 그 커밋을 올린 때. 마지막 동기화 시각과 다를 수 있습니다. */
  at: number
}

export interface GitHubConfig {
  /** fine-grained personal access token. 브라우저 IndexedDB 에만 보관됩니다. */
  token: string
  owner: string
  repo: string
  branch: string
  /** 저장소 안에서 위키로 쓸 하위 폴더. 빈 문자열이면 저장소 루트. */
  basePath: string
  conflictPolicy: ConflictPolicy
  propagateDeletes: boolean
  /** 켜면 일정 간격으로 알아서 동기화합니다. */
  autoSync: boolean
  /** 자동 동기화 간격(분). */
  autoSyncMinutes: number
}

export type SyncAction =
  | 'upload-new' | 'upload-update'
  | 'download-new' | 'download-update'
  | 'delete-local' | 'delete-remote'
  | 'conflict' | 'skip'

export interface SyncPlanItem {
  path: string
  action: SyncAction
  reason: string
}

export interface SyncLogLine {
  path: string
  action: SyncAction
  status: 'ok' | 'error'
  detail?: string
}

/**
 * 지난 동기화 한 회차의 자취. 폴더마다 100건까지 남깁니다.
 *
 * 결과 전체가 아니라 남길 만한 것만 담습니다. 계획은 이미 벌어진 일이 아니라
 * 벌어질 뻔한 일이라 지난 기록에서는 뜻이 옅고, 회차마다 안고 있으면 자리만 먹습니다.
 */
export interface SyncRun {
  at: number
  trigger: 'manual' | 'auto'
  commitSha: string | null
  error: string | null
  log: SyncLogLine[]
  /** 너무 길어 잘라낸 줄 수. 0 이면 그대로 남겼습니다. */
  cut: number
}

/** 문서를 원문만, 나란히, 결과만 중 어떻게 보여 줄지. */
export type ViewMode = 'edit' | 'split' | 'preview'

/** 옆줄에 즐겨찾기와 폴더 트리 중 어느 쪽을 펴 두었는지. */
export type SidebarTab = 'favorites' | 'tree'
