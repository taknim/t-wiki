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
  const parents = new Map()   // sha -> 부모 커밋 이름(없으면 null)
  let head = null
  let counter = 0
  let failNext = null
  let slow = 0
  /*
   * 가지 끝을 **뒤처진 채로** 돌려줄 남은 횟수와 그때 돌려줄 값.
   *
   * 진짜 GitHub 은 쓴 직후의 읽기가 복제본에서 나와 옛 커밋을 돌려줄 수 있습니다.
   * 그 위에 커밋을 쌓으면 non-fast-forward 로 거절당합니다. 실제로 겪은 고장이라
   * 흉내 낼 수 있어야 합니다(2026-11-18, 커밋 두 회차가 잇달아 거절됨).
   */
  let staleLeft = 0
  let staleSha = null
  /** 다음 한 번의 가지 옮기기를 빨리 감기가 아니라고 거절할지. 진짜 끼어듦을 흉내 냅니다. */
  let refuseRefOnce = false

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
    parents.set(commitSha, head)
    head = commitSha
  }

  /** `from` 에서 부모를 거슬러 올라가 `target` 을 만나는지. 빨리 감기인지 가리는 데 씁니다. */
  const reaches = (from, target) => {
    let at = from
    while (at) {
      if (at === target) return true
      at = parents.get(at) ?? null
    }
    return false
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
      // 뒤처진 답을 돌려주기로 해 두었으면 그동안 옛 커밋을 내놓습니다.
      if (staleLeft > 0) {
        staleLeft -= 1
        return reply(json({ object: { sha: staleSha } }))
      }
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
      parents.set(sha, body.parents?.[0] ?? null)
      return reply(json({ sha, message: body.message }))
    }
    if (path.includes('/git/refs/heads') && method === 'PATCH') {
      const body = JSON.parse(request.postData())
      /*
       * **빨리 감기가 아니면 거절합니다.** 진짜 GitHub 과 같은 말로 돌려줍니다.
       * 그냥 받아 주면, 낡은 커밋 위에 쌓아 올려 남의 커밋을 지우는 회차도
       * 시험에서는 멀쩡히 통과합니다.
       */
      if (refuseRefOnce) {
        refuseRefOnce = false
        return reply(json({ message: 'Update is not a fast forward' }, 422))
      }
      if (head && !reaches(body.sha, head)) {
        return reply(json({ message: 'Update is not a fast forward' }, 422))
      }
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
    /**
     * 가지 끝 읽기를 `times` 번 **뒤처진 채로** 돌려줍니다(지금 끝의 부모를 내놓습니다).
     * 쓴 직후의 읽기가 복제본에서 나오는 진짜 GitHub 을 흉내 냅니다.
     */
    staleReads(times) {
      /*
       * 앞 커밋이 없으면 **멈춥니다.** 지금 끝으로 슬쩍 떨어뜨렸더니 뒤처진 답이 사실은
       * 맞는 답이어서, 아무것도 지키지 않는 시험이 멀쩡히 통과했습니다.
       */
      const parent = parents.get(head) ?? null
      if (!parent) throw new Error('뒤처진 답으로 내놓을 앞 커밋이 없습니다. 커밋을 두 번 쌓은 뒤에 거세요.')
      staleLeft = times
      staleSha = parent
    },
    /** 지금 끝의 부모. 뒤처진 답으로 무엇이 나갈지 견줄 때 씁니다. */
    get parentSha() { return parents.get(head) ?? null },
    /**
     * 다음 한 번의 가지 옮기기를 거절합니다. 우리가 읽은 뒤 **다른 쪽이 먼저 올린** 경우와
     * 같은 답(422 Update is not a fast forward)을 돌려줍니다.
     */
    refuseNextRefUpdate() { refuseRefOnce = true },
    lastAuth() { return lastAuth },
    setSlow(ms) { slow = ms },
  }
}
