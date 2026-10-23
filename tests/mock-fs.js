// 브라우저에 주입할 인메모리 File System Access 목.
// 네이티브 폴더 선택 창은 자동화로 조작할 수 없으므로 피커만 갈아끼우고
// 앱 코드(fsAccess.ts)가 실제로 쓰는 API 표면을 그대로 구현합니다.
window.__installMockFs = function installMockFs() {
  const now = () => Date.now()

  class MemFile {
    constructor(name, data) {
      this.kind = 'file'
      this.name = name
      this._data = data ?? ''
      this._lastModified = now()
    }
    async getFile() {
      return new File([this._data], this.name, { lastModified: this._lastModified })
    }
    async createWritable() {
      const self = this
      // 문자열로 이어 붙이면 바이너리가 망가집니다. 실제 브라우저처럼 조각을 그대로 모읍니다.
      const parts = []
      return {
        write: async (chunk) => { parts.push(chunk) },
        close: async () => {
          /*
           * 실제 디스크는 큰 파일이나 느린 기기에서 한참 걸립니다. 그 사이에 무엇이
           * 되고 안 되는지를 보려면 쓰는 일을 붙잡아 둘 수 있어야 합니다.
           * `window.__slowWrite` 에 밀리초를 넣으면 그만큼 늦게 끝납니다.
           */
          if (window.__slowWrite) await new Promise((done) => setTimeout(done, window.__slowWrite))
          self._data = new Blob(parts)
          self._lastModified = now()
        },
      }
    }
    async queryPermission() { return 'granted' }
    async requestPermission() { return 'granted' }
  }

  /*
   * 폴더 권한 흉내.
   *
   * 진짜 브라우저는 새로 고침 뒤 손잡이는 돌려주되 읽고 쓸 권한은 사람이 눌러야 다시 줍니다.
   * 그 사이를 흉내 내려면 권한이 없을 때 읽기·쓰기가 실제로 막혀야 합니다.
   * `window.__permission` 이 'prompt' 면 막히고, requestPermission 을 부르면 'granted' 가 됩니다.
   */
  window.__permission = window.__permission ?? 'granted'
  const guard = () => {
    if (window.__permission !== 'granted') {
      throw new DOMException('The request is not allowed by the user agent', 'NotAllowedError')
    }
  }

  class MemDir {
    constructor(name) {
      this.kind = 'directory'
      this.name = name
      this._children = new Map()
    }
    /*
     * 맥(APFS)은 이름을 **모아 적든 나눠 적든 같은 것으로 찾습니다.** `나뉜 이름.md` 를
     * 담아 두고 `나뉜 이름.md`(모아 적은 꼴)로 물어도 그 파일을 내어 줍니다. 대신 새로
     * 만들 때는 **준 그대로** 적습니다.
     *
     * 글자 그대로 맞춰 찾도록 두었더니, 자소 분리 이름 합치기가 시험에서만 되고 진짜
     * 맥에서는 "같은 이름이 이미 있습니다" 로 모두 건너뛰었습니다. 여기서 맥처럼 굴어야
     * 그 증상이 시험에 잡힙니다.
     */
    _find(name) {
      if (this._children.has(name)) return this._children.get(name)
      const key = name.normalize('NFC')
      for (const [at, child] of this._children) {
        if (at.normalize('NFC') === key) return child
      }
      return null
    }
    async getDirectoryHandle(name, options) {
      guard()
      let child = this._find(name)
      if (!child) {
        if (!options?.create) throw new DOMException(name + ' not found', 'NotFoundError')
        child = new MemDir(name)
        this._children.set(name, child)
      }
      if (child.kind !== 'directory') throw new DOMException('not a directory', 'TypeMismatchError')
      return child
    }
    async getFileHandle(name, options) {
      guard()
      let child = this._find(name)
      if (!child) {
        if (!options?.create) throw new DOMException(name + ' not found', 'NotFoundError')
        child = new MemFile(name, '')
        this._children.set(name, child)
      }
      if (child.kind !== 'file') throw new DOMException('not a file', 'TypeMismatchError')
      return child
    }
    async removeEntry(name) {
      guard()
      const child = this._find(name)
      if (!child) throw new DOMException(name + ' not found', 'NotFoundError')
      // 담긴 이름으로 지웁니다. 물어본 꼴과 적힌 꼴이 다를 수 있습니다.
      for (const [at, one] of this._children) if (one === child) this._children.delete(at)
    }
    async *entries() {
      guard()
      for (const pair of [...this._children]) yield pair
    }
    async queryPermission() { return window.__permission }
    async requestPermission() {
      window.__permission = 'granted'
      return 'granted'
    }
    async isSameEntry(other) { return other?.name === this.name && other?.kind === this.kind }
    /** 이 폴더 아래에 있으면 경로 조각을, 아니면 null. 실제 브라우저와 같습니다. */
    async resolve(other) {
      const walk = (dir, trail) => {
        for (const [name, child] of dir._children) {
          if (child === other) return [...trail, name]
          if (child.kind === 'directory') {
            const found = walk(child, [...trail, name])
            if (found) return found
          }
        }
        return null
      }
      return walk(this, [])
    }
  }

  const root = new MemDir('내 위키')

  const seed = (path, data) => {
    const segments = path.split('/')
    const name = segments.pop()
    let dir = root
    for (const segment of segments) {
      if (!dir._children.has(segment)) dir._children.set(segment, new MemDir(segment))
      dir = dir._children.get(segment)
    }
    dir._children.set(name, new MemFile(name, data))
  }

  seed('개발 환경.md', '# 개발 환경\n\nNode 20 과 pnpm 을 씁니다.\n\n[[온보딩]] 으로 돌아가기\n')
  seed('회사/온보딩.md', '# 온보딩\n\n첫 주에는 [[개발 환경]] 부터 맞춰 주세요.\n')
  seed('회사/휴가 정책.md', '# 휴가 정책\n\n연차는 15일입니다.\n')
  seed('회고/2026-08.md', '# 2026년 8월 회고\n\n- [x] 위키 도입\n')
  seed('첨부/도표.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60">' +
    '<rect width="120" height="60" fill="#2f6feb"/></svg>')

  window.showDirectoryPicker = async () => root
  window.__mockRoot = root

  /*
   * 저장소에 넣어 둔 손잡이 되살리기.
   *
   * 진짜 손잡이는 IndexedDB 에 넣었다 꺼내도 그대로지만, 이 흉내는 꺼내면 메서드를 잃은
   * 빈 껍데기가 됩니다. 앱이 손잡이를 꺼내는 자리(`mdwiki:vault-handle`)만 가로채,
   * 무언가 저장되어 있었으면 지금 살아 있는 뿌리를 대신 돌려줍니다. 새로 고침 뒤에
   * "다시 열기" 로 이어지는 길을 시험할 수 있습니다.
   * 원하는 묶음만 켭니다(`window.__restoreHandle = true`). 다른 묶음들은 새로 고침 뒤
   * "폴더 열기" 화면에서 다시 시작하는 것을 전제로 짜여 있습니다.
   */
  const nativeGet = IDBObjectStore.prototype.get
  const resultOf = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get
  IDBObjectStore.prototype.get = function (key) {
    const request = nativeGet.call(this, key)
    if (key === 'mdwiki:vault-handle' && window.__restoreHandle) {
      Object.defineProperty(request, 'result', {
        get: () => (resultOf.call(request) ? window.__mockRoot : undefined),
      })
    }
    return request
  }

  /** 볼트 안 파일의 내용. 앱이 정말 그 자리에 그 내용을 썼는지 볼 때 씁니다. */
  window.__vaultText = async (path) => {
    const segments = path.split('/')
    const name = segments.pop()
    let dir = root
    for (const segment of segments) {
      dir = dir._children.get(segment)
      if (!dir || dir.kind !== 'directory') return null
    }
    const handle = dir._children.get(name)
    return handle && handle.kind === 'file' ? (await handle.getFile()).text() : null
  }

  /*
   * 저장 창. 네이티브 창은 자동화로 만질 수 없어 여기서 갈아끼웁니다.
   * 기본은 볼트 밖의 딴 폴더에 씁니다. __saveInto 를 'vault' 로 두면 볼트 안에
   * 저장하는 길을, __saveCancel 로는 창을 그냥 닫는 경우를 시험할 수 있습니다.
   */
  const savedDir = new MemDir('저장한 곳')
  window.__saveInto = 'outside'
  window.__saveCancel = false
  window.showSaveFilePicker = async (options) => {
    if (window.__saveCancel) throw new DOMException('사용자가 닫음', 'AbortError')
    const dir = window.__saveInto === 'vault' ? window.__mockRoot : savedDir
    return dir.getFileHandle(options?.suggestedName ?? '설정.json', { create: true })
  }
  window.__savedNames = () => [...savedDir._children.keys()]
  window.__savedText = async (name) => {
    const handle = savedDir._children.get(name)
    return handle ? (await handle.getFile()).text() : null
  }
  /*
   * 저장한 파일의 크기. **셈이 아니라 기다림에 씁니다.**
   *
   * `waitForFunction` 에 비동기 함수를 주면 돌려받은 약속 자체를 참으로 쳐서 첫 번째
   * 재는 자리에서 곧바로 통과합니다. 그래서 다 쓰이기를 기다리는 자리에는 **동시에 재는**
   * 손이 있어야 합니다. 없는 파일은 -1, 이름만 잡아 둔 빈 껍데기는 0 입니다.
   */
  window.__savedSize = (name) => {
    const handle = savedDir._children.get(name)
    if (!handle) return -1
    return handle._data?.size ?? handle._data?.length ?? 0
  }
  /*
   * 저장한 PDF 를 들여다봅니다.
   *
   * 글로 읽으면 안엣것이 깨지므로 바이트로 받아 한 글자씩 옮깁니다. 통째로 넘기면
   * 메가바이트짜리 글이 되어 느려지니, 여기서 보고 셈만 넘깁니다.
   * 쪽 꾸러미(`/Type /Page`)와 쪽 크기(`/MediaBox`)는 압축하지 않고 그대로 적힙니다.
   */
  const readPdf = async (handle) => {
    if (!handle) return null
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return {
      size: bytes.length,
      head: text.slice(0, 8),
      pages: (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length,
      /* 쪽 크기는 소수 자리를 길게 적어 둡니다(595.2799999…). 둘째 자리로 끊어 봅니다. */
      boxes: [...new Set((text.match(/\/MediaBox\s*\[[^\]]*\]/g) ?? []).map((one) =>
        JSON.stringify((one.match(/[\d.]+/g) ?? []).map((size) => Math.round(Number(size) * 100) / 100))))]
        .map((one) => JSON.parse(one)),
    }
  }
  window.__savedPdf = (name) => readPdf(savedDir._children.get(name))
  /*
   * 폴더 안에 만들어진 PDF. 그림 수정 화면은 저장 창을 거치지 않고 **원본 옆에** 만들므로
   * 저장 창이 받아 둔 것(savedDir)에는 없습니다.
   */
  window.__vaultPdf = (name) => readPdf(window.__mockRoot._children.get(name))
}
