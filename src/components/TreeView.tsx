import { useEffect, useRef, useState } from 'react'
import type { VaultNode } from '../types'
import {
  ChevronIcon, ClipIcon, DocIcon, DocPlusIcon, FolderCloseIcon, FolderIcon, FolderPlusIcon,
  ImageIcon, MoveIcon, PencilIcon, RefreshIcon, StarIcon, TrashIcon,
} from './icons'
import { attachmentKind } from '../lib/attachments'
import { isMarkdown } from '../lib/attachments'

export interface TreeActions {
  onSelect: (path: string) => void
  /** 폴더를 고르면 정보 표시줄이 폴더 요약을 보여 줍니다. */
  onSelectDir: (path: string) => void
  onNewDoc: (dirPath: string) => void
  onNewFolder: (dirPath: string) => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
  onMove: (from: string, targetDir: string) => void
  /** 옮겨 갈 폴더를 고르는 창을 엽니다. 끌 수 없는 손가락·자판을 위한 길입니다. */
  onMoveTo: (path: string) => void
  /** 컴퓨터에서 끌어다 놓은 파일을 그 폴더에 넣습니다. */
  onDropFiles: (targetDir: string, files: File[]) => void
  /** 그 폴더에 넣을 파일을 고르는 창을 엽니다. */
  onPickFilesFor: (dirPath: string) => void
  /** 즐겨찾기에 담거나 뺍니다. */
  onToggleFavorite: (path: string) => void
  /** 지금 즐겨찾기에 담긴 경로들. */
  favorites: string[]
}

interface TreeViewProps extends TreeActions {
  root: VaultNode
  /** 뿌리 줄에 보여 줄 폴더 이름. */
  rootName: string
  /** 지금 고른 것. 문서든 폴더든 이 하나로 옵니다. */
  selectedPath: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
  /** 맨 위 줄에서 ↑ 를 눌렀을 때. 검색 칸으로 돌아갑니다. */
  onLeaveTop: () => void
  /** 뿌리에 넣을 파일을 고르는 창을 엽니다. */
  onPickFiles: () => void
  onRefresh: () => void
  onCloseVault: () => void
}

export function TreeView({
  root, rootName, onPickFiles, onRefresh, onCloseVault, onLeaveTop, ...props
}: TreeViewProps) {
  const children = root.children ?? []
  // 뿌리 줄의 단추는 늘 뿌리를 가리킵니다. 폴더마다 필요한 것은 그 줄에 따로 있습니다.
  const rootTools = [
    { key: 'folder', label: '새 폴더', tip: '최상위에 새 폴더 만들기',
      icon: <FolderPlusIcon />, run: () => props.onNewFolder('') },
    { key: 'doc', label: '새 문서', tip: '최상위에 새 문서 만들기',
      icon: <DocPlusIcon />, run: () => props.onNewDoc('') },
    { key: 'file', label: '파일 추가', tip: '마크다운·이미지·문서 파일을 골라 최상위에 넣기',
      icon: <ClipIcon />, run: onPickFiles },
    { key: 'refresh', label: '새로고침', tip: '폴더를 다시 읽어 바깥에서 바뀐 파일을 반영합니다',
      icon: <RefreshIcon />, run: onRefresh },
    { key: 'close', label: '폴더 닫기', tip: '이 폴더와의 연결을 끊습니다. 파일은 그대로 남습니다',
      icon: <FolderCloseIcon />, run: onCloseVault },
  ]

  return (
    <div
      className="tree"
      /*
       * 자판으로 오르내립니다. 검색 결과와 같은 규칙입니다.
       * 줄마다 듣기를 달지 않고 트리에서 한 번에 받습니다. 보이는 줄의 차례는
       * 그려진 차례와 같으므로 DOM 을 그대로 훑으면 됩니다.
       */
      onKeyDown={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('.tree-row')
        if (!row || row.parentElement === null) return
        const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('.tree-row')]
        const at = rows.indexOf(row)
        if (at === -1) return

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)]
          if (next) next.focus()
          // 맨 위에서 ↑ 는 검색 칸으로 돌아갑니다.
          else if (event.key === 'ArrowUp') onLeaveTop()
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          row.click()
          return
        }
        // → 는 폴더를 펴고, ← 는 접습니다. 이미 접힌 폴더나 파일에서 ← 는 부모 폴더로 올라갑니다.
        const caret = row.querySelector<HTMLButtonElement>(':scope > .tree-caret[aria-expanded]')
        if (event.key === 'ArrowRight') {
          if (caret && caret.getAttribute('aria-expanded') === 'false') {
            event.preventDefault()
            caret.click()
          }
          return
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          if (caret && caret.getAttribute('aria-expanded') === 'true') {
            caret.click()
            return
          }
          const parent = row.parentElement.parentElement?.closest<HTMLElement>('.tree-branch')
            ?.querySelector<HTMLElement>(':scope > .tree-row')
          parent?.focus()
        }
      }}
      // 루트로 끌어다 놓으면 볼트 최상위로 옮깁니다.
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const files = [...event.dataTransfer.files]
        if (files.length > 0) {
          props.onDropFiles('', files)
          return
        }
        const from = event.dataTransfer.getData('text/mdwiki-path')
        if (from) props.onMove(from, '')
      }}
    >
      <div
        className={props.selectedPath === '' ? 'tree-row tree-root is-selected' : 'tree-row tree-root'}
        tabIndex={props.selectedPath === '' ? 0 : -1}
        onClick={() => props.onSelectDir('')}
      >
        <span className="tree-icon is-dir"><FolderIcon /></span>
        <span className="tree-name">{rootName}</span>
        {/* 뿌리 줄의 단추는 늘 보입니다. 다른 줄과 달리 늘 쓰는 것들입니다. */}
        <span className="tree-tools is-pinned" onClick={(event) => event.stopPropagation()}>
          {rootTools.map((tool) => (
            <button key={tool.key} type="button" aria-label={tool.label} data-tip={tool.tip}
                    onClick={tool.run}>
              {tool.icon}
            </button>
          ))}
        </span>
      </div>

      {children.length === 0 && <p className="tree-empty">비어 있습니다. 문서를 만들어 보세요.</p>}
      {children.map((node) => (
        <TreeRow key={node.path} node={node} depth={0} {...props} />
      ))}
    </div>
  )
}

interface TreeRowProps extends TreeActions {
  node: VaultNode
  depth: number
  selectedPath: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
}

/** 이름 앞 아이콘의 색을 가릅니다. 상태 표시줄의 종류 이름과 같은 갈래입니다. */
function kindOf(node: VaultNode): 'dir' | 'markdown' | 'image' | 'file' {
  if (node.kind === 'dir') return 'dir'
  if (isMarkdown(node.name)) return 'markdown'
  return attachmentKind(node.name) === 'image' ? 'image' : 'file'
}

function TreeRow({ node, depth, selectedPath, expanded, onToggle, ...actions }: TreeRowProps) {
  const [dropTarget, setDropTarget] = useState(false)
  const isDir = node.kind === 'dir'
  const isOpen = expanded.has(node.path)
  const isSelected = selectedPath === node.path

  /*
   * 고른 줄이 굴림 칸 밖에 있으면 끌어와 보여 줍니다.
   *
   * 백링크나 위키링크로 문서를 열면 트리에서 고르기는 되지만, 그 줄이 위나 아래로
   * 숨어 있으면 어디가 열렸는지 알 수 없습니다.
   * 'nearest' 라서 이미 보이는 줄은 건드리지 않습니다. 손으로 누른 줄까지
   * 들썩이면 그게 더 어수선합니다.
   */
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isSelected) row.current?.scrollIntoView({ block: 'nearest' })
  }, [isSelected])

  const isFavorite = actions.favorites.includes(node.path)
  const parentDir = node.path.split('/').slice(0, -1).join('/')
  const dropDir = isDir ? node.path : parentDir

  return (
    <div className="tree-branch">
      <div
        ref={row}
        className={[
          'tree-row',
          isSelected ? 'is-selected' : '',
          // 담긴 줄은 별 단추를 늘 보여 둡니다. 이름 앞에 표를 따로 찍지 않습니다.
          isFavorite ? 'is-favorite' : '',
          dropTarget ? 'is-drop-target' : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
        // 고른 줄만 Tab 차례에 들고, 나머지는 화살표로 갑니다. 줄마다 Tab 을 세우면 수백 번 눌러야 합니다.
        tabIndex={isSelected ? 0 : -1}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('text/mdwiki-path', node.path)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropTarget(true)
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDropTarget(false)

          // 컴퓨터에서 끌어온 파일이면 그 폴더에 넣고, 아니면 트리 안 이동으로 봅니다.
          const files = [...event.dataTransfer.files]
          if (files.length > 0) {
            actions.onDropFiles(dropDir, files)
            return
          }

          const from = event.dataTransfer.getData('text/mdwiki-path')
          if (from && from !== node.path) actions.onMove(from, dropDir)
        }}
        onClick={() => {
          if (!isDir) {
            actions.onSelect(node.path)
            return
          }
          /*
           * 폴더는 한 번에 한 가지만 합니다.
           *
           * 고르기와 펼치기를 함께 걸어 두면, 안을 들여다보려고 누를 때마다 오른쪽
           * 화면이 폴더 정보로 바뀌고, 폴더를 고르려고 누를 때마다 트리가 접혔다
           * 펴집니다. 먼저 고르고, 이미 골라 둔 폴더를 다시 눌렀을 때 폅니다.
           * 고르지 않고 펴 보고 싶으면 왼쪽 꺾쇠를 누릅니다.
           */
          if (isSelected) onToggle(node.path)
          else actions.onSelectDir(node.path)
        }}
      >
        {isDir ? (
          <button
            type="button"
            className={isOpen ? 'tree-caret is-open' : 'tree-caret'}
            aria-label={`${node.name} ${isOpen ? '접기' : '펼치기'}`}
            aria-expanded={isOpen}
            // 꺾쇠는 고르기와 상관없이 폈다 접기만 합니다.
            onClick={(event) => {
              event.stopPropagation()
              onToggle(node.path)
            }}
          >
            <ChevronIcon />
          </button>
        ) : (
          <span className="tree-caret" />
        )}
        <span className={`tree-icon is-${kindOf(node)}`}>
          {isDir ? <FolderIcon /> : kindOf(node) === 'image' ? <ImageIcon /> : <DocIcon />}
        </span>
        <span className="tree-name">
          {node.name}
        </span>

        <span className="tree-tools" onClick={(event) => event.stopPropagation()}>
          {isDir && (
            <>
              <button
                type="button"
                aria-label="새 폴더"
                data-tip={`"${node.name}" 안에 새 폴더 만들기`}
                onClick={() => actions.onNewFolder(node.path)}
              >
                <FolderPlusIcon />
              </button>
              <button
                type="button"
                aria-label="새 문서"
                data-tip={`"${node.name}" 안에 새 문서 만들기`}
                onClick={() => actions.onNewDoc(node.path)}
              >
                <DocPlusIcon />
              </button>
              <button
                type="button"
                aria-label="파일 추가"
                data-tip={`마크다운·이미지·문서 파일을 골라 "${node.name}" 안에 넣기`}
                onClick={() => actions.onPickFilesFor(node.path)}
              >
                <ClipIcon />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="이름 바꾸기"
            data-tip={isDir ? '폴더 이름 변경' : '파일 이름 변경'}
            onClick={() => actions.onRename(node.path)}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            aria-label="옮기기"
            data-tip="다른 폴더로 옮깁니다. 끌어다 놓는 대신 폴더를 골라 옮길 때 씁니다"
            onClick={() => actions.onMoveTo(node.path)}
          >
            <MoveIcon />
          </button>
          <button
            type="button"
            aria-label="삭제"
            data-tip={isDir ? '폴더와 그 안의 내용을 모두 삭제' : '파일 삭제'}
            onClick={() => actions.onDelete(node.path)}
          >
            <TrashIcon />
          </button>
          {/*
            별 단추가 곧 표시입니다. 담긴 줄에서는 손을 얹지 않아도 이 단추만 켜진 채로
            남고, 같은 자리를 누르면 뺍니다. 이름 앞에 별을 따로 찍으면 같은 뜻이 둘이 됩니다.
            맨 끝에 둡니다. 손을 얹어 다른 단추가 나와도 별은 같은 자리에 있어야 합니다.
          */}
          <button
            type="button"
            className={isFavorite ? 'tree-fav is-on' : 'tree-fav'}
            aria-label={isFavorite ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기'}
            aria-pressed={isFavorite}
            data-tip={isFavorite ? '즐겨찾기에서 뺍니다' : '즐겨찾기에 담아 위쪽에 둡니다'}
            onClick={() => actions.onToggleFavorite(node.path)}
          >
            <StarIcon filled={isFavorite} />
          </button>
        </span>
      </div>

      {isDir && isOpen && (
        <div className="tree-children">
          {(node.children ?? []).map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggle={onToggle}
              {...actions}
            />
          ))}
        </div>
      )}
    </div>
  )
}
