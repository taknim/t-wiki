import type { VaultNode } from '../types'
import { attachmentKind, isMarkdown } from '../lib/attachments'
import { ChevronIcon, DocIcon, FolderIcon, ImageIcon, StarIcon } from './icons'
import { displayPath } from '../lib/paths'

interface FavoritesProps {
  paths: string[]
  /** 폴더인지 가리려면 트리가 필요합니다. 색인에는 폴더가 없습니다. */
  root: VaultNode | null
  onOpen: (path: string) => void
  onOpenDir: (path: string) => void
  onRemove: (path: string) => void
  /** 펴 두었는지. 접으면 이름만 남습니다. */
  open: boolean
  onToggleOpen: () => void
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
export function Favorites({
  paths, root, onOpen, onOpenDir, onRemove, open, onToggleOpen,
}: FavoritesProps) {
  const alive = paths
    .map((path) => ({ path, kind: findKind(root, path) }))
    .filter((entry): entry is { path: string; kind: 'dir' | 'file' } => entry.kind !== null)

  if (alive.length === 0) return null

  return (
    <div className={open ? 'favorites' : 'favorites is-closed'}>
      <button
        type="button"
        className="favorites-head"
        aria-expanded={open}
        data-tip={open ? '즐겨찾기를 접습니다' : '즐겨찾기를 폅니다'}
        onClick={onToggleOpen}
      >
        <span className={open ? 'favorites-caret is-open' : 'favorites-caret'}>
          <ChevronIcon />
        </span>
        즐겨찾기
      </button>
      {open && (
      <ul className="favorites-list">
        {alive.map(({ path, kind }) => {
          const icon = iconFor(path, kind)
          const name = path.split('/').pop() ?? path
          /*
           * 이름만으로는 어느 것인지 가릴 수 없어 아래에 경로를 덧붙입니다.
           * 최상위에 있는 것은 경로가 곧 이름이라 덧붙이지 않습니다. 같은 말을
           * 두 줄에 걸쳐 적어 봐야 눈만 어지럽습니다.
           */
          const where = path.includes('/') ? displayPath(path) : null
          return (
            <li key={path}>
              <button
                type="button"
                className="favorites-item"
                data-tip={displayPath(path)}
                onClick={() => (kind === 'dir' ? onOpenDir(path) : onOpen(path))}
              >
                <span className={`tree-icon is-${icon.tone}`}>{icon.node}</span>
                <span className="favorites-text">
                  <span className="favorites-name">{name}</span>
                  {where && <span className="favorites-path">{where}</span>}
                </span>
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
      )}
    </div>
  )
}
