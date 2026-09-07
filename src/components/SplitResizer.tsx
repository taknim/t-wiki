import { useRef } from 'react'
import {
  clampSplitRatio, DEFAULT_SPLIT_RATIO, MAX_SPLIT_RATIO, MIN_SPLIT_RATIO,
} from '../lib/saveOptions'

interface SplitResizerProps {
  ratio: number
  onRatio: (percent: number) => void
}

/**
 * 나란히 볼 때 원문과 결과 사이의 손잡이.
 *
 * 트리 너비 손잡이와 같은 규칙을 씁니다. 끌어서 옮기고, 두 번 누르면 반반으로
 * 돌아가고, 자판으로도 옮길 수 있습니다. 같은 일은 같은 방법으로 되어야 합니다.
 */
export function SplitResizer({ ratio, onRatio }: SplitResizerProps) {
  const dragging = useRef(false)

  /** 손잡이가 아니라 두 칸을 담은 판을 기준으로 잽니다. */
  const ratioAt = (element: HTMLElement, clientX: number): number => {
    const box = element.parentElement?.getBoundingClientRect()
    if (!box || box.width === 0) return ratio
    return clampSplitRatio(((clientX - box.left) / box.width) * 100)
  }

  return (
    <div
      className="split-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="미리보기 너비"
      aria-valuenow={ratio}
      aria-valuemin={MIN_SPLIT_RATIO}
      aria-valuemax={MAX_SPLIT_RATIO}
      tabIndex={0}
      data-tip="끌어서 미리보기 너비를 조절합니다. 두 번 누르면 반반으로 돌아갑니다"
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        onRatio(ratioAt(event.currentTarget, event.clientX))
      }}
      onPointerUp={(event) => {
        dragging.current = false
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
      onDoubleClick={() => onRatio(DEFAULT_SPLIT_RATIO)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 8 : 2
        if (event.key === 'ArrowLeft') onRatio(clampSplitRatio(ratio - step))
        else if (event.key === 'ArrowRight') onRatio(clampSplitRatio(ratio + step))
        else if (event.key === 'Home') onRatio(DEFAULT_SPLIT_RATIO)
        else return
        event.preventDefault()
      }}
    />
  )
}
