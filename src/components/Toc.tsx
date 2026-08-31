import type { Heading } from '../lib/markdown'

interface TocProps {
  headings: Heading[]
}

export function Toc({ headings }: TocProps) {
  // 제목이 하나뿐이면 목차가 의미가 없습니다.
  if (headings.length < 2) return null

  const shallowest = Math.min(...headings.map((heading) => heading.depth))

  return (
    <nav className="toc" aria-label="문서 목차">
      <p className="toc-head">목차</p>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingInlineStart: `${(heading.depth - shallowest) * 12}px` }}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
