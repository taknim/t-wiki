import { useEffect, useRef } from 'react'

/*
 * Esc 로 닫는 창들의 차례.
 *
 * 창은 겹쳐 뜹니다. 설정 위에 동기화 결과가, 그 위에 확인 창이 뜨는 식입니다.
 * Esc 는 늘 맨 위에 있는 것 하나만 닫아야 합니다. 아래 것이 먼저 닫히면
 * 위에 남은 창이 무엇에 딸린 것인지 알 수 없게 됩니다.
 *
 * 뜬 차례대로 쌓고 마지막 것만 답합니다. 모듈 하나에 두는 까닭은 서로 다른
 * 컴포넌트가 같은 줄을 봐야 하기 때문입니다.
 */
const stack: object[] = []

/**
 * 이 창이 떠 있는 동안 Esc 를 받습니다.
 *
 * `active` 가 거짓이면 줄에서 빠집니다. 창을 늘 그려 두고 값으로만 여닫는
 * 곳에서는, 뜨는 그때 줄에 들어가야 차례가 맞습니다.
 */
export function useEscapeClose(onClose: () => void, active = true): void {
  // 닫는 방법은 그릴 때마다 새로 만들어집니다. 줄에는 자리만 두고 방법은 여기서 봅니다.
  const latest = useRef(onClose)
  useEffect(() => {
    latest.current = onClose
  })

  useEffect(() => {
    if (!active) return

    const seat = {}
    stack.push(seat)

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // 위에 다른 창이 있으면 그쪽 몫입니다.
      if (stack[stack.length - 1] !== seat) return
      latest.current()
    }

    document.addEventListener('keydown', onKey)
    return () => {
      const at = stack.indexOf(seat)
      if (at >= 0) stack.splice(at, 1)
      document.removeEventListener('keydown', onKey)
    }
  }, [active])
}
