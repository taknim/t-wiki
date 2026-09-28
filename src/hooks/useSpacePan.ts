import { useEffect, useRef, useState } from 'react'

/**
 * 스페이스를 누르고 있는 동안 끌어서 칸을 옮겨 봅니다.
 *
 * 그림을 크게 키워 놓으면 보이지 않는 자리를 보러 가야 하는데, 굴림대까지 손을 옮기는 것은
 * 번거롭고 그림 수정 화면에서는 끌기가 곧 고르기라 아예 쓸 수 없습니다. 그림 다루는
 * 프로그램들이 오래 써 온 길을 그대로 씁니다.
 *
 * **켜 둔 동안에는 스페이스를 늘 가로챕니다.** 브라우저는 스페이스를 "한 화면 내리기"로
 * 쓰는데, 손이 어디 있는지 따져 가며 가로챘더니 그 밖에서는 화면이 덜컥 내려갔습니다.
 * 그 대신 그동안에는 스페이스로 단추를 누를 수 없습니다 — 자판만 쓰는 사람은 Enter 로
 * 누르면 됩니다. 글을 치는 자리에서는 그대로 빈칸입니다.
 *
 * 옮길 것이 없을 때는(칸에 다 들어오는 그림) 꺼 두어야 합니다. 가로챌 까닭이 없습니다.
 *
 * 굴릴 칸은 ref 가 아니라 **찾아 주는 함수**로 받습니다. ref 를 받아 그 안의 값을 고치면
 * "빌려 온 것을 건드린다" 고 잡힙니다(oxlint react(immutability)).
 */
export function useSpacePan(pane: () => HTMLElement | null, active: boolean) {
  /** 스페이스를 누르고 있는지. 손 모양을 바꾸는 데 씁니다. */
  const [held, setHeld] = useState(false)
  /** 끄는 중인 손의 자리와 그때의 굴린 자리. */
  const from = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    if (!active) return

    const typing = (target: EventTarget | null) => target instanceof HTMLElement
      && target.closest('input, textarea, [contenteditable]') !== null

    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || typing(event.target)) return
      // 누르고 있는 동안 화면이 한 쪽씩 내려가지 않게 합니다. 눌린 채 되풀이되는 것도 막습니다.
      event.preventDefault()
      if (!event.repeat) setHeld(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      setHeld(false)
      from.current = null
    }
    // 창을 떠나면 글쇠를 뗀 것을 못 받습니다. 손 모양이 그대로 남지 않게 함께 거둡니다.
    const leave = () => {
      setHeld(false)
      from.current = null
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', leave)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', leave)
      leave()
    }
  }, [active])

  return {
    held,
    /** 지금 끌어 옮기는 중인지. */
    moving: () => from.current !== null,
    /** 옮기기를 시작합니다. 스페이스를 누르고 있지 않으면 아무 일도 하지 않고 false. */
    begin(event: { clientX: number; clientY: number }): boolean {
      const box = pane()
      if (!held || !box) return false
      from.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop }
      return true
    },
    /** 손이 간 만큼 칸을 반대로 굴려 그림이 따라오게 합니다. */
    drag(event: { clientX: number; clientY: number }): boolean {
      const start = from.current
      const box = pane()
      if (!start || !box) return false
      box.scrollLeft = start.left - (event.clientX - start.x)
      box.scrollTop = start.top - (event.clientY - start.y)
      return true
    },
    end() {
      from.current = null
    },
  }
}
