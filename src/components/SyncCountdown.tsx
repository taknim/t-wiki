import { useEffect, useState } from 'react'

interface SyncCountdownProps {
  nextAt: number
  minutes: number
  running: boolean
}

/** 남은 초를 mm:ss 로. 한 시간이 넘으면 h:mm:ss 로 보여 줍니다. */
function format(seconds: number): string {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const rest = safe % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}

/** 다음 자동 동기화까지 남은 시간. 1초마다 줄어듭니다. */
export function SyncCountdown({ nextAt, minutes, running }: SyncCountdownProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const remaining = Math.ceil((nextAt - now) / 1000)

  return (
    <span
      className={running ? 'pill sync-countdown is-running' : 'pill sync-countdown'}
      data-tip={
        running
          ? '동기화하는 중입니다. 끝나면 다시 셉니다'
          : `${minutes}분마다 자동으로 동기화합니다. 다음 실행까지 남은 시간입니다`
      }
      // 1초마다 바뀌는 값이라, 읽어 주는 도구가 계속 끼어들지 않도록 막습니다.
      aria-live="off"
    >
      {/* 도는 동안에는 다음 차례가 없으므로 0 으로 둡니다. 끝나면 다시 셉니다. */}
      {running ? '00:00' : format(remaining)}
    </span>
  )
}
