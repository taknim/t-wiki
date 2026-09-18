import { useEffect, useState } from 'react'
import type { SyncStatus, SyncStep } from '../hooks/useGitHubSync'

interface SyncProgressProps {
  status: SyncStatus
}

/** 화면 가장자리에서 띄울 만큼. */
const EDGE = 8

/** 갈래마다 지금 하는 일을 짧게. 결과 창의 이름(커밋(신규) 같은)은 끝난 뒤의 말이라 여기서는 쓰지 않습니다. */
const DOING: Record<SyncStep['action'], string> = {
  'upload-new': '올리는 중',
  'upload-update': '올리는 중',
  'download-new': '내려받는 중',
  'download-update': '내려받는 중',
  'delete-local': '지우는 중',
  'delete-remote': '저장소에서 지우는 중',
  conflict: '충돌을 푸는 중',
  skip: '건너뜀',
  commit: '커밋하는 중',
}

/**
 * 동기화 단추 아래에 붙는 진행 창.
 *
 * 단추 안의 막대는 몇 할인지만 보여 줍니다. 무엇을 옮기고 있는지는 여기 적습니다.
 * 도는 동안만 뜨고 끝나면 스스로 걷힙니다. 덮개도 닫기 단추도 없습니다.
 * 자리는 단축키 목록과 같은 규칙으로 화면 안에 맞춥니다.
 */
export function SyncProgress({ status }: SyncProgressProps) {
  const [spot, setSpot] = useState<{ top: number; right: number; width: number } | null>(null)
  useEffect(() => {
    const place = () => {
      const anchor = document.querySelector<HTMLElement>('[data-sync-anchor]')
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - EDGE * 2)
      const right = Math.max(EDGE, Math.min(window.innerWidth - rect.right, window.innerWidth - EDGE - width))
      setSpot({ top: rect.bottom + 6, right, width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])

  const progress = status.progress
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  return (
    <div
      className="sync-progress"
      role="status"
      aria-live="polite"
      style={spot ? { top: spot.top, right: spot.right, width: spot.width } : { visibility: 'hidden' }}
    >
      <p className="sync-progress-title">
        <span>{status.message}</span>
        {progress && progress.total > 0 && (
          <span className="sync-progress-count">{progress.done}/{progress.total}</span>
        )}
      </p>
      {/* 몇 할인지 모르는 단계(비교하는 중)에서는 막대를 채우지 않고 흐르게 둡니다. */}
      <div className={percent === null ? 'sync-progress-bar is-busy' : 'sync-progress-bar'}>
        <span style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      {progress && progress.steps.length > 0 && (
        <ul className="sync-progress-steps">
          {progress.steps.map((step, at) => (
            <li key={step.path} className={at === 0 ? 'is-now' : ''}>
              <span className="sync-progress-verb">{DOING[step.action]}</span>
              {step.action !== 'commit' && <span className="sync-progress-path">{step.path}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
