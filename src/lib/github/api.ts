import type { GitHubConfig } from '../../types'

const API = 'https://api.github.com'
const BLOB_MODE = '100644'

export interface RepoInfo {
  fullName: string
  defaultBranch: string
  private: boolean
  permissions?: { push?: boolean }
}

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

export interface HeadInfo {
  commitSha: string
  treeSha: string
}

/** 트리에 넣을 변경 한 건. sha 가 null 이면 그 경로를 삭제합니다. */
export interface TreeChange {
  path: string
  sha: string | null
}

interface GitHubError {
  message?: string
  errors?: { message?: string }[]
}

/** 오류 처리를 공유하면서 응답 객체 자체가 필요할 때 씁니다(첨부 내려받기). */
async function rawRequest(
  token: string,
  path: string,
  init: RequestInit = {},
  accept = 'application/vnd.github+json',
): Promise<Response> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as GitHubError
      if (body.message) detail = body.message
      const first = body.errors?.[0]?.message
      if (first) detail += ` (${first})`
    } catch { /* JSON 이 아니면 상태 코드만 씁니다 */ }

    if (response.status === 401) detail = '토큰이 유효하지 않습니다. 다시 발급해 주세요.'
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      detail = 'GitHub 요청 한도를 모두 썼습니다. 한 시간 뒤에 다시 시도해 주세요.'
    }
    throw new Error(`GitHub: ${detail}`)
  }

  return response
}

async function request<T>(
  token: string,
  path: string,
  init: RequestInit = {},
  accept = 'application/vnd.github+json',
): Promise<T> {
  const response = await rawRequest(token, path, init, accept)

  if (accept.includes('raw')) return (await response.text()) as T
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function repoPath(config: GitHubConfig): string {
  return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
}

export async function getViewer(token: string): Promise<{ login: string }> {
  return request<{ login: string }>(token, '/user')
}

export async function listRepos(token: string): Promise<RepoInfo[]> {
  const raw = await request<
    { full_name: string; default_branch: string; private: boolean; permissions?: { push?: boolean } }[]
  >(token, '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member')

  return raw.map((repo) => ({
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    private: repo.private,
    permissions: repo.permissions,
  }))
}

export async function getRepo(config: GitHubConfig): Promise<RepoInfo> {
  const raw = await request<{
    full_name: string
    default_branch: string
    private: boolean
    permissions?: { push?: boolean }
  }>(config.token, repoPath(config))

  return {
    fullName: raw.full_name,
    defaultBranch: raw.default_branch,
    private: raw.private,
    permissions: raw.permissions,
  }
}

export async function listBranches(config: GitHubConfig): Promise<string[]> {
  const raw = await request<{ name: string }[]>(config.token, `${repoPath(config)}/branches?per_page=100`)
  return raw.map((branch) => branch.name)
}

/** 브랜치의 현재 커밋. 저장소가 비어 있거나 브랜치가 없으면 null 입니다. */
export async function getHead(config: GitHubConfig): Promise<HeadInfo | null> {
  try {
    const ref = await request<{ object: { sha: string } }>(
      config.token,
      `${repoPath(config)}/git/ref/heads/${encodeURIComponent(config.branch)}`,
    )
    const commit = await request<{ sha: string; tree: { sha: string } }>(
      config.token,
      `${repoPath(config)}/git/commits/${ref.object.sha}`,
    )
    return { commitSha: commit.sha, treeSha: commit.tree.sha }
  } catch (error) {
    if (error instanceof Error && /Not Found|Git Repository is empty/i.test(error.message)) return null
    throw error
  }
}

/** 커밋 하나의 전체 파일 목록을 한 번의 요청으로 가져옵니다. */
export async function getTree(
  config: GitHubConfig,
  treeSha: string,
): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const raw = await request<{ tree: TreeEntry[]; truncated?: boolean }>(
    config.token,
    `${repoPath(config)}/git/trees/${treeSha}?recursive=1`,
  )
  return { entries: raw.tree ?? [], truncated: raw.truncated === true }
}

/** base64 를 거치지 않고 원본 텍스트를 그대로 받습니다. */
export async function getBlobText(config: GitHubConfig, sha: string): Promise<string> {
  return request<string>(
    config.token,
    `${repoPath(config)}/git/blobs/${sha}`,
    {},
    'application/vnd.github.raw',
  )
}

export async function createBlob(config: GitHubConfig, content: string): Promise<string> {
  const raw = await request<{ sha: string }>(config.token, `${repoPath(config)}/git/blobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, encoding: 'utf-8' }),
  })
  return raw.sha
}

/** 첨부처럼 텍스트가 아닌 내용. base64 로 실어 보냅니다(용량이 4/3 배로 늘어납니다). */
export async function createBinaryBlob(config: GitHubConfig, bytes: Uint8Array): Promise<string> {
  const raw = await request<{ sha: string }>(config.token, `${repoPath(config)}/git/blobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: toBase64(bytes), encoding: 'base64' }),
  })
  return raw.sha
}

/** 한 번에 문자열로 만들면 큰 파일에서 호출 스택이 넘칩니다. 조각내어 이어 붙입니다. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }
  return btoa(binary)
}

/** 첨부를 원본 바이트 그대로 받습니다. 파일에 바로 쓸 수 있도록 ArrayBuffer 로 돌려줍니다. */
export async function getBlobBytes(config: GitHubConfig, sha: string): Promise<ArrayBuffer> {
  const response = await rawRequest(
    config.token,
    `${repoPath(config)}/git/blobs/${sha}`,
    {},
    'application/vnd.github.raw',
  )
  return response.arrayBuffer()
}

export async function createTree(
  config: GitHubConfig,
  changes: TreeChange[],
  baseTreeSha: string | null,
): Promise<string> {
  const body: Record<string, unknown> = {
    tree: changes.map((change) => ({
      path: change.path,
      mode: BLOB_MODE,
      type: 'blob',
      sha: change.sha,
    })),
  }
  if (baseTreeSha) body.base_tree = baseTreeSha

  const raw = await request<{ sha: string }>(config.token, `${repoPath(config)}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return raw.sha
}

export async function createCommit(
  config: GitHubConfig,
  message: string,
  treeSha: string,
  parentSha: string | null,
): Promise<string> {
  const raw = await request<{ sha: string }>(config.token, `${repoPath(config)}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: treeSha, parents: parentSha ? [parentSha] : [] }),
  })
  return raw.sha
}

/**
 * 브랜치를 새 커밋으로 옮깁니다. force 를 쓰지 않으므로,
 * 우리가 트리를 읽은 뒤 누군가 푸시했다면 여기서 거부되고 남의 커밋을 덮지 않습니다.
 */
export async function updateRef(config: GitHubConfig, commitSha: string): Promise<void> {
  await request(config.token, `${repoPath(config)}/git/refs/heads/${encodeURIComponent(config.branch)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commitSha, force: false }),
  })
}

export async function createRef(config: GitHubConfig, commitSha: string): Promise<void> {
  await request(config.token, `${repoPath(config)}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: commitSha }),
  })
}
