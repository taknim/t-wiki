import type { MouseEvent } from 'react'
import type { Heading } from '../lib/markdown'
import { jumpInEditor } from '../lib/editorJump'

interface TocProps {
  headings: Heading[]
}

export function Toc({ headings }: TocProps) {
  // 제목이 하나뿐이면 목차가 의미가 없습니다.
  if (headings.length < 2) return null

  const shallowest = Math.min(...headings.map((heading) => heading.depth))

  const go = (heading: Heading, event: MouseEvent) => {
    // 결과 화면이 떠 있으면 앵커가 알아서 데려다 줍니다. 손댈 것이 없습니다.
    const main = document.querySelector<HTMLElement>('.main')
    if (main?.querySelector(`:scope > .doc-body > .preview #${CSS.escape(heading.id)}`)) return

    const editor = main?.querySelector<HTMLTextAreaElement>(':scope > .doc-body > .editor-frame > .editor') ?? null
    if (!editor) return

    event.preventDefault()
    jumpInEditor(editor, heading.offset)
  }

  return (
    <nav className="toc" aria-label="문서 목차">
      <p className="toc-head">목차</p>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingInlineStart: `${(heading.depth - shallowest) * 12}px` }}>
            <a href={`#${heading.id}`} onClick={(event) => go(heading, event)}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
