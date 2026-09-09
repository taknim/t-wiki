import { useEffect, useState } from 'react'

/** 위아래 끝에서 저절로 굴러가기 시작하는 띠의 두께. */
const ZONE = 52

/** 한 프레임에 굴러가는 최대 거리. 끝에 가까울수록 이만큼까지 빨라집니다. */
const FASTEST = 16

/**
 * 끌고 가다 칸의 위아래 끝에 닿으면 저절로 굴려 줍니다.
 *
 * 목록이 길어지면 맨 아래 것을 맨 위로 옮길 방법이 없습니다. 집어 든 채로는 굴림대를
 * 만질 수 없고, 놓는 순간 엉뚱한 자리에 떨어지기 때문입니다.
 *
 * 끄는 동안에는 사건이 화면 요소마다 따로 오므로 React 의 props 로 걸지 않고
 * 칸 자체에 매답니다. 줄과 줄 사이 빈 곳에서도 똑같이 굴러가야 합니다.
 *
 * 칸을 ref 로 받지 않고 손잡이(callback ref)를 돌려줍니다. 그 칸은 폴더를 열어야
 * 생기고 옆줄을 접으면 사라지는데, ref 로 받으면 처음 한 번 비어 있는 것을 보고
 * 그대로 손을 떼어 다시는 매달리지 않습니다.
 */
export function useEdgeScroll(): (node: HTMLElement | null) => void {
  const [box, setBox] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!box) return

    let speed = 0
    let frame = 0

    const roll = () => {
      if (speed === 0) {
        frame = 0
        return
      }
      box.scrollTop += speed
      frame = requestAnimationFrame(roll)
    }

    const stop = () => {
      speed = 0
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }

    const aim = (event: DragEvent) => {
      const view = box.getBoundingClientRect()
      const fromTop = event.clientY - view.top
      const fromBottom = view.bottom - event.clientY

      // 끝에 가까울수록 빠르게. 띠 밖이면 멈춥니다.
      if (fromTop >= 0 && fromTop < ZONE) speed = -Math.ceil(FASTEST * (1 - fromTop / ZONE))
      else if (fromBottom >= 0 && fromBottom < ZONE) speed = Math.ceil(FASTEST * (1 - fromBottom / ZONE))
      else speed = 0

      if (speed !== 0 && frame === 0) frame = requestAnimationFrame(roll)
      else if (speed === 0) stop()
    }

    box.addEventListener('dragover', aim)
    box.addEventListener('drop', stop)
    box.addEventListener('dragleave', stop)
    // 창 밖에서 손을 놓아도 끌기는 끝납니다. 그때도 멈춰야 합니다.
    document.addEventListener('dragend', stop)

    return () => {
      stop()
      box.removeEventListener('dragover', aim)
      box.removeEventListener('drop', stop)
      box.removeEventListener('dragleave', stop)
      document.removeEventListener('dragend', stop)
    }
  }, [box])

  return setBox
}
