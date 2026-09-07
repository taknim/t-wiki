import { useRef, useState } from 'react'
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

  /*
   * 잡고 있는 동안인지. 그동안만 지금 몫을 숫자로 띄웁니다.
   *
   * 늘 떠 있으면 글 위에 앉아 읽는 것을 방해하고, 옮기는 중에 없으면 얼마나
   * 옮겼는지 눈대중해야 합니다. 자판으로 옮길 때도 보여야 하는데, 그쪽은
   * :focus-visible 로 가립니다. 끌고 놓은 뒤에도 자리가 남는다고 계속 띄우면
   * 볼일이 끝났는데 숫자만 남습니다.
   */
  const [held, setHeld] = useState(false)

  /** 손잡이가 아니라 두 칸을 담은 판을 기준으로 잽니다. */
  const ratioAt = (element: HTMLElement, clientX: number): number => {
    const box = element.parentElement?.getBoundingClientRect()
    if (!box || box.width === 0) return ratio
    return clampSplitRatio(((clientX - box.left) / box.width) * 100)
  }

  return (
    <div
      className={held ? 'split-resizer is-held' : 'split-resizer'}
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
        setHeld(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        onRatio(ratioAt(event.currentTarget, event.clientX))
      }}
      onPointerUp={(event) => {
        dragging.current = false
        setHeld(false)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerCancel={() => {
        dragging.current = false
        setHeld(false)
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
    >
      {/*
        * 잡은 자리의 몫. 왼쪽(원문) : 오른쪽(미리보기) 입니다.
        * 손잡이는 7px 이라 글자가 들어갈 자리가 없어, 가운데에 띄워 얹습니다.
        */}
      <span className="split-badge">{ratio}% : {100 - ratio}%</span>
    </div>
  )
}
