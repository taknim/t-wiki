import { useEffect, useRef, useState } from 'react'
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
  // 접근성 표시(aria-orientation)에 쓸 값. 실제 판단은 그때그때 생김새로 합니다.
  const [horizontal, setHorizontal] = useState(false)
  const self = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = self.current
    if (!element) return
    const look = () => setHorizontal(element.offsetWidth > element.offsetHeight)
    look()
    const watcher = new ResizeObserver(look)
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [])

  /*
   * 손잡이가 누워 있는지. 좁은 화면에서는 원문과 결과가 위아래로 서고 손잡이도
   * 가로로 눕습니다. 그때는 좌우가 아니라 위아래로 잽니다. 어느 쪽인지는 손잡이의
   * 생김새(넓이가 높이보다 큰지)로 그때그때 봅니다. 창을 늘이고 줄이면 바뀝니다.
   */
  const lying = (element: HTMLElement): boolean => element.offsetWidth > element.offsetHeight

  /** 손잡이가 아니라 두 칸을 담은 판을 기준으로 잽니다. */
  const ratioAt = (element: HTMLElement, clientX: number, clientY: number): number => {
    const box = element.parentElement?.getBoundingClientRect()
    if (!box) return ratio
    if (lying(element)) {
      if (box.height === 0) return ratio
      return clampSplitRatio(((clientY - box.top) / box.height) * 100)
    }
    if (box.width === 0) return ratio
    return clampSplitRatio(((clientX - box.left) / box.width) * 100)
  }

  return (
    <div
      ref={self}
      className={held ? 'split-resizer is-held' : 'split-resizer'}
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label="미리보기 너비"
      aria-valuenow={ratio}
      aria-valuemin={MIN_SPLIT_RATIO}
      aria-valuemax={MAX_SPLIT_RATIO}
      tabIndex={0}
      data-tip="끌어서 미리보기 몫을 조절합니다. 두 번 누르면 반반으로 돌아갑니다"
      onPointerDown={(event) => {
        dragging.current = true
        setHeld(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        onRatio(ratioAt(event.currentTarget, event.clientX, event.clientY))
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
        // 누워 있으면 위아래 화살표, 서 있으면 좌우 화살표입니다.
        const less = lying(event.currentTarget) ? 'ArrowUp' : 'ArrowLeft'
        const more = lying(event.currentTarget) ? 'ArrowDown' : 'ArrowRight'
        if (event.key === less) onRatio(clampSplitRatio(ratio - step))
        else if (event.key === more) onRatio(clampSplitRatio(ratio + step))
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
