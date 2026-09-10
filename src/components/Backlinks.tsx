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
          {/*
            파일 이름만 적으면 구별이 되지 않습니다. 같은 이름의 문서가 폴더마다
            있으면(README.md 처럼) 어느 것을 가리키는지 알 길이 없고, 문맥 줄까지
            같으면 한 문서가 두 번 나온 것처럼 보입니다. 앞에 폴더까지 적되,
            눈이 이름을 먼저 잡도록 폴더 쪽은 흐리게 둡니다.
          */}
          <button type="button" className="backlink-title" onClick={() => onOpen(link.path)}>
            {link.path.includes('/') && (
              <span className="backlink-dir">
                {link.path.slice(0, link.path.lastIndexOf('/') + 1)}
              </span>
            )}
            {link.path.slice(link.path.lastIndexOf('/') + 1)}
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
