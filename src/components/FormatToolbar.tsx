import { useLayoutEffect, useRef, useState } from 'react'
import type { FormatId } from '../lib/markdownFormat'
import type { SelectionBox } from '../lib/textareaCaret'
import { FORMAT_ACTIONS } from './formatActions'

interface FormatToolbarProps {
  box: SelectionBox
  onApply: (id: FormatId) => void
}

const HEIGHT = 38
const GAP = 8
const EDGE = 6

export function FormatToolbar({ box, onApply }: FormatToolbarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState((box.left + box.right) / 2)

  // 선택 위쪽에 자리가 없으면 아래에 붙입니다.
  const above = box.top > HEIGHT + GAP + 60
  const top = above ? box.top - GAP : box.bottom + GAP

  // 폭을 알아야 가둘 수 있어서, 그린 뒤에 재고 페인트 전에 자리를 잡습니다.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const half = element.offsetWidth / 2
    const min = box.containerLeft + half + EDGE
    const max = box.containerRight - half - EDGE
    const target = (box.left + box.right) / 2
    // 막대가 편집기보다 넓으면 가운데에 둡니다.
    setLeft(min > max ? (box.containerLeft + box.containerRight) / 2 : Math.min(Math.max(target, min), max))
  }, [box])

  return (
    <div
      ref={ref}
      className={above ? 'format-toolbar' : 'format-toolbar is-below'}
      role="toolbar"
      aria-label="마크다운 서식"
      style={{ top, left }}
      // 눌러도 편집기의 선택이 풀리지 않도록 기본 동작을 막습니다.
      onMouseDown={(event) => event.preventDefault()}
    >
      {FORMAT_ACTIONS.map((action, position) =>
        action === null ? (
          <span key={`sep-${position}`} className="format-sep" />
        ) : (
          <button
            key={action.id}
            type="button"
            className={`format-button format-${action.id}`}
            aria-label={action.label}
            data-tip={action.hint}
            onClick={() => onApply(action.id)}
          >
            {action.icon}
          </button>
        ),
      )}
    </div>
  )
}
