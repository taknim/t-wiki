import { useEffect, useState } from 'react'
import { SaveIcon } from './icons'

interface SaveStateProps {
  /** 아직 파일에 쓰지 않은 것이 있는지. */
  dirty: boolean
  /**
   * 자동 저장이 예정된 시각(ms). 자동 저장이 꺼져 있거나 쓸 것이 없으면 null.
   * 남은 시간은 여기서 헤아립니다 — 저장을 거는 쪽과 적는 쪽이 같은 값을 봐야 어긋나지 않습니다.
   */
  dueAt: number | null
  /** 설정에 정해 둔 기다림(초). 적는 수가 이보다 커지지 않게 눌러 둡니다. */
  seconds: number
  onSave: () => void
}

/**
 * 제목 옆의 저장 상태.
 *
 * 예전에는 `저장 중…` / `저장됨` 두 마디뿐이었습니다. 자동 저장을 끌 수 있게 되면서
 * 그 말로는 모자랍니다 — 꺼 둔 채 `저장 중…` 이라고 적으면 저절로 써 줄 것처럼 읽힙니다.
 * 그래서 쓸 것이 있으면 **저장 단추**를 세우고, 그 옆에 자동 저장이 언제 도는지(또는
 * 꺼져 있다는 것을) 적습니다. 단추는 자동 저장이 켜져 있어도 나옵니다. 기다리지 않고
 * 지금 쓰고 싶을 때가 있기 때문입니다.
 */
export function SaveState({ dirty, dueAt, seconds, onSave }: SaveStateProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (dueAt === null) return
    // 초 단위로 적지만 눈금이 늦게 넘어가지 않도록 그보다 자주 봅니다.
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [dueAt])

  if (!dirty) return <span className="pill pill-ok">저장됨</span>

  /*
   * 쉬는 동안에는 시계가 멎어 있습니다(셀 것이 없으면 재지 않습니다). 그래서 다시 치기
   * 시작한 첫 그림에서는 지난 시각으로 재어 엉뚱하게 큰 수가 잠깐 비칠 수 있습니다.
   * 정해 둔 기다림보다 클 수는 없으므로 거기서 눌러 둡니다.
   */
  const left = dueAt === null
    ? null
    : Math.max(0, Math.min(Math.ceil(seconds), Math.ceil((dueAt - now) / 1000)))

  /*
   * 단추가 먼저, 말이 뒤입니다. 단추 자리가 고정되어 있어야 상태가 바뀌어도 손이 헤매지 않습니다.
   * 단추에는 아이콘만 둡니다 — 곁의 말이 이미 글자라, 거기에 글자를 더하면 어느 쪽이 눌리는
   * 것인지 되레 헷갈립니다. 색도 입히지 않습니다. 눈에 걸려야 하는 것은 단추가 아니라
   * "아직 안 들어갔다"는 말이기 때문입니다.
   */
  return (
    <>
      <button
        type="button"
        className="btn btn-icon doc-save"
        aria-label="지금 저장"
        data-tip="지금 파일에 씁니다 (⌘S)"
        onClick={onSave}
      >
        <SaveIcon />
      </button>
      <span
        className="pill pill-dirty"
        data-tip={dueAt === null
          ? '고친 것이 아직 파일에 들어가지 않았습니다. 저장 단추나 ⌘S 로 씁니다 (설정 → 일반 → 자동 저장)'
          : '손을 멈추면 이만큼 뒤에 저절로 씁니다 (설정 → 일반 → 자동 저장)'}
        // 1초마다 바뀌는 값이라, 읽어 주는 도구가 계속 끼어들지 않도록 막습니다.
        aria-live="off"
      >
        {left === null ? '변경됨' : left > 0 ? `${left}초 뒤 자동 저장` : '자동 저장하는 중…'}
      </span>
    </>
  )
}
