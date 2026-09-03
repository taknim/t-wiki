import type { VaultNode } from '../types'
import { attachmentKind, isMarkdown } from '../lib/attachments'
import { DocIcon, FolderIcon, ImageIcon, StarIcon } from './icons'
import { displayPath } from '../lib/paths'

interface FavoritesProps {
  paths: string[]
  /** 폴더인지 가리려면 트리가 필요합니다. 색인에는 폴더가 없습니다. */
  root: VaultNode | null
  onOpen: (path: string) => void
  onOpenDir: (path: string) => void
  onRemove: (path: string) => void
}

/** 트리에 그 경로가 아직 있는지, 폴더인지 파일인지. */
function findKind(root: VaultNode | null, path: string): 'dir' | 'file' | null {
  if (!root) return null
  const walk = (node: VaultNode): 'dir' | 'file' | null => {
    if (node.path === path) return node.kind === 'dir' ? 'dir' : 'file'
    for (const child of node.children ?? []) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  for (const child of root.children ?? []) {
    const found = walk(child)
    if (found) return found
  }
  return null
}

function iconFor(path: string, kind: 'dir' | 'file') {
  if (kind === 'dir') return { node: <FolderIcon />, tone: 'dir' }
  if (isMarkdown(path)) return { node: <DocIcon />, tone: 'markdown' }
  if (attachmentKind(path) === 'image') return { node: <ImageIcon />, tone: 'image' }
  return { node: <DocIcon />, tone: 'file' }
}

/**
 * 즐겨찾기 목록. 트리 위에 붙박이로 둡니다.
 *
 * 담아 둔 것이 없으면 아무것도 그리지 않습니다. 빈 칸이 자리만 차지할 까닭이 없습니다.
 * 사라진 경로는 걸러 냅니다. 앱 바깥에서 지웠을 수 있고, 없는 것을 눌러 봐야
 * 열리지 않습니다.
 */
export function Favorites({ paths, root, onOpen, onOpenDir, onRemove }: FavoritesProps) {
  const alive = paths
    .map((path) => ({ path, kind: findKind(root, path) }))
    .filter((entry): entry is { path: string; kind: 'dir' | 'file' } => entry.kind !== null)

  if (alive.length === 0) return null

  return (
    <div className="favorites">
      <p className="favorites-head">즐겨찾기</p>
      <ul className="favorites-list">
        {alive.map(({ path, kind }) => {
          const icon = iconFor(path, kind)
          const name = path.split('/').pop() ?? path
          return (
            <li key={path}>
              <button
                type="button"
                className="favorites-item"
                data-tip={displayPath(path)}
                onClick={() => (kind === 'dir' ? onOpenDir(path) : onOpen(path))}
              >
                <span className={`tree-icon is-${icon.tone}`}>{icon.node}</span>
                <span className="favorites-name">{name}</span>
              </button>
              <button
                type="button"
                className="favorites-drop"
                aria-label={`즐겨찾기에서 빼기: ${name}`}
                data-tip="즐겨찾기에서 뺍니다"
                onClick={() => onRemove(path)}
              >
                <StarIcon filled />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
