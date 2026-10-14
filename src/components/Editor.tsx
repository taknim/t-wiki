import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { highlightCode } from '../lib/markdown'
import { applyFormat, type FormatId } from '../lib/markdownFormat'
import { selectionBox, type SelectionBox } from '../lib/textareaCaret'
import { caretAt } from '../lib/editorJump'
import { FormatToolbar } from './FormatToolbar'

interface EditorProps {
  value: string
  path: string
  onChange: (next: string) => void
  onSave: () => void
  /** 왼쪽에 줄 번호를 세울지. */
  lineNumbers?: boolean
  /** 파일에 쓰는 중이라 잠시 손댈 수 없는지. */
  busy?: boolean
  /** 커서가 있는 자리(1부터 세는 행·열)가 바뀔 때. 아래 표시줄에 적습니다. */
  onCaret?: (at: { line: number; column: number } | null) => void
  /**
   * 고치는 동안에도 색을 입힐 말(highlight.js 의 언어 이름). 코드 파일에서만 줍니다.
   *
   * 파일에 들어가는 것은 **글자뿐입니다.** 색은 글상자 밑에 깔린 칸이 입는 것이고,
   * 글상자가 들고 있는 값은 사람이 친 글 그대로입니다.
   */
  language?: string | null
}


/*
 * 편집기 안내 문구. 마크다운만 다루는 것이 아니므로 종류에 맞춰 다르게 말합니다.
 * 서식 도구는 마크다운 문법을 넣으므로 그 이야기도 마크다운에서만 합니다.
 */
const PLACEHOLDERS: Record<string, string> = {
  md: '마크다운으로 작성하세요. 글자를 선택하면 서식 도구가 나타납니다.',
  csv: '쉼표로 칸을 나눠 적으면 미리보기에서 표로 보여 줍니다.',
  tsv: '탭으로 칸을 나눠 적으면 미리보기에서 표로 보여 줍니다.',
  json: 'JSON 으로 작성하세요. 저장할 때 들여쓰기를 맞춰 줍니다.',
  yaml: 'YAML 로 작성하세요.',
  yml: 'YAML 로 작성하세요.',
  html: 'HTML 로 작성하세요. 미리보기에서 그려진 결과를 볼 수 있습니다.',
  htm: 'HTML 로 작성하세요. 미리보기에서 그려진 결과를 볼 수 있습니다.',
  xml: 'XML 로 작성하세요.',
}

function placeholderFor(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return PLACEHOLDERS[extension] ?? '내용을 입력하세요.'
}

/** ⌘/Ctrl 과 함께 눌렀을 때 바로 적용되는 서식. */
const SHORTCUTS: Record<string, FormatId> = {
  b: 'bold',
  i: 'italic',
  e: 'code',
  k: 'link',
}

export function Editor({
  value, path, onChange, onSave, lineNumbers = false, busy = false, onCaret, language = null,
}: EditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [box, setBox] = useState<SelectionBox | null>(null)

  /*
   * 색칠.
   *
   * 글상자는 글자에 색을 입히지 못합니다. 그래서 같은 글을 **글상자 밑에 한 벌 더 깔고**,
   * 글상자의 글자는 투명하게 두어 커서만 남깁니다. 사람이 보는 글자는 밑의 칸입니다.
   * 미리보기를 따로 띄워 나란히 두는 길은 버렸습니다 — 같은 글이 두 벌 서서 읽을 자리만
   * 반으로 줄고, 고치는 자리에는 여전히 색이 없었습니다.
   *
   * 색칠은 한 박자 늦게 옵니다(강조기가 비동기). 그동안 옛 글을 비추면 방금 친 글자가
   * 보이지 않으므로, **지금 값과 맞는 색칠이 올 때까지는 글 그대로** 깔아 둡니다.
   */
  const paint = useRef<HTMLPreElement>(null)
  const [painted, setPainted] = useState<{ text: string; html: string } | null>(null)
  useEffect(() => {
    if (!language) return
    let cancelled = false
    void highlightCode(value, language).then((html) => {
      if (!cancelled) setPainted({ text: value, html })
    })
    return () => {
      cancelled = true
    }
  }, [language, value])

  /*
   * 색칠을 글상자의 글 자리에 정확히 포갭니다. 거울과 같은 셈입니다 — 한 치라도 어긋나면
   * 커서가 글자 사이에 서지 않습니다. 번호 칸이 서면 글상자의 왼쪽 여백이 달라지므로
   * 여백도 재어서 그대로 옮깁니다.
   */
  useLayoutEffect(() => {
    if (!language) return
    const place = () => {
      const area = ref.current
      const glass = paint.current
      if (!area || !glass) return
      const style = getComputedStyle(area)
      glass.style.left = `${area.offsetLeft}px`
      glass.style.width = `${area.clientWidth}px`
      glass.style.height = `${area.clientHeight}px`
      /*
       * 여백은 네 변을 따로 옮깁니다. 번호 칸이 서면 왼쪽만 넓어지는데(논리 속성으로 줍니다),
       * 묶음 값 하나로 받으면 그런 때 빈 글자가 돌아와 여백이 통째로 날아갑니다.
       */
      glass.style.paddingTop = style.paddingTop
      glass.style.paddingRight = style.paddingRight
      glass.style.paddingBottom = style.paddingBottom
      glass.style.paddingLeft = style.paddingLeft
      glass.scrollTop = area.scrollTop
    }
    place()
    const watcher = new ResizeObserver(place)
    if (ref.current) watcher.observe(ref.current)
    return () => watcher.disconnect()
  }, [language, value])

  /*
   * 줄 번호.
   *
   * 글상자는 줄 번호를 세워 주지 않고, 긴 줄은 접혀 두세 줄로 그려집니다. 그래서 번호 하나가
   * 몇 픽셀을 차지하는지 미리 알 수 없습니다. 글상자와 같은 글꼴·폭·접기로 그린 거울에
   * 줄마다 한 덩이씩 놓고 그 높이를 재서, 번호를 같은 높이로 세웁니다.
   * 긴 줄을 접지 않는(옆으로 굴리는) 길도 있지만 산문에는 맞지 않습니다.
   */
  const mirror = useRef<HTMLDivElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState<number[]>([])
  useLayoutEffect(() => {
    if (!lineNumbers) return
    const measure = () => {
      const glass = mirror.current
      const textarea = ref.current
      if (!glass || !textarea) return
      // 거울을 글상자의 글 자리에 정확히 포갭니다. 굴림대가 서면 그만큼 좁아지는 것과 좌우 여백까지.
      const style = getComputedStyle(textarea)
      glass.style.left = `${textarea.offsetLeft}px`
      glass.style.width = `${textarea.clientWidth}px`
      glass.style.paddingLeft = style.paddingLeft
      glass.style.paddingRight = style.paddingRight
      setHeights([...glass.children].map((row) => (row as HTMLElement).getBoundingClientRect().height))
    }
    measure()
    /*
     * 폭이 바뀌면 접히는 자리가 바뀝니다. 창을 늘이고 줄일 때 다시 잽니다.
     * 줄 간격 설정은 CSS 변수로만 바뀌어 여기서는 알 길이 없습니다. 그래서 거울의 첫 줄도
     * 함께 지켜봅니다 — 줄 높이가 바뀌면 첫 줄부터 높이가 달라지니 그때 다시 잽니다.
     * 이걸 빼먹었더니 줄 간격을 바꾼 뒤 번호가 옛 높이로 남아 글과 어긋났습니다.
     */
    const watcher = new ResizeObserver(measure)
    if (ref.current) watcher.observe(ref.current)
    if (mirror.current?.firstElementChild) watcher.observe(mirror.current.firstElementChild)
    return () => watcher.disconnect()
  }, [lineNumbers, value])

  const reportCaret = useCallback(() => {
    const textarea = ref.current
    if (!textarea || !onCaret) return
    onCaret(caretAt(textarea.value, textarea.selectionStart))
  }, [onCaret])
  // 문서를 떠나면 자리도 지웁니다.
  useEffect(() => () => onCaret?.(null), [onCaret])
  // 서식을 적용하면 본문이 부모 상태로 올라갔다 내려오므로,
  // 새 값이 반영된 뒤에 선택을 복원해야 합니다.
  const pendingSelection = useRef<[number, number] | null>(null)

  const syncToolbar = useCallback(() => {
    const textarea = ref.current
    setBox(textarea ? selectionBox(textarea) : null)
    reportCaret()
  }, [reportCaret])

  // 다른 문서로 옮겨가면 도구 막대를 닫습니다.
  // effect 로 미루면 이전 문서 기준 위치가 한 프레임 남으므로 렌더 중에 정리합니다.
  const [shownPath, setShownPath] = useState(path)
  if (shownPath !== path) {
    setShownPath(path)
    setBox(null)
  }

  // 커서를 맨 앞으로 되돌리는 건 DOM 조작이라 커밋 뒤에 합니다.
  useEffect(() => {
    ref.current?.setSelectionRange(0, 0)
  }, [path])

  useLayoutEffect(() => {
    const textarea = ref.current
    const pending = pendingSelection.current
    if (!textarea || !pending) return

    pendingSelection.current = null
    textarea.focus()
    textarea.setSelectionRange(pending[0], pending[1])
    syncToolbar()
  }, [value, syncToolbar])

  // 선택 위치가 화면에서 밀리면 도구 막대도 따라가야 합니다.
  useEffect(() => {
    if (!box) return
    const update = () => syncToolbar()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [box, syncToolbar])

  const runFormat = useCallback(
    (id: FormatId) => {
      const textarea = ref.current
      if (!textarea) return

      const result = applyFormat(id, {
        text: textarea.value,
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      })

      pendingSelection.current = [result.start, result.end]
      onChange(result.text)
    },
    [onChange],
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // ⇧·⌥ 가 붙은 것은 앱 전역 단축키(⌘⇧E 보기 모드 등)입니다. 여기서 가로채지 않습니다.
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
      if (event.key === 's') {
        event.preventDefault()
        onSave()
        return
      }
      const shortcut = SHORTCUTS[event.key.toLowerCase()]
      if (shortcut) {
        event.preventDefault()
        runFormat(shortcut)
        return
      }
    }

    if (event.key === 'Escape') {
      setBox(null)
      return
    }

    // 탭이 포커스를 옮기지 않고 들여쓰기가 되도록 직접 처리합니다.
    if (event.key === 'Tab') {
      event.preventDefault()
      const area = event.currentTarget
      const { selectionStart, selectionEnd } = area
      const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`
      pendingSelection.current = [selectionStart + 2, selectionStart + 2]
      onChange(next)
    }
  }

  const lines = lineNumbers ? value.split('\n') : []

  const frame = ['editor-frame', lineNumbers ? 'has-gutter' : '', language ? 'has-paint' : '']
    .filter(Boolean).join(' ')

  return (
    <div className={frame}>
      {language && (
        /*
         * 맨 끝에 줄바꿈 하나를 더 답니다. 글상자는 마지막 줄바꿈 뒤의 빈 줄까지 자리를
         * 내주는데 `<pre>` 는 그러지 않아, 끝까지 굴리면 색칠이 한 줄만큼 짧았습니다.
         */
        <pre ref={paint} className="editor-paint" aria-hidden="true">
          {painted?.text === value
            ? <code className="hljs" dangerouslySetInnerHTML={{ __html: `${painted.html}\n` }} />
            : <code className="hljs">{`${value}\n`}</code>}
        </pre>
      )}
      {lineNumbers && (
        <>
          <div ref={gutter} className="editor-gutter" aria-hidden="true">
            {/* 글상자의 위 여백만큼 띄워 첫 줄과 나란히 섭니다. */}
            <div className="editor-gutter-pad" />
            {lines.map((_, at) => (
              <div key={at} className="editor-gutter-line" style={{ height: heights[at] }}>{at + 1}</div>
            ))}
            {/* 아래 여백도 글상자와 같아야 끝까지 굴렸을 때 번호가 따라옵니다. */}
            <div className="editor-gutter-pad" />
          </div>
          {/* 거울. 보이지 않지만 글상자와 같은 폭·글꼴·접기로 줄마다 한 덩이씩 놓습니다. */}
          <div ref={mirror} className="editor-mirror" aria-hidden="true">
            {lines.map((line, at) => (
              <div key={at}>{line === '' ? '\u200b' : line}</div>
            ))}
          </div>
        </>
      )}
      <textarea
        ref={ref}
        className="editor"
        value={value}
        /*
         * 쓰는 동안에는 잠급니다. 그 사이에 친 글자는 방금 파일에 담은 것과 어긋나고,
         * 곧이어 돌아오는 저장 결과에 덮여 소리 없이 사라집니다.
         * disabled 가 아니라 readOnly 인 것은 자리(커서·선택·굴린 자리)를 잃지 않기 위해서입니다.
         */
        readOnly={busy}
        aria-busy={busy}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onKeyUp={reportCaret}
        onClick={reportCaret}
        onSelect={syncToolbar}
        onScroll={(event) => {
          syncToolbar()
          // 번호도 함께 굴립니다. 글상자만 굴러가면 번호가 엉뚱한 줄 옆에 섭니다.
          if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop
          // 색칠도 같이 굴러야 글자와 색이 어긋나지 않습니다.
          if (paint.current) paint.current.scrollTop = event.currentTarget.scrollTop
        }}
        onBlur={(event) => {
          // 도구 막대를 누른 경우에는 닫지 않습니다.
          if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.format-toolbar')) return
          setBox(null)
        }}
        placeholder={placeholderFor(path)}
      />
      {box && <FormatToolbar box={box} onApply={runFormat} />}
    </div>
  )
}
