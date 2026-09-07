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
        close: async () => { self._data = new Blob(parts); self._lastModified = now() },
      }
    }
    async queryPermission() { return 'granted' }
    async requestPermission() { return 'granted' }
  }

  class MemDir {
    constructor(name) {
      this.kind = 'directory'
      this.name = name
      this._children = new Map()
    }
    async getDirectoryHandle(name, options) {
      let child = this._children.get(name)
      if (!child) {
        if (!options?.create) throw new DOMException(name + ' not found', 'NotFoundError')
        child = new MemDir(name)
        this._children.set(name, child)
      }
      if (child.kind !== 'directory') throw new DOMException('not a directory', 'TypeMismatchError')
      return child
    }
    async getFileHandle(name, options) {
      let child = this._children.get(name)
      if (!child) {
        if (!options?.create) throw new DOMException(name + ' not found', 'NotFoundError')
        child = new MemFile(name, '')
        this._children.set(name, child)
      }
      if (child.kind !== 'file') throw new DOMException('not a file', 'TypeMismatchError')
      return child
    }
    async removeEntry(name) {
      if (!this._children.has(name)) throw new DOMException(name + ' not found', 'NotFoundError')
      this._children.delete(name)
    }
    async *entries() {
      for (const pair of [...this._children]) yield pair
    }
    async queryPermission() { return 'granted' }
    async requestPermission() { return 'granted' }
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
}
