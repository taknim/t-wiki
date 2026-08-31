import type { AssetIndex, DocIndex, VaultNode } from '../types'
import { isAttachment, isMarkdown, isSyncable } from './attachments'

/** 볼트 안에서 무시할 이름들. 점으로 시작하는 항목은 전부 별도로 걸러냅니다. */
const IGNORED = new Set(['node_modules', 'Icon\r'])

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
export async function scanVault(
  root: FileSystemDirectoryHandle,
): Promise<{ tree: VaultNode; index: DocIndex; assets: AssetIndex }> {
  const index: DocIndex = new Map()
  const assets: AssetIndex = new Map()
  const tree: VaultNode = { kind: 'dir', name: root.name, path: '', children: [] }
  await walk(root, '', tree, index, assets)
  return { tree, index, assets }
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  node: VaultNode,
  index: DocIndex,
  assets: AssetIndex,
): Promise<void> {
  const children: VaultNode[] = []
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.') || IGNORED.has(name)) continue
    const path = prefix ? `${prefix}/${name}` : name

    if (handle.kind === 'directory') {
      const child: VaultNode = { kind: 'dir', name, path, children: [] }
      await walk(handle as FileSystemDirectoryHandle, path, child, index, assets)
      children.push(child)
      continue
    }

    const file = await (handle as FileSystemFileHandle).getFile()

    if (isMarkdown(name)) {
      const content = await file.text()
      index.set(path, { path, content, lastModified: file.lastModified })
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
    if (isAttachment(name)) {
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
): Promise<number> {
  const { segments, name } = splitPath(path)
  const dir = await resolveDir(root, segments, true)
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
  return (await handle.getFile()).lastModified
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
): Promise<void> {
  if (from === to) return
  if (to === from || to.startsWith(`${from}/`)) {
    throw new Error('폴더를 자기 자신의 하위로 옮길 수 없습니다.')
  }
  if (await exists(root, to)) {
    throw new Error(`"${to}" 가 이미 있습니다.`)
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
