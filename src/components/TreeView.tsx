import { useState } from 'react'
import type { VaultNode } from '../types'
import {
  ChevronIcon, ClipIcon, DocIcon, DocPlusIcon, FolderCloseIcon, FolderIcon, FolderPlusIcon,
  ImageIcon, PencilIcon, RefreshIcon, TrashIcon,
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
  /** 컴퓨터에서 끌어다 놓은 파일을 그 폴더에 넣습니다. */
  onDropFiles: (targetDir: string, files: File[]) => void
  /** 그 폴더에 넣을 파일을 고르는 창을 엽니다. */
  onPickFilesFor: (dirPath: string) => void
}

interface TreeViewProps extends TreeActions {
  root: VaultNode
  /** 뿌리 줄에 보여 줄 폴더 이름. */
  rootName: string
  selectedPath: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
  /** 뿌리에 넣을 파일을 고르는 창을 엽니다. */
  onPickFiles: () => void
  onRefresh: () => void
  onCloseVault: () => void
}

export function TreeView({
  root, rootName, onPickFiles, onRefresh, onCloseVault, ...props
}: TreeViewProps) {
  const children = root.children ?? []
  // 뿌리 줄의 단추는 늘 뿌리를 가리킵니다. 폴더마다 필요한 것은 그 줄에 따로 있습니다.
  const rootTools = [
    { key: 'folder', label: '새 폴더', tip: '최상위에 새 폴더 만들기',
      icon: <FolderPlusIcon />, run: () => props.onNewFolder('') },
    { key: 'doc', label: '새 문서', tip: '최상위에 새 문서 만들기',
      icon: <DocPlusIcon />, run: () => props.onNewDoc('') },
    { key: 'file', label: '파일 추가', tip: '이미지·문서 파일을 골라 최상위에 넣기',
      icon: <ClipIcon />, run: onPickFiles },
    { key: 'refresh', label: '새로고침', tip: '폴더를 다시 읽어 바깥에서 바뀐 파일을 반영합니다',
      icon: <RefreshIcon />, run: onRefresh },
    { key: 'close', label: '폴더 닫기', tip: '이 폴더와의 연결을 끊습니다. 파일은 그대로 남습니다',
      icon: <FolderCloseIcon />, run: onCloseVault },
  ]

  return (
    <div
      className="tree"
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
          // 폴더는 펼치기와 고르기를 함께 합니다.
          if (isDir) {
            onToggle(node.path)
            actions.onSelectDir(node.path)
          } else {
            actions.onSelect(node.path)
          }
        }}
      >
        <span className={isOpen ? 'tree-caret is-open' : 'tree-caret'}>
          {isDir && <ChevronIcon />}
        </span>
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
                data-tip={`이미지·문서 파일을 골라 "${node.name}" 안에 넣기`}
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
            aria-label="삭제"
            data-tip={isDir ? '폴더와 그 안의 내용을 모두 삭제' : '파일 삭제'}
            onClick={() => actions.onDelete(node.path)}
          >
            <TrashIcon />
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
