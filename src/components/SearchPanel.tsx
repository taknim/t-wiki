import { useMemo, useRef } from 'react'
import type { DocIndex } from '../types'
import { searchDocs } from '../lib/search'
import { displayPath } from '../lib/paths'

interface SearchPanelProps {
  query: string
  index: DocIndex
  onOpen: (path: string) => void
  /** 맨 위에서 더 올라가면 검색란으로 돌려보냅니다. */
  onLeaveTop: () => void
}

export function SearchPanel({ query, index, onOpen, onLeaveTop }: SearchPanelProps) {
  const hits = useMemo(() => searchDocs(query, index), [query, index])
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
  if (hits.length === 0) return <p className="panel-empty">일치하는 문서가 없습니다.</p>

  return (
    <ul className="search-results" ref={listRef}>
      {hits.map((hit, at) => (
        <li key={hit.path}>
          <button type="button" onClick={() => onOpen(hit.path)} onKeyDown={(event) => walk(event, at)}>
            <span className="search-title">{hit.title}</span>
            <span className="search-path">{displayPath(hit.path)}</span>
            <span className="search-snippet">
              {hit.snippet.map((piece, position) =>
                piece.hit ? <mark key={position}>{piece.text}</mark> : <span key={position}>{piece.text}</span>,
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
