import { useMemo, useRef } from 'react'
import { highlight, searchVault, type SearchSource } from '../lib/search'
import { Highlight } from './Highlight'
import { attachmentKind, isMarkdown } from '../lib/attachments'
import { DocIcon, FolderIcon, ImageIcon } from './icons'
import { displayPath } from '../lib/paths'

interface SearchPanelProps {
  query: string
  source: SearchSource
  /** 텍스트 첨부를 아직 읽는 중인지. 다 읽으면 결과가 늘어납니다. */
  loading: boolean
  onOpen: (path: string) => void
  onOpenDir: (path: string) => void
  /** 맨 위에서 더 올라가면 검색란으로 돌려보냅니다. */
  onLeaveTop: () => void
}

function iconFor(path: string, kind: 'dir' | 'file') {
  if (kind === 'dir') return { node: <FolderIcon />, tone: 'dir' }
  if (isMarkdown(path)) return { node: <DocIcon />, tone: 'markdown' }
  if (attachmentKind(path) === 'image') return { node: <ImageIcon />, tone: 'image' }
  return { node: <DocIcon />, tone: 'file' }
}

export function SearchPanel({
  query, source, loading, onOpen, onOpenDir, onLeaveTop,
}: SearchPanelProps) {
  const hits = useMemo(() => searchVault(query, source), [query, source])
  const listRef = useRef<HTMLUListElement>(null)

  /*
   * 결과 사이는 진짜 포커스로 오갑니다. 따로 고른 줄을 기억해 두는 대신
   * 단추에 포커스를 주면, 엔터로 여는 것도 읽어 주는 화면도 브라우저가 알아서 합니다.
   */
  const focusAt = (index: number) => {
    const buttons = listRef.current?.querySelectorAll('button')
    buttons?.[index]?.focus()
  }

  const walk = (event: React.KeyboardEvent, at: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusAt(Math.min(at + 1, hits.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (at === 0) onLeaveTop()
      else focusAt(at - 1)
    }
  }

  if (query.trim().length === 0) return null
  if (hits.length === 0) {
    return (
      <p className="panel-empty">
        {loading ? '첨부 본문을 읽는 중입니다…' : '일치하는 것이 없습니다.'}
      </p>
    )
  }

  return (
    <>
      <ul className="search-results" ref={listRef}>
        {hits.map((hit, at) => {
          const icon = iconFor(hit.path, hit.kind)
          return (
            <li key={hit.path}>
              <button
                type="button"
                onClick={() => (hit.kind === 'dir' ? onOpenDir(hit.path) : onOpen(hit.path))}
                onKeyDown={(event) => walk(event, at)}
              >
                <span className="search-head">
                  <span className={`tree-icon is-${icon.tone}`}>{icon.node}</span>
                  <span className="search-title">
                    <Highlight pieces={highlight(hit.title, query)} />
                  </span>
                </span>
                <span className="search-path">{displayPath(hit.path)}</span>
                <span className="search-snippet">
                  <Highlight pieces={hit.snippet} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {/* 첨부를 다 읽으면 결과가 더 나올 수 있습니다. 기다리는 줄인지 알려 줍니다. */}
      {loading && <p className="panel-empty">첨부 본문을 읽는 중입니다…</p>}
    </>
  )
}
