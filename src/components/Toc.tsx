import type { MouseEvent } from 'react'
import type { Heading } from '../lib/markdown'

interface TocProps {
  headings: Heading[]
}

/*
 * 편집기에서 그 줄이 화면 위쪽 어디쯤에 서게 할지.
 * 맨 위에 딱 붙이면 앞뒤 문맥이 보이지 않아 어디로 왔는지 알기 어렵습니다.
 */
const FROM_TOP = 4

/**
 * 편집만 보고 있을 때 그 제목 줄로 데려다 줍니다.
 *
 * 결과 화면이 없으니 뛰어갈 앵커도 없습니다. 대신 글자 자리를 짚어 낫표를 그 줄에
 * 세우고, 편집기를 그만큼 굴려 줍니다. 얼마나 굴려야 하는지는 재 볼 길이 마땅치
 * 않아, 그 자리까지의 글만 잠깐 담아 높이를 재고 곧바로 되돌립니다.
 * 값은 같은 자리에서 제자리로 돌려놓으므로 고쳐졌다고 잡히지 않습니다.
 */
function jumpInEditor(editor: HTMLTextAreaElement, offset: number) {
  const full = editor.value
  editor.value = full.slice(0, offset)
  const upTo = editor.scrollHeight
  editor.value = full

  /*
   * 낫표를 먼저 옮기고 굴리기는 맨 나중에 합니다.
   *
   * 값을 되돌리면 낫표는 글 맨 끝으로 갑니다. 그 상태로 focus 를 부르면 브라우저가
   * 맨 끝을 보여 주려고 바닥까지 굴려 버립니다. 굴리는 일이 맨 뒤에 와야 합니다.
   */
  editor.focus()
  editor.setSelectionRange(offset, offset)
  editor.scrollTop = Math.max(0, upTo - editor.clientHeight / FROM_TOP)
}

export function Toc({ headings }: TocProps) {
  // 제목이 하나뿐이면 목차가 의미가 없습니다.
  if (headings.length < 2) return null

  const shallowest = Math.min(...headings.map((heading) => heading.depth))

  const go = (heading: Heading, event: MouseEvent) => {
    // 결과 화면이 떠 있으면 앵커가 알아서 데려다 줍니다. 손댈 것이 없습니다.
    const main = document.querySelector<HTMLElement>('.main')
    if (main?.querySelector(`:scope > .doc-body > .preview #${CSS.escape(heading.id)}`)) return

    const editor = main?.querySelector<HTMLTextAreaElement>(':scope > .doc-body > .editor') ?? null
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
