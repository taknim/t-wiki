import { useState } from 'react'
import type { VaultNode } from '../types'
import { attachmentKind, isMarkdown } from '../lib/attachments'
import { DocIcon, FolderIcon, ImageIcon, StarIcon } from './icons'
import { displayPath } from '../lib/paths'
import { highlight, nameMatches } from '../lib/search'
import { Highlight } from './Highlight'

interface FavoritesProps {
  paths: string[]
  /** 즐겨찾기 탭의 찾는 말. 이름으로만 거릅니다. */
  query: string
  /** 폴더인지 가리려면 트리가 필요합니다. 색인에는 폴더가 없습니다. */
  root: VaultNode | null
  onOpen: (path: string) => void
  /** 맨 위 줄에서 ↑ 를 눌렀을 때. 검색 칸으로 돌아갑니다. */
  onLeaveTop: () => void
  onOpenDir: (path: string) => void
  onRemove: (path: string) => void
  /** 한 줄을 다른 줄의 앞이나 뒤로 옮깁니다. */
  onReorder: (from: string, to: string, place: 'before' | 'after') => void
}

/** 끌어 온 줄을 어느 쪽에 놓을지. 가리키는 줄의 위 절반이면 앞, 아래 절반이면 뒤입니다. */
function placeFor(event: React.DragEvent<HTMLLIElement>): 'before' | 'after' {
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after'
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
 * 즐겨찾기 목록. 옆줄의 한 탭을 통째로 씁니다.
 *
 * 사라진 경로는 걸러 냅니다. 앱 바깥에서 지웠을 수 있고, 없는 것을 눌러 봐야
 * 열리지 않습니다. 담아 둔 것이 없으면 왜 비었는지 적어 둡니다. 탭을 골라서 온
 * 자리라, 아무 말 없이 빈 칸만 있으면 고장으로 보입니다.
 */
export function Favorites({
  paths, query, root, onOpen, onOpenDir, onRemove, onReorder, onLeaveTop,
}: FavoritesProps) {
  /*
   * 끌고 있는 줄과, 지금 가리키는 자리.
   * 자리를 표시해 주지 않으면 놓기 전까지 어디로 갈지 알 수 없습니다.
   */
  const [held, setHeld] = useState<string | null>(null)
  const [over, setOver] = useState<{ path: string; place: 'before' | 'after' } | null>(null)
  const alive = paths
    .map((path) => ({ path, kind: findKind(root, path) }))
    .filter((entry): entry is { path: string; kind: 'dir' | 'file' } => entry.kind !== null)

  /*
   * 여기서는 이름으로만 거릅니다. 담아 둔 것은 몇십 개 안 되고, 그중에서 하나를
   * 집어내는 일이라 본문까지 뒤질 까닭이 없습니다.
   */
  const shown = alive.filter((entry) => nameMatches(query, entry.path))

  if (shown.length === 0) {
    return (
      <p className="panel-empty">
        {alive.length === 0
          ? '담아 둔 것이 없습니다. 폴더 탭에서 줄 오른쪽 별을 누르면 여기에 모입니다.'
          : '담아 둔 것 중에 그런 이름은 없습니다.'}
      </p>
    )
  }

  return (
    <ul
      className="favorites-list"
      // 자판으로 오르내립니다. 트리·검색 결과와 같은 규칙입니다. Enter 는 단추라 저절로 열립니다.
      onKeyDown={(event) => {
        if (event.altKey || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('.favorites-item')]
        const at = items.indexOf((event.target as HTMLElement).closest('.favorites-item') as HTMLElement)
        if (at === -1) return
        event.preventDefault()
        const next = items[at + (event.key === 'ArrowDown' ? 1 : -1)]
        if (next) next.focus()
        else if (event.key === 'ArrowUp') onLeaveTop()
      }}
    >
      {shown.map(({ path, kind }) => {
        const icon = iconFor(path, kind)
        const name = path.split('/').pop() ?? path
        const mark = over?.path === path && held !== null && held !== path
          ? ` is-over-${over.place}`
          : ''
        return (
          <li
            key={path}
            draggable
            className={`${held === path ? 'is-held' : ''}${mark}`}
            onDragStart={(event) => {
              setHeld(path)
              event.dataTransfer.effectAllowed = 'move'
              // 자리 옮기기가 트리의 파일 옮기기와 섞이지 않도록 갈래를 따로 둡니다.
              event.dataTransfer.setData('text/mdwiki-favorite', path)
            }}
            onDragOver={(event) => {
              if (held === null) return
              // 막지 않으면 브라우저가 놓기를 받아 주지 않습니다.
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const place = placeFor(event)
              setOver((current) =>
                current?.path === path && current.place === place ? current : { path, place })
            }}
            onDrop={(event) => {
              if (held === null) return
              event.preventDefault()
              const place = placeFor(event)
              setOver(null)
              setHeld(null)
              if (held !== path) onReorder(held, path, place)
            }}
            onDragEnd={() => {
              setHeld(null)
              setOver(null)
            }}
          >
            <button
              type="button"
              className="favorites-item"
              onClick={() => (kind === 'dir' ? onOpenDir(path) : onOpen(path))}
              /*
               * 끌지 못하는 사람도 자리를 바꿀 수 있어야 합니다.
               * 화살표만으로는 줄 사이를 옮겨 다니는 것과 구별되지 않아 Alt 를 함께 씁니다.
               */
              onKeyDown={(event) => {
                if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
                event.preventDefault()
                const at = shown.findIndex((entry) => entry.path === path)
                const up = event.key === 'ArrowUp'
                const neighbour = shown[at + (up ? -1 : 1)]
                if (neighbour) onReorder(path, neighbour.path, up ? 'before' : 'after')
              }}
            >
              <span className={`tree-icon is-${icon.tone}`}>{icon.node}</span>
              <span className="favorites-text">
                <span className="favorites-name">
                  <Highlight pieces={highlight(name, query)} />
                </span>
                {/* 이름만으로는 어느 것인지 가릴 수 없어 어디에 있는 것인지 함께 적습니다. */}
                <span className="favorites-path">{displayPath(path)}</span>
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
  )
}
