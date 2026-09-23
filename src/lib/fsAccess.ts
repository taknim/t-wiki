import type { AssetIndex, DocIndex, VaultNode } from '../types'
import { isAttachment, isMarkdown, isSyncable } from './attachments'
import { isAppFile, TRASH_DIR } from './paths'

/** 볼트 안에서 무시할 이름들. 점으로 시작하는 항목은 전부 별도로 걸러냅니다. */
// 휴지통은 앱이 따로 읽습니다. 여기서 훑으면 지운 것이 트리·검색·동기화에 되살아납니다.
const IGNORED = new Set(['node_modules', 'Icon\r', TRASH_DIR])

export function isSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function pickVault(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker({ id: 'mdwiki-vault', mode: 'readwrite' })
}

export async function ensurePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  const desc = { mode }
  if ((await handle.queryPermission(desc)) === 'granted') return true
  return (await handle.requestPermission(desc)) === 'granted'
}

function splitPath(path: string): { segments: string[]; name: string } {
  const segments = path.split('/').filter(Boolean)
  const name = segments.pop()
  if (!name) throw new Error(`잘못된 경로입니다: "${path}"`)
  return { segments, name }
}

async function resolveDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let cur = root
  for (const segment of segments) cur = await cur.getDirectoryHandle(segment, { create })
  return cur
}

function sortNodes(nodes: VaultNode[]): VaultNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'ko')
  })
}

/**
 * 볼트 전체를 훑어 트리, 문서 본문 인덱스, 첨부 파일 위치를 한 번에 만듭니다.
 * 마크다운이 아닌 파일은 본문을 읽지 않고 경로만 기억해 둡니다.
 */
/**
 * 폴더를 훑어 트리와 색인을 만듭니다.
 *
 * `onCount` 를 주면 몇 개까지 읽었는지 알려 줍니다. 파일이 많은 폴더는 여는 데
 * 한참 걸리는데, 그동안 화면이 비어 있으면 빈 폴더를 연 것처럼 보입니다.
 * 너무 잦게 알리면 그리는 일이 읽는 일보다 무거워지므로 뭉텅이로 셉니다.
 */
/**
 * 폴더를 통째로 훑습니다.
 *
 * `previous` 를 주면 **크기와 수정 시각이 그대로인 문서는 본문을 다시 읽지 않고**
 * 지난 색인의 것을 그대로 씁니다. 파일을 하나 넣거나 이름을 바꿀 때마다 수백 개의
 * 본문을 도로 읽으면, 특히 손전화에서는 목록이 한참 뒤에야 바뀝니다.
 * 바뀐 것을 놓칠 수는 없습니다. 크기나 시각이 하나라도 다르면 다시 읽습니다.
 */
export async function scanVault(
  root: FileSystemDirectoryHandle,
  onCount?: (read: number) => void,
  previous?: DocIndex,
): Promise<{ tree: VaultNode; index: DocIndex; assets: AssetIndex }> {
  const index: DocIndex = new Map()
  const assets: AssetIndex = new Map()
  const tree: VaultNode = { kind: 'dir', name: root.name, path: '', children: [] }
  const tally = { read: 0, told: 0 }
  await walk(root, '', tree, index, assets, onCount ? tally : null, onCount, previous)
  onCount?.(tally.read)
  return { tree, index, assets }
}

/** 이만큼 읽을 때마다 한 번씩 알립니다. */
const COUNT_STEP = 50

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  node: VaultNode,
  index: DocIndex,
  assets: AssetIndex,
  tally: { read: number; told: number } | null,
  onCount?: (read: number) => void,
  previous?: DocIndex,
): Promise<void> {
  const children: VaultNode[] = []
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.') || IGNORED.has(name)) continue
    const path = prefix ? `${prefix}/${name}` : name

    if (tally) {
      tally.read += 1
      if (tally.read - tally.told >= COUNT_STEP) {
        tally.told = tally.read
        onCount?.(tally.read)
      }
    }

    if (handle.kind === 'directory') {
      const child: VaultNode = { kind: 'dir', name, path, children: [] }
      await walk(handle as FileSystemDirectoryHandle, path, child, index, assets, tally, onCount, previous)
      children.push(child)
      continue
    }

    const file = await (handle as FileSystemFileHandle).getFile()

    if (isMarkdown(name)) {
      const known = previous?.get(path)
      const content = known && known.lastModified === file.lastModified && known.size === file.size
        ? known.content
        : await file.text()
      index.set(path, { path, content, lastModified: file.lastModified, size: file.size })
      children.push({ kind: 'file', name, path, lastModified: file.lastModified, size: file.size })
      continue
    }

    // 첨부는 본문을 읽지 않습니다. 이미지 수십 장을 매번 읽으면 폴더 열기가 느려집니다.
    assets.set(path, {
      path,
      size: file.size,
      lastModified: file.lastModified,
      syncable: isSyncable(path, file.size),
    })

    // 아는 형식만 트리에 보여 줍니다. 그래야 목록이 잡동사니로 넘치지 않습니다.
    // 앱이 두는 살림 파일은 목록에서 빼되, 위 assets 에는 남아 동기화는 됩니다.
    if (isAttachment(name) && !isAppFile(path)) {
      children.push({ kind: 'file', name, path, lastModified: file.lastModified, size: file.size })
    }
  }
  node.children = sortNodes(children)
}

export async function readFile(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const { segments, name } = splitPath(path)
  const dir = await resolveDir(root, segments)
  const handle = await dir.getFileHandle(name)
  return (await handle.getFile()).text()
}

/** 파일을 쓰고 기록 후의 실제 mtime 을 돌려줍니다. 동기화 기준점 계산에 필요합니다. */
export async function writeFile(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string,
  expectMtime?: number,
): Promise<number> {
  const { segments, name } = splitPath(path)
  const dir = await resolveDir(root, segments, true)
  const handle = await dir.getFileHandle(name, { create: true })

  /*
   * 밖에서 고쳐진 파일을 모르고 덮어쓰지 않습니다.
   *
   * 브라우저는 파일이 바뀌었다고 알려 주지 않습니다. 같은 문서를 다른 편집기로
   * 고치는 사이 여기서 한 글자만 쳐도 자동 저장이 그 수정을 지워 버립니다.
   * 마지막으로 읽거나 쓴 시각을 받아, 쓰기 직전에 디스크의 시각과 견줍니다.
   */
  if (expectMtime !== undefined) {
    const now = (await handle.getFile()).lastModified
    if (now !== expectMtime) throw new ExternalChangeError(path, now)
  }

  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
  return (await handle.getFile()).lastModified
}

/** 쓰려던 파일이 그 사이 밖에서 바뀌어 있었습니다. 부르는 쪽에서 물어보고 정합니다. */
export class ExternalChangeError extends Error {
  readonly path: string
  /** 디스크에 적힌 지금 시각. */
  readonly mtime: number

  constructor(path: string, mtime: number) {
    super(`"${path}" 이(가) 밖에서 바뀌었습니다.`)
    this.name = 'ExternalChangeError'
    this.path = path
    this.mtime = mtime
  }
}

export async function createDir(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  await resolveDir(root, path.split('/').filter(Boolean), true)
}

export async function exists(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  return (await entryKind(root, path)) !== null
}

export async function entryKind(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<'file' | 'dir' | null> {
  if (!path) return 'dir'
  const { segments, name } = splitPath(path)
  let dir: FileSystemDirectoryHandle
  try {
    dir = await resolveDir(root, segments)
  } catch {
    return null
  }
  try {
    await dir.getFileHandle(name)
    return 'file'
  } catch { /* 파일이 아니면 폴더인지 확인 */ }
  try {
    await dir.getDirectoryHandle(name)
    return 'dir'
  } catch {
    return null
  }
}

/** 그 폴더 안의 것들. 휴지통을 엿볼 때 씁니다 — 볼트 트리에는 들지 않는 자리라 따로 읽습니다. */
export async function dirEntries(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<{ name: string; kind: 'file' | 'dir' }[]> {
  const dir = await resolveDir(root, path.split('/').filter(Boolean))
  const found: { name: string; kind: 'file' | 'dir' }[] = []
  for await (const [name, handle] of dir.entries()) {
    found.push({ name, kind: handle.kind === 'directory' ? 'dir' : 'file' })
  }
  return found
}

export async function removeEntry(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const { segments, name } = splitPath(path)
  const dir = await resolveDir(root, segments)
  await dir.removeEntry(name, { recursive: true })
}

/**
 * 이동/이름변경. File System Access 에는 표준 rename 이 없어 복사 후 삭제로 처리합니다.
 * 폴더는 하위 전체를 재귀 복사합니다.
 */
export async function movePath(
  root: FileSystemDirectoryHandle,
  from: string,
  to: string,
  /** 같은 이름이 있을 때 지우고 옮길지. 묻고 나서 부르는 자리에서만 켭니다. */
  overwrite = false,
): Promise<void> {
  if (from === to) return
  if (to === from || to.startsWith(`${from}/`)) {
    throw new Error('폴더를 자기 자신의 하위로 옮길 수 없습니다.')
  }
  if (await exists(root, to)) {
    if (!overwrite) throw new Error(`"${to}" 가 이미 있습니다.`)
    // 폴더라면 안엣것까지 함께 사라집니다. 묻는 자리에서 그렇게 밝혀 두었습니다.
    await removeEntry(root, to)
  }

  const kind = await entryKind(root, from)
  if (kind === null) throw new Error(`"${from}" 를 찾을 수 없습니다.`)

  if (kind === 'file') {
    // 텍스트로 읽어 다시 쓰면 이미지처럼 UTF-8 이 아닌 파일의 바이트가 망가집니다.
    // 해석할 수 없는 바이트가 전부 U+FFFD 로 바뀌고, 원본은 되돌릴 수 없습니다.
    await writeBinaryFile(root, to, await readBinaryFile(root, from))
  } else {
    await copyDir(root, from, to)
  }
  await removeEntry(root, from)
}

async function copyDir(
  root: FileSystemDirectoryHandle,
  from: string,
  to: string,
): Promise<void> {
  const src = await resolveDir(root, from.split('/').filter(Boolean))
  await createDir(root, to)
  for await (const [name, handle] of src.entries()) {
    if (name.startsWith('.') || IGNORED.has(name)) continue
    if (handle.kind === 'directory') {
      await copyDir(root, `${from}/${name}`, `${to}/${name}`)
    } else {
      // 폴더를 통째로 옮길 때도 바이트 그대로 옮겨야 합니다.
      const file = await (handle as FileSystemFileHandle).getFile()
      await writeBinaryFile(root, `${to}/${name}`, file)
    }
  }
}

/** 이미지처럼 텍스트가 아닌 파일. 미리보기에서 blob URL 로 만들어 씁니다. */
export async function readBinaryFile(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<Blob> {
  const { segments, name } = splitPath(path)
  const dir = await resolveDir(root, segments)
  const handle = await dir.getFileHandle(name)
  return handle.getFile()
}

/** 텍스트가 아닌 내용을 그대로 씁니다. 첨부를 내려받을 때 씁니다. */
export async function writeBinaryFile(
  root: FileSystemDirectoryHandle,
  path: string,
  data: BlobPart,
): Promise<number> {
  const { segments, name } = splitPath(path)
  const dir = await resolveDir(root, segments, true)
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
  return (await handle.getFile()).lastModified
}

/** 파일 한 개의 수정 시각. 동기화 기준점을 갱신할 때 씁니다. */
export async function fileMtime(root: FileSystemDirectoryHandle, path: string): Promise<number> {
  const { segments, name } = splitPath(path)
  const dir = await resolveDir(root, segments)
  const handle = await dir.getFileHandle(name)
  return (await handle.getFile()).lastModified
}
