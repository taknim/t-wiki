import type { Backlink } from '../lib/wikilinks'

interface BacklinksProps {
  /*
   * 이미 골라 놓은 것을 받습니다. 여기서 다시 고르면 위쪽 단추에 적힌 셈과
   * 갈라질 수 있고, 같은 일을 두 번 하게 됩니다.
   */
  links: Backlink[]
  onOpen: (path: string) => void
}

export function Backlinks({ links, onOpen }: BacklinksProps) {
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
