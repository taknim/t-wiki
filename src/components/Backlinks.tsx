import { useMemo } from 'react'
import type { DocIndex } from '../types'
import { backlinksFor } from '../lib/wikilinks'

interface BacklinksProps {
  path: string
  index: DocIndex
  onOpen: (path: string) => void
}

export function Backlinks({ path, index, onOpen }: BacklinksProps) {
  const links = useMemo(() => backlinksFor(path, index), [path, index])

  if (links.length === 0) {
    return <p className="panel-empty">이 문서를 가리키는 문서가 아직 없습니다.</p>
  }

  return (
    <ul className="backlinks">
      {links.map((link) => (
        <li key={link.path}>
          <button type="button" className="backlink-title" onClick={() => onOpen(link.path)}>
            {link.title}
          </button>
          {link.contexts.slice(0, 3).map((context, position) => (
            <p key={position} className="backlink-context">
              {context}
            </p>
          ))}
        </li>
      ))}
    </ul>
  )
}
