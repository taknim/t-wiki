import { createHash } from 'node:crypto'

/*
 * 블롭 이름은 진짜 git 방식으로 매깁니다.
 * 아무 번호나 붙이면 앱이 로컬에서 계산한 해시와 절대 같아질 수 없어,
 * 내용이 그대로여도 늘 "바뀌었다" 로 잡힙니다. 그러면 기준점이 살아 있는지를
 * 시험으로 가릴 수 없습니다.
 */
const gitSha = (bytes) =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex')

// 가짜 GitHub Git Data API. 트리·블롭·커밋·ref 를 메모리에 들고 있습니다.
export function createGitHubMock() {
  const blobs = new Map()     // sha -> content
  const trees = new Map()     // sha -> Map(path -> blobSha)
  const commits = new Map()   // sha -> treeSha
  let head = null
  let counter = 0
  let failNext = null
  let slow = 0

  const nextSha = (kind) => `${kind}${String(++counter).padStart(38, '0')}`
  const json = (body, status = 200) => ({ status, body: JSON.stringify(body) })

  const currentTree = () => (head ? trees.get(commits.get(head)) ?? new Map() : new Map())

  function seed(files) {
    const tree = new Map()
    for (const [path, content] of Object.entries(files)) {
      const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
      const sha = gitSha(bytes)
      blobs.set(sha, bytes)
      tree.set(path, sha)
    }
    const treeSha = nextSha('t')
    trees.set(treeSha, tree)
    const commitSha = nextSha('c')
    commits.set(commitSha, treeSha)
    head = commitSha
  }

  // 마지막 요청에 실린 인증 머리글. 봉해 둔 토큰이 제대로 풀려 실리는지 볼 때 씁니다.
  let lastAuth = null

  const handler = async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    lastAuth = request.headers()['authorization'] ?? null
    if (slow > 0) await new Promise((done) => setTimeout(done, slow))

    if (failNext) {
      const { status, message } = failNext
      failNext = null
      return route.fulfill({ ...json({ message }, status), contentType: 'application/json' })
    }

    const reply = (out) => route.fulfill({ ...out, contentType: 'application/json' })
    const raw = (bytes) =>
      route.fulfill({ status: 200, body: bytes, contentType: 'application/vnd.github.raw' })

    if (path === '/user') return reply(json({ login: 'tester' }))
    // 토큰 확인 단추가 부르는 저장소 목록. 하나만 돌려주면 됩니다.
    if (path === '/user/repos') {
      return reply(json([{ full_name: 'tester/wiki', default_branch: 'main', private: true,
        permissions: { push: true } }]))
    }
    if (path.startsWith('/repos/') && path.split('/').length === 4) {
      return reply(json({ full_name: 'tester/wiki', default_branch: 'main', private: true,
        permissions: { push: true } }))
    }
    if (path.includes('/branches')) return reply(json([{ name: 'main' }]))

    if (path.includes('/git/ref/heads/')) {
      if (!head) return reply(json({ message: 'Not Found' }, 404))
      return reply(json({ object: { sha: head } }))
    }
    if (path.includes('/git/commits/') && method === 'GET') {
      const sha = path.split('/').pop()
      return reply(json({ sha, tree: { sha: commits.get(sha) } }))
    }
    if (path.includes('/git/trees/') && method === 'GET') {
      const sha = path.split('/').pop().split('?')[0]
      const tree = trees.get(sha) ?? new Map()
      return reply(json({
        tree: [...tree].map(([p, s]) => ({ path: p, type: 'blob', sha: s, size: 1 })),
        truncated: false,
      }))
    }
    if (path.includes('/git/blobs/') && method === 'GET') {
      const sha = path.split('/').pop()
      return raw(blobs.get(sha) ?? Buffer.alloc(0))
    }
    if (path.endsWith('/git/blobs') && method === 'POST') {
      const body = JSON.parse(request.postData())
      const bytes = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')
      const sha = gitSha(bytes)
      blobs.set(sha, bytes)
      return reply(json({ sha }))
    }
    if (path.endsWith('/git/trees') && method === 'POST') {
      const body = JSON.parse(request.postData())
      const base = body.base_tree ? new Map(trees.get(body.base_tree)) : new Map()
      for (const change of body.tree) {
        if (change.sha === null) base.delete(change.path)
        else base.set(change.path, change.sha)
      }
      const sha = nextSha('t')
      trees.set(sha, base)
      return reply(json({ sha }))
    }
    if (path.endsWith('/git/commits') && method === 'POST') {
      const body = JSON.parse(request.postData())
      const sha = nextSha('c')
      commits.set(sha, body.tree)
      return reply(json({ sha, message: body.message }))
    }
    if (path.includes('/git/refs/heads') && method === 'PATCH') {
      const body = JSON.parse(request.postData())
      head = body.sha
      return reply(json({ object: { sha: head } }))
    }
    if (path.endsWith('/git/refs') && method === 'POST') {
      const body = JSON.parse(request.postData())
      head = body.sha
      return reply(json({ object: { sha: head } }))
    }

    return reply(json({ message: `가짜 서버가 모르는 요청: ${method} ${path}` }, 501))
  }

  return {
    handler,
    seed,
    currentFiles() {
      const out = {}
      for (const [p, s] of currentTree()) out[p] = blobs.get(s)?.toString('utf8') ?? ''
      return out
    },
    get commitCount() { return commits.size },
    /** 지금 가지 끝에 있는 커밋 이름. 화면에 보이는 커밋 이름과 견주는 데 씁니다. */
    get headSha() { return head },
    failOnce(status, message) { failNext = { status, message } },
    lastAuth() { return lastAuth },
    setSlow(ms) { slow = ms },
  }
}
