import { useEffect, useRef } from 'react'
import { useEscapeClose } from '../hooks/useEscapeClose'
import type { VaultNode } from '../types'
import { displayPath, fileNameOf } from '../lib/paths'
import { FolderIcon } from './icons'

interface MoveSheetProps {
  /** 옮길 것. */
  path: string
  tree: VaultNode
  onPick: (targetDir: string) => void
  onClose: () => void
}

/**
 * 옮겨 갈 폴더를 고르는 창.
 *
 * 트리에서 끌어다 놓는 것은 손가락으로는 되지 않습니다. 손전화 브라우저는 손가락으로
 * 시작한 끌기를 HTML 끌어놓기로 올려 주지 않습니다. 줄 단추로 이 창을 열어 폴더를 고릅니다.
 * 자판만 쓰는 사람에게도 이 길이 유일합니다.
 *
 * 폴더 자신과 그 아래, 지금 있는 자리는 고를 수 없습니다. 옮겨 봐야 뜻이 없거나 안 됩니다.
 */
export function MoveSheet({ path, tree, onPick, onClose }: MoveSheetProps) {
  useEscapeClose(onClose)

  /*
   * 뜨자마자 지금 있는 자리가 가운데에 오게 굴립니다.
   * 폴더가 많으면 지금 자리가 아래로 밀려 어디서 옮기는지부터 찾아야 합니다.
   */
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const here = body.current?.querySelector<HTMLElement>('.move-item.is-here')
    here?.scrollIntoView({ block: 'center' })
  }, [])

  const parent = path.split('/').slice(0, -1).join('/')
  const isDir = (node: VaultNode | null): boolean => node?.kind === 'dir'
  const self = findNode(tree, path)
  const inside = (dir: string) => isDir(self) && (dir === path || dir.startsWith(`${path}/`))

  // 폴더만 깊이와 함께 늘어놓습니다. 뿌리가 맨 위입니다.
  const folders: { path: string; depth: number }[] = [{ path: '', depth: 0 }]
  const walk = (node: VaultNode, depth: number) => {
    for (const child of node.children ?? []) {
      if (child.kind !== 'dir') continue
      folders.push({ path: child.path, depth })
      walk(child, depth + 1)
    }
  }
  walk(tree, 1)

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet sheet-narrow" role="dialog" aria-modal="true" aria-label="옮길 폴더 고르기">
        <header className="sheet-head">
          <h2>어디로 옮길까요?</h2>
          <button type="button" className="btn sheet-close" aria-label="닫기" data-tip="옮기지 않고 닫습니다 (Esc)" onClick={onClose}>
            ×
          </button>
        </header>
        <div ref={body} className="sheet-body">
          <p className="hint" style={{ marginTop: 0 }}>
            <strong>{fileNameOf(path)}</strong> 을(를) 옮깁니다. 지금은 {displayPath(parent)} 에 있습니다.
          </p>
          <ul className="move-list">
            {folders.map((folder) => {
              const blocked = folder.path === parent || inside(folder.path)
              return (
                <li key={folder.path}>
                  <button
                    type="button"
                    className={folder.path === parent ? 'move-item is-here' : 'move-item'}
                    style={{ paddingInlineStart: `${12 + folder.depth * 16}px` }}
                    disabled={blocked}
                    data-tip={folder.path === parent
                      ? '지금 있는 자리입니다'
                      : inside(folder.path) ? '폴더를 제 안으로 옮길 수는 없습니다' : `${displayPath(folder.path)} 로 옮깁니다`}
                    onClick={() => onPick(folder.path)}
                  >
                    <FolderIcon />
                    <span>{folder.path === '' ? tree.name : fileNameOf(folder.path)}</span>
                    {folder.path === parent && <span className="move-here">지금 여기</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

function findNode(root: VaultNode, path: string): VaultNode | null {
  if (root.path === path) return root
  for (const child of root.children ?? []) {
    const found = findNode(child, path)
    if (found) return found
  }
  return null
}
