import { useMemo } from 'react'
import type { DocIndex } from '../types'
import { searchDocs } from '../lib/search'
import { displayPath } from '../lib/paths'

interface SearchPanelProps {
  query: string
  index: DocIndex
  onOpen: (path: string) => void
}

export function SearchPanel({ query, index, onOpen }: SearchPanelProps) {
  const hits = useMemo(() => searchDocs(query, index), [query, index])

  if (query.trim().length === 0) return null
  if (hits.length === 0) return <p className="panel-empty">일치하는 문서가 없습니다.</p>

  return (
    <ul className="search-results">
      {hits.map((hit) => (
        <li key={hit.path}>
          <button type="button" onClick={() => onOpen(hit.path)}>
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
