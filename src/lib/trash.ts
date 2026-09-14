import * as fs from './fsAccess'
import { fileNameOf, TRASH_DIR, TRASH_INDEX } from './paths'

/** 휴지통에 든 것 하나. 파일이든 폴더든 지운 단위로 한 줄입니다. */
export interface TrashItem {
  /** 휴지통 안의 칸 이름. 시각과 난수로 지어 겹치지 않습니다. */
  id: string
  /** 원래 있던 자리. 복원하면 여기로 돌아갑니다. */
  path: string
  kind: 'file' | 'dir'
  /** 휴지통으로 옮긴 때. 오래된 것을 비우는 잣대입니다. */
  trashedAt: number
}

/**
 * 휴지통 안에서 그것이 놓인 자리.
 *
 * 칸(id) 아래에 원래 이름 그대로 둡니다. 같은 이름을 여러 번 지워도 칸이 다르니
 * 부딪히지 않고, 다른 편집기로 들여다봐도 무엇인지 알아볼 수 있습니다.
 */
export const trashLocation = (item: TrashItem): string =>
  `${TRASH_DIR}/${item.id}/${fileNameOf(item.path)}`

/** 목록을 읽습니다. 칸이 사라진 줄은 지웁니다 — 밖에서 손댄 뒤에도 목록이 맞아야 합니다. */
export async function readTrash(root: FileSystemDirectoryHandle): Promise<TrashItem[]> {
  let raw: unknown
  try {
    raw = JSON.parse(await fs.readFile(root, TRASH_INDEX))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []

  const items: TrashItem[] = []
  for (const one of raw as Partial<TrashItem>[]) {
    if (typeof one?.id !== 'string' || typeof one.path !== 'string') continue
    if (one.kind !== 'file' && one.kind !== 'dir') continue
    if (typeof one.trashedAt !== 'number') continue
    const item: TrashItem = { id: one.id, path: one.path, kind: one.kind, trashedAt: one.trashedAt }
    if (await fs.exists(root, trashLocation(item))) items.push(item)
  }
  // 최근에 지운 것이 위로 옵니다. 방금 지운 것을 되돌리려는 손이 가장 많습니다.
  return items.sort((a, b) => b.trashedAt - a.trashedAt)
}

async function writeTrash(root: FileSystemDirectoryHandle, items: TrashItem[]): Promise<void> {
  await fs.writeFile(root, TRASH_INDEX, JSON.stringify(items, null, 2) + '\n')
}

/** 지우는 대신 휴지통으로 옮깁니다. */
export async function moveToTrash(root: FileSystemDirectoryHandle, path: string): Promise<TrashItem> {
  const kind = await fs.entryKind(root, path)
  if (kind === null) throw new Error(`"${path}" 를 찾을 수 없습니다.`)

  const item: TrashItem = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    kind,
    trashedAt: Date.now(),
  }
  await fs.movePath(root, path, trashLocation(item))
  const items = await readTrash(root)
  await writeTrash(root, [item, ...items.filter((one) => one.id !== item.id)])
  return item
}

export type RestoreResult = { ok: true } | { ok: false; reason: 'exists' }

/**
 * 원래 자리로 돌려놓습니다.
 * 그 자리에 다른 것이 있으면 덮지 않고 알립니다. 묻고 나서 overwrite 를 켜 다시 부릅니다.
 */
export async function restoreFromTrash(
  root: FileSystemDirectoryHandle,
  item: TrashItem,
  overwrite = false,
): Promise<RestoreResult> {
  if (!overwrite && await fs.exists(root, item.path)) return { ok: false, reason: 'exists' }
  await fs.movePath(root, trashLocation(item), item.path, overwrite)
  await fs.removeEntry(root, `${TRASH_DIR}/${item.id}`)
  await writeTrash(root, (await readTrash(root)).filter((one) => one.id !== item.id))
  return { ok: true }
}

/** 휴지통에서도 없앱니다. 이제 되돌릴 수 없습니다. */
export async function purgeTrashItem(root: FileSystemDirectoryHandle, item: TrashItem): Promise<void> {
  await fs.removeEntry(root, `${TRASH_DIR}/${item.id}`)
  await writeTrash(root, (await readTrash(root)).filter((one) => one.id !== item.id))
}

export async function emptyTrash(root: FileSystemDirectoryHandle): Promise<number> {
  const items = await readTrash(root)
  for (const item of items) await fs.removeEntry(root, `${TRASH_DIR}/${item.id}`)
  if (items.length > 0 || await fs.exists(root, TRASH_INDEX)) await writeTrash(root, [])
  return items.length
}

/** 옮긴 지 이만큼이 지난 것만 없앱니다. 없앤 개수를 돌려줍니다. */
export async function purgeTrashOlderThan(root: FileSystemDirectoryHandle, ms: number): Promise<number> {
  const items = await readTrash(root)
  const cutoff = Date.now() - ms
  const stale = items.filter((one) => one.trashedAt <= cutoff)
  for (const item of stale) await fs.removeEntry(root, `${TRASH_DIR}/${item.id}`)
  if (stale.length > 0) await writeTrash(root, items.filter((one) => one.trashedAt > cutoff))
  return stale.length
}
