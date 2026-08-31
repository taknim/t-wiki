import { useEffect, useState } from 'react'

interface TipState {
  text: string
  top: number
  left: number
  below: boolean
}

const DELAY = 400
const GAP = 8
const EDGE = 8

/**
 * `data-tip` 이 붙은 요소에 안내를 띄우는 전역 레이어.
 *
 * CSS ::after 로 만들면 사이드바처럼 overflow 가 걸린 조상 안에서 잘려 나갑니다.
 * 문서 최상단에 고정 배치로 하나만 두고 위치를 계산하는 편이 안전합니다.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null)

  useEffect(() => {
    let timer = 0

    const place = (element: HTMLElement, text: string) => {
      const box = element.getBoundingClientRect()
      // 아래에 자리가 없으면 위로 올립니다.
      const below = box.bottom + GAP + 34 < window.innerHeight
      setTip({
        text,
        top: below ? box.bottom + GAP : box.top - GAP,
        left: Math.min(Math.max(box.left + box.width / 2, EDGE + 60), window.innerWidth - EDGE - 60),
        below,
      })
    }

    const show = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const holder = target.closest<HTMLElement>('[data-tip]')
      if (!holder) return

      const text = holder.dataset.tip
      if (!text) return

      window.clearTimeout(timer)
      // 포커스로 들어온 경우(키보드 이동)는 바로 보여 줍니다.
      if (event.type === 'focusin') place(holder, text)
      else timer = window.setTimeout(() => place(holder, text), DELAY)
    }

    const hide = () => {
      window.clearTimeout(timer)
      setTip(null)
    }

    document.addEventListener('mouseover', show)
    document.addEventListener('focusin', show)
    document.addEventListener('mouseout', hide)
    document.addEventListener('focusout', hide)
    document.addEventListener('mousedown', hide)
    document.addEventListener('keydown', hide)
    window.addEventListener('scroll', hide, true)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mouseover', show)
      document.removeEventListener('focusin', show)
      document.removeEventListener('mouseout', hide)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('keydown', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  if (!tip) return null

  return (
    <div
      className={tip.below ? 'tooltip' : 'tooltip is-above'}
      role="tooltip"
      style={{ top: tip.top, left: tip.left }}
    >
      {tip.text}
    </div>
  )
}
