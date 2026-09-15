import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { applyFormat, type FormatId } from '../lib/markdownFormat'
import { selectionBox, type SelectionBox } from '../lib/textareaCaret'
import { FormatToolbar } from './FormatToolbar'

interface EditorProps {
  value: string
  path: string
  onChange: (next: string) => void
  onSave: () => void
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

export function Editor({ value, path, onChange, onSave }: EditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [box, setBox] = useState<SelectionBox | null>(null)
  // 서식을 적용하면 본문이 부모 상태로 올라갔다 내려오므로,
  // 새 값이 반영된 뒤에 선택을 복원해야 합니다.
  const pendingSelection = useRef<[number, number] | null>(null)

  const syncToolbar = useCallback(() => {
    const textarea = ref.current
    setBox(textarea ? selectionBox(textarea) : null)
  }, [])

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

  return (
    <>
      <textarea
        ref={ref}
        className="editor"
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={syncToolbar}
        onScroll={syncToolbar}
        onBlur={(event) => {
          // 도구 막대를 누른 경우에는 닫지 않습니다.
          if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.format-toolbar')) return
          setBox(null)
        }}
        placeholder={placeholderFor(path)}
      />
      {box && <FormatToolbar box={box} onApply={runFormat} />}
    </>
  )
}
