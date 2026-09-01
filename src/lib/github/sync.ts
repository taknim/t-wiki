import type { AssetIndex, DocIndex, GitHubConfig, SyncLogLine, SyncPlanItem, SyncState } from '../../types'
import { isAttachment, isMarkdown } from '../attachments'
import * as fs from '../fsAccess'
import { loadAssetHashes, saveAssetHashes } from '../store'
import * as api from './api'
import { displayPath } from '../paths'

/**
 * git 이 파일 내용에 매기는 것과 같은 해시를 계산합니다: sha1("blob <바이트수>\0" + 내용).
 * 이 값이 있으면 수정 시각을 견주지 않고 내용만으로 변경 여부를 판정할 수 있습니다.
 */
export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content)
  const header = new TextEncoder().encode(`blob ${body.length}\0`)
  const payload = new Uint8Array(header.length + body.length)
  payload.set(header)
  payload.set(body, header.length)

  const digest = await crypto.subtle.digest('SHA-1', payload)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 바이트 그대로의 git blob 해시. 첨부는 텍스트가 아니므로 이쪽을 씁니다. */
export async function gitBlobShaBytes(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const payload = new Uint8Array(header.length + bytes.length)
  payload.set(header)
  payload.set(bytes, header.length)

  const digest = await crypto.subtle.digest('SHA-1', payload)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface RemoteSnapshot {
  head: api.HeadInfo | null
  /** 볼트 기준 상대경로 → blob SHA. `.md` 파일만 담습니다. */
  files: Map<string, string>
  /** 저장소가 너무 커서 트리 응답이 잘렸는지. 잘렸다면 동기화하면 안 됩니다. */
  truncated: boolean
}

function toRepoPath(config: GitHubConfig, path: string): string {
  return config.basePath ? `${config.basePath}/${path}` : path
}

function toVaultPath(config: GitHubConfig, repoPath: string): string | null {
  if (!config.basePath) return repoPath
  const prefix = `${config.basePath}/`
  return repoPath.startsWith(prefix) ? repoPath.slice(prefix.length) : null
}

export async function scanRemote(config: GitHubConfig): Promise<RemoteSnapshot> {
  const head = await api.getHead(config)
  if (!head) return { head: null, files: new Map(), truncated: false }

  const { entries, truncated } = await api.getTree(config, head.treeSha)
  const files = new Map<string, string>()

  for (const entry of entries) {
    if (entry.type !== 'blob') continue

    const vaultPath = toVaultPath(config, entry.path)
    if (vaultPath === null) continue
    if (vaultPath.split('/').some((segment) => segment.startsWith('.'))) continue
    // 마크다운과 정해진 첨부 형식만 다룹니다. 저장소에 다른 파일이 있어도 건드리지 않습니다.
    if (!isMarkdown(vaultPath) && !isAttachment(vaultPath)) continue

    files.set(vaultPath, entry.sha)
  }

  return { head, files, truncated }
}

/**
 * 로컬에 있는 동기화 대상 전체의 해시.
 *
 * 첨부는 본문을 메모리에 들고 있지 않아 매번 파일을 읽어야 합니다.
 * 이미지 수십 장을 회차마다 읽으면 느려지므로, 크기와 수정 시각이 그대로면
 * 지난번 해시를 그대로 씁니다.
 */
export async function localShas(
  root: FileSystemDirectoryHandle,
  index: DocIndex,
  assets: AssetIndex,
): Promise<Map<string, string>> {
  const shas = new Map<string, string>()

  for (const entry of index.values()) {
    shas.set(entry.path, await gitBlobSha(entry.content))
  }

  const cache = await loadAssetHashes()
  const next: Record<string, { sha: string; size: number; lastModified: number }> = {}

  for (const asset of assets.values()) {
    if (!asset.syncable) continue

    const cached = cache[asset.path]
    if (cached && cached.size === asset.size && cached.lastModified === asset.lastModified) {
      shas.set(asset.path, cached.sha)
      next[asset.path] = cached
      continue
    }

    const bytes = new Uint8Array(await (await fs.readBinaryFile(root, asset.path)).arrayBuffer())
    const sha = await gitBlobShaBytes(bytes)
    shas.set(asset.path, sha)
    next[asset.path] = { sha, size: asset.size, lastModified: asset.lastModified }
  }

  await saveAssetHashes(next)
  return shas
}

/**
 * 로컬 해시 · 원격 해시 · 마지막으로 합의했던 해시를 3-way 로 비교합니다.
 * 세 값이 모두 내용에서 나온 것이라 시계나 수정 시각에 기대지 않습니다.
 */
/**
 * 이름을 바꾸면 한쪽에서는 사라지고 다른 쪽에서는 새로 생긴 것처럼 보입니다.
 * 그대로 두면 삭제 전파가 꺼져 있을 때 옛 이름이 되살아나 같은 문서가 둘이 됩니다.
 *
 * 내용 해시가 같으면 옮긴 것으로 봅니다. 다만 같은 내용의 파일이 여럿이면
 * 어느 것이 어디로 갔는지 알 수 없으므로, 짝이 하나뿐일 때만 이동으로 처리합니다.
 */
function detectRenames(
  local: Map<string, string>,
  remote: Map<string, string>,
  synced: SyncState,
): Map<string, string> {
  const goneFromLocal = new Map<string, string[]>()
  const newInLocal = new Map<string, string[]>()

  for (const [path, sha] of remote) {
    // 전에 맞춰 본 적 있는 파일만 이동 후보로 봅니다.
    if (!local.has(path) && synced[path]) push(goneFromLocal, sha, path)
  }
  for (const [path, sha] of local) {
    if (!remote.has(path) && !synced[path]) push(newInLocal, sha, path)
  }

  const renames = new Map<string, string>()
  for (const [sha, oldPaths] of goneFromLocal) {
    const newPaths = newInLocal.get(sha)
    if (oldPaths.length === 1 && newPaths?.length === 1) renames.set(oldPaths[0], newPaths[0])
  }
  return renames
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}

export function buildPlan(
  local: Map<string, string>,
  remote: Map<string, string>,
  synced: SyncState,
  config: GitHubConfig,
): SyncPlanItem[] {
  const paths = new Set<string>([...local.keys(), ...remote.keys()])
  const plan: SyncPlanItem[] = []

  const renames = detectRenames(local, remote, synced)
  const movedTo = new Set(renames.values())

  for (const path of [...paths].sort()) {
    const localSha = local.get(path)
    const remoteSha = remote.get(path)
    const base = synced[path]

    if (localSha !== undefined && remoteSha !== undefined) {
      if (localSha === remoteSha) {
        plan.push({ path, action: 'skip', reason: '내용이 같습니다' })
      } else if (base === remoteSha) {
        plan.push({ path, action: 'upload-update', reason: '로컬에서 수정' })
      } else if (base === localSha) {
        plan.push({ path, action: 'download-update', reason: '저장소에서 수정' })
      } else {
        plan.push({
          path,
          action: 'conflict',
          reason: base ? '양쪽 모두 수정되었습니다' : '양쪽 내용이 다르고 동기화 기록이 없습니다',
        })
      }
      continue
    }

    if (localSha !== undefined) {
      if (movedTo.has(path)) {
        plan.push({ path, action: 'upload-new', reason: '이름이 바뀜 → 새 경로로 올림' })
      } else if (base && config.propagateDeletes) {
        plan.push({ path, action: 'delete-local', reason: '저장소에서 삭제됨' })
      } else {
        plan.push({ path, action: 'upload-new', reason: base ? '저장소에서 삭제됨 → 복원' : '로컬에만 있음' })
      }
      continue
    }

    if (remoteSha !== undefined) {
      const movedFrom = renames.get(path)
      if (movedFrom) {
        // 지운 게 아니라 옮긴 것이므로 삭제 전파 설정과 무관하게 옛 경로를 치웁니다.
        plan.push({ path, action: 'delete-remote', reason: `이름이 바뀜 → ${movedFrom} 로 옮김` })
      } else if (base && config.propagateDeletes) {
        plan.push({ path, action: 'delete-remote', reason: '로컬에서 삭제됨' })
      } else {
        plan.push({ path, action: 'download-new', reason: base ? '로컬에서 삭제됨 → 복원' : '저장소에만 있음' })
      }
    }
  }

  return plan
}

function stamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`
}

function conflictPath(path: string): string {
  return `${path.replace(/\.md$/i, '')} (저장소 사본 ${stamp()}).md`
}

/** 무엇을 했는지 갈래. 커밋 글에서 이 차례대로 묶어 보여 줍니다. */
export type StagedKind = 'add' | 'update'

const SECTIONS = [
  { key: 'add', label: '추가', mark: '+' },
  { key: 'update', label: '수정', mark: '~' },
  { key: 'delete', label: '삭제', mark: '-' },
] as const

/**
 * 커밋 글. 첫 줄에 몇 건인지, 그 아래에 갈래별로 무엇인지 적습니다.
 *
 * 예전에는 마크다운만 세고 첨부는 빠뜨렸습니다. 그림 한 장만 올린 회차는
 * 셀 것이 없어 "t-WiKi:" 뒤가 텅 빈 채로 올라갔습니다.
 * 또 올린 것을 모두 "문서"로만 묶어, 새로 만든 것과 고친 것을 가릴 수 없었습니다.
 */
export function commitMessage(staged: Map<string, StagedKind>, deletions: Iterable<string>): string {
  const groups: Record<'add' | 'update' | 'delete', string[]> = {
    add: [],
    update: [],
    delete: [...deletions],
  }
  for (const [path, kind] of staged) groups[kind].push(path)
  for (const list of Object.values(groups)) list.sort()

  const filled = SECTIONS.filter((section) => groups[section.key].length > 0)
  const summary = filled.map((section) => `${section.label} ${groups[section.key].length}건`).join(', ')
  const body = filled
    .map((section) => [
      section.label,
      ...groups[section.key].map((path) => `${section.mark} ${displayPath(path)}`),
    ].join('\n'))
    .join('\n\n')

  return `t-WiKi: ${summary}\n\n${body}\n`
}

export interface ApplyOptions {
  root: FileSystemDirectoryHandle
  config: GitHubConfig
  plan: SyncPlanItem[]
  remote: RemoteSnapshot
  synced: SyncState
  onProgress?: (done: number, total: number, path: string) => void
}

export interface ApplyResult {
  log: SyncLogLine[]
  synced: SyncState
  localChanged: boolean
  commitSha: string | null
  /**
   * 우리가 저장소를 읽은 뒤 다른 쪽이 먼저 올려서 커밋이 거부됐는지.
   * 잘못된 게 아니라 다시 읽고 다시 하면 되는 상황이라 따로 표시합니다.
   */
  staleRemote: boolean
}

export async function applyPlan(options: ApplyOptions): Promise<ApplyResult> {
  const { root, config, plan, remote, onProgress } = options
  const synced: SyncState = { ...options.synced }
  const log: SyncLogLine[] = []
  let localChanged = false

  // 원격 변경은 모아서 커밋 한 번으로 처리합니다.
  // 경로별로 올리면 커밋이 지저분해지고, 도중에 끊겼을 때 절반만 반영된 상태가 남습니다.
  const uploads = new Map<string, string>()
  const binaryUploads = new Map<string, Uint8Array>()
  const deletions = new Set<string>()
  // 올릴 것이 새로 만든 것인지 고친 것인지. 커밋 글을 갈래별로 묶는 데 씁니다.
  const staged = new Map<string, StagedKind>()

  const todo = plan.filter((item) => item.action !== 'skip')
  const totalSteps = todo.length + 1

  // 내용이 같은 짝은 기준점만 새로 기록해 둡니다. 다음 비교가 정확해집니다.
  for (const item of plan) {
    if (item.action !== 'skip') continue
    const sha = remote.files.get(item.path)
    if (sha) synced[item.path] = sha
  }

  const download = async (path: string) => {
    const sha = remote.files.get(path)
    if (!sha) throw new Error('저장소에서 파일 정보를 찾을 수 없습니다.')

    if (isMarkdown(path)) {
      await fs.writeFile(root, path, await api.getBlobText(config, sha))
    } else {
      // 첨부는 텍스트로 옮기면 내용이 깨집니다. 바이트 그대로 씁니다.
      await fs.writeBinaryFile(root, path, await api.getBlobBytes(config, sha))
    }

    synced[path] = sha
    localChanged = true
  }

  const stageUpload = async (path: string, kind: StagedKind) => {
    staged.set(path, kind)
    if (isMarkdown(path)) {
      uploads.set(path, await fs.readFile(root, path))
      return
    }
    const blob = await fs.readBinaryFile(root, path)
    binaryUploads.set(path, new Uint8Array(await blob.arrayBuffer()))
  }

  const resolveConflict = async (path: string) => {
    const sha = remote.files.get(path)
    // 저장소에 없으면 부딪힐 것도 없습니다. 새로 올리는 셈입니다.
    if (!sha) return stageUpload(path, 'add')

    if (config.conflictPolicy === 'remote-wins') return download(path)
    if (config.conflictPolicy === 'local-wins') return stageUpload(path, 'update')

    // keep-both: 저장소 버전을 사본으로 남기고 원래 자리에는 로컬 버전을 올립니다.
    const remoteContent = await api.getBlobText(config, sha)
    await fs.writeFile(root, conflictPath(path), remoteContent)
    localChanged = true
    await stageUpload(path, 'update')
  }

  let done = 0
  for (const item of todo) {
    onProgress?.(done, totalSteps, item.path)
    try {
      switch (item.action) {
        case 'upload-new':
          await stageUpload(item.path, 'add')
          break
        case 'upload-update':
          await stageUpload(item.path, 'update')
          break
        case 'download-new':
        case 'download-update':
          await download(item.path)
          break
        case 'delete-local':
          await fs.removeEntry(root, item.path)
          delete synced[item.path]
          localChanged = true
          break
        case 'delete-remote':
          deletions.add(item.path)
          break
        case 'conflict':
          await resolveConflict(item.path)
          break
      }
      log.push({ path: item.path, action: item.action, status: 'ok', detail: item.reason })
    } catch (cause) {
      log.push({
        path: item.path,
        action: item.action,
        status: 'error',
        detail: cause instanceof Error ? cause.message : String(cause),
      })
    }
    done += 1
  }

  let commitSha: string | null = null
  let staleRemote = false

  if (uploads.size > 0 || binaryUploads.size > 0 || deletions.size > 0) {
    onProgress?.(done, totalSteps, '커밋하는 중')
    try {
      commitSha = await commitChanges(config, remote.head, uploads, binaryUploads, deletions, staged)

      // 커밋된 실제 blob SHA 를 다시 읽어 기준점으로 삼습니다.
      // 직접 계산한 값을 믿는 대신 서버가 저장한 값을 그대로 씁니다.
      const fresh = await scanRemote(config)
      for (const path of [...uploads.keys(), ...binaryUploads.keys()]) {
        const sha = fresh.files.get(path)
        if (sha) synced[path] = sha
      }
      for (const path of deletions) delete synced[path]

      const changed = [...uploads.keys(), ...binaryUploads.keys(), ...deletions]
      for (const path of changed) {
        const line = log.find((entry) => entry.path === path && entry.status === 'ok')
        if (line) line.detail = `${line.detail} · ${commitSha.slice(0, 7)}`
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      staleRemote = /fast forward/i.test(detail)
      for (const line of log) {
        const isRemoteWrite =
          line.status === 'ok' &&
          (uploads.has(line.path) || binaryUploads.has(line.path) || deletions.has(line.path))
        if (isRemoteWrite) {
          line.status = 'error'
          line.detail = `커밋 실패: ${detail}`
        }
      }
    }
  }

  onProgress?.(totalSteps, totalSteps, '')
  return { log, synced, localChanged, commitSha, staleRemote }
}

async function commitChanges(
  config: GitHubConfig,
  head: api.HeadInfo | null,
  uploads: Map<string, string>,
  binaryUploads: Map<string, Uint8Array>,
  deletions: Set<string>,
  staged: Map<string, StagedKind>,
): Promise<string> {
  const changes: api.TreeChange[] = []

  // 업로드는 blob 을 먼저 만들어 SHA 로 참조합니다.
  // 트리에 본문을 직접 넣을 수도 있지만, blob 을 거치면 서버가 매긴 SHA 를 바로 받을 수 있습니다.
  for (const [path, content] of uploads) {
    changes.push({ path: toRepoPath(config, path), sha: await api.createBlob(config, content) })
  }
  for (const [path, bytes] of binaryUploads) {
    changes.push({ path: toRepoPath(config, path), sha: await api.createBinaryBlob(config, bytes) })
  }
  for (const path of deletions) {
    changes.push({ path: toRepoPath(config, path), sha: null })
  }

  const treeSha = await api.createTree(config, changes, head?.treeSha ?? null)
  const commitSha = await api.createCommit(
    config,
    commitMessage(staged, deletions),
    treeSha,
    head?.commitSha ?? null,
  )

  if (head) await api.updateRef(config, commitSha)
  else await api.createRef(config, commitSha)

  return commitSha
}
