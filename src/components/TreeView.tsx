import { useState } from 'react'
import type { VaultNode } from '../types'
import { isMarkdown } from '../lib/attachments'
import { titleOf } from '../lib/wikilinks'

export interface TreeActions {
  onSelect: (path: string) => void
  /** 폴더를 고르면 정보 표시줄이 폴더 요약을 보여 줍니다. */
  onSelectDir: (path: string) => void
  onNewDoc: (dirPath: string) => void
  onNewFolder: (dirPath: string) => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
  onMove: (from: string, targetDir: string) => void
}

interface TreeViewProps extends TreeActions {
  root: VaultNode
  selectedPath: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
}

export function TreeView({ root, ...props }: TreeViewProps) {
  const children = root.children ?? []

  return (
    <div
      className="tree"
      // 루트로 끌어다 놓으면 볼트 최상위로 옮깁니다.
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const from = event.dataTransfer.getData('text/mdwiki-path')
        if (from) props.onMove(from, '')
      }}
    >
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

function TreeRow({ node, depth, selectedPath, expanded, onToggle, ...actions }: TreeRowProps) {
  const [dropTarget, setDropTarget] = useState(false)
  const isDir = node.kind === 'dir'
  const isOpen = expanded.has(node.path)
  const isSelected = selectedPath === node.path

  const parentDir = node.path.split('/').slice(0, -1).join('/')
  const dropDir = isDir ? node.path : parentDir

  return (
    <div className="tree-branch">
      <div
        className={[
          'tree-row',
          isSelected ? 'is-selected' : '',
          dropTarget ? 'is-drop-target' : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
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
          const from = event.dataTransfer.getData('text/mdwiki-path')
          if (from && from !== node.path) actions.onMove(from, dropDir)
        }}
        onClick={() => {
          // 폴더는 펼치기와 고르기를 함께 합니다.
          if (isDir) {
            onToggle(node.path)
            actions.onSelectDir(node.path)
          } else {
            actions.onSelect(node.path)
          }
        }}
      >
        <span className="tree-caret">{isDir ? (isOpen ? '▾' : '▸') : ''}</span>
        <span className="tree-icon">{isDir ? '📁' : isMarkdown(node.name) ? '📄' : '🖿'}</span>
        <span className="tree-name">
          {isDir || !isMarkdown(node.name) ? node.name : titleOf(node.name)}
        </span>

        <span className="tree-tools" onClick={(event) => event.stopPropagation()}>
          {isDir && (
            <>
              <button
                type="button"
                aria-label="새 문서"
                data-tip={`"${node.name}" 안에 새 문서 만들기`}
                onClick={() => actions.onNewDoc(node.path)}
              >
                ＋
              </button>
              <button
                type="button"
                aria-label="새 폴더"
                data-tip={`"${node.name}" 안에 새 폴더 만들기`}
                onClick={() => actions.onNewFolder(node.path)}
              >
                🗀
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="이름 바꾸기"
            data-tip={isDir ? '폴더 이름 바꾸기' : '문서 이름 바꾸기'}
            onClick={() => actions.onRename(node.path)}
          >
            ✎
          </button>
          <button
            type="button"
            aria-label="삭제"
            data-tip={isDir ? '폴더와 그 안의 내용을 모두 삭제' : '이 문서를 삭제'}
            onClick={() => actions.onDelete(node.path)}
          >
            🗑
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
