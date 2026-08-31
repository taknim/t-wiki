import type { DocIndex, GitHubConfig, SyncLogLine, SyncPlanItem, SyncState } from '../../types'
import * as fs from '../fsAccess'
import * as api from './api'

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
    if (!entry.path.toLowerCase().endsWith('.md')) continue

    const vaultPath = toVaultPath(config, entry.path)
    if (vaultPath === null) continue
    if (vaultPath.split('/').some((segment) => segment.startsWith('.'))) continue

    files.set(vaultPath, entry.sha)
  }

  return { head, files, truncated }
}

export async function localShas(index: DocIndex): Promise<Map<string, string>> {
  const shas = new Map<string, string>()
  for (const entry of index.values()) {
    shas.set(entry.path, await gitBlobSha(entry.content))
  }
  return shas
}

/**
 * 로컬 해시 · 원격 해시 · 마지막으로 합의했던 해시를 3-way 로 비교합니다.
 * 세 값이 모두 내용에서 나온 것이라 시계나 수정 시각에 기대지 않습니다.
 */
export function buildPlan(
  local: Map<string, string>,
  remote: Map<string, string>,
  synced: SyncState,
  config: GitHubConfig,
): SyncPlanItem[] {
  const paths = new Set<string>([...local.keys(), ...remote.keys()])
  const plan: SyncPlanItem[] = []

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
      if (base && config.propagateDeletes) {
        plan.push({ path, action: 'delete-local', reason: '저장소에서 삭제됨' })
      } else {
        plan.push({ path, action: 'upload-new', reason: base ? '저장소에서 삭제됨 → 복원' : '로컬에만 있음' })
      }
      continue
    }

    if (remoteSha !== undefined) {
      if (base && config.propagateDeletes) {
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

function commitMessage(uploads: string[], deletions: string[]): string {
  const parts: string[] = []
  if (uploads.length > 0) parts.push(`문서 ${uploads.length}건`)
  if (deletions.length > 0) parts.push(`삭제 ${deletions.length}건`)

  const body = [
    ...uploads.map((path) => `+ ${path}`),
    ...deletions.map((path) => `- ${path}`),
  ].join('\n')

  return `mdwiki: ${parts.join(', ')}\n\n${body}`
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
}

export async function applyPlan(options: ApplyOptions): Promise<ApplyResult> {
  const { root, config, plan, remote, onProgress } = options
  const synced: SyncState = { ...options.synced }
  const log: SyncLogLine[] = []
  let localChanged = false

  // 원격 변경은 모아서 커밋 한 번으로 처리합니다.
  // 경로별로 올리면 커밋이 지저분해지고, 도중에 끊겼을 때 절반만 반영된 상태가 남습니다.
  const uploads = new Map<string, string>()
  const deletions = new Set<string>()

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
    const content = await api.getBlobText(config, sha)
    await fs.writeFile(root, path, content)
    synced[path] = sha
    localChanged = true
  }

  const stageUpload = async (path: string) => {
    uploads.set(path, await fs.readFile(root, path))
  }

  const resolveConflict = async (path: string) => {
    const sha = remote.files.get(path)
    if (!sha) return stageUpload(path)

    if (config.conflictPolicy === 'remote-wins') return download(path)
    if (config.conflictPolicy === 'local-wins') return stageUpload(path)

    // keep-both: 저장소 버전을 사본으로 남기고 원래 자리에는 로컬 버전을 올립니다.
    const remoteContent = await api.getBlobText(config, sha)
    await fs.writeFile(root, conflictPath(path), remoteContent)
    localChanged = true
    await stageUpload(path)
  }

  let done = 0
  for (const item of todo) {
    onProgress?.(done, totalSteps, item.path)
    try {
      switch (item.action) {
        case 'upload-new':
        case 'upload-update':
          await stageUpload(item.path)
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

  if (uploads.size > 0 || deletions.size > 0) {
    onProgress?.(done, totalSteps, '커밋하는 중')
    try {
      commitSha = await commitChanges(config, remote.head, uploads, deletions)

      // 커밋된 실제 blob SHA 를 다시 읽어 기준점으로 삼습니다.
      // 직접 계산한 값을 믿는 대신 서버가 저장한 값을 그대로 씁니다.
      const fresh = await scanRemote(config)
      for (const path of uploads.keys()) {
        const sha = fresh.files.get(path)
        if (sha) synced[path] = sha
      }
      for (const path of deletions) delete synced[path]

      const changed = [...uploads.keys(), ...deletions]
      for (const path of changed) {
        const line = log.find((entry) => entry.path === path && entry.status === 'ok')
        if (line) line.detail = `${line.detail} · ${commitSha.slice(0, 7)}`
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      for (const line of log) {
        const isRemoteWrite =
          line.status === 'ok' &&
          (uploads.has(line.path) || deletions.has(line.path))
        if (isRemoteWrite) {
          line.status = 'error'
          line.detail = `커밋 실패: ${detail}`
        }
      }
    }
  }

  onProgress?.(totalSteps, totalSteps, '')
  return { log, synced, localChanged, commitSha }
}

async function commitChanges(
  config: GitHubConfig,
  head: api.HeadInfo | null,
  uploads: Map<string, string>,
  deletions: Set<string>,
): Promise<string> {
  const changes: api.TreeChange[] = []

  // 업로드는 blob 을 먼저 만들어 SHA 로 참조합니다.
  // 트리에 본문을 직접 넣을 수도 있지만, blob 을 거치면 서버가 매긴 SHA 를 바로 받을 수 있습니다.
  for (const [path, content] of uploads) {
    changes.push({ path: toRepoPath(config, path), sha: await api.createBlob(config, content) })
  }
  for (const path of deletions) {
    changes.push({ path: toRepoPath(config, path), sha: null })
  }

  const treeSha = await api.createTree(config, changes, head?.treeSha ?? null)
  const commitSha = await api.createCommit(
    config,
    commitMessage([...uploads.keys()], [...deletions]),
    treeSha,
    head?.commitSha ?? null,
  )

  if (head) await api.updateRef(config, commitSha)
  else await api.createRef(config, commitSha)

  return commitSha
}
