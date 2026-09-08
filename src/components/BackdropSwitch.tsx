import type { ImageBackdrop } from '../types'

interface BackdropSwitchProps {
  backdrop: ImageBackdrop
  onChange: (next: ImageBackdrop) => void
}

const BACKDROPS: { key: ImageBackdrop; label: string; tip: string }[] = [
  { key: 'theme', label: '기존', tip: '손대지 않은 본디 바탕. 지금 테마의 색입니다' },
  { key: 'light', label: '밝게', tip: '어두운 그림을 흰 바탕에 놓고 봅니다' },
  { key: 'mid', label: '중간', tip: '밝지도 어둡지도 않은 회색. 양쪽 다 아닌 그림에 씁니다' },
  { key: 'dark', label: '어둡게', tip: '흰 로고처럼 밝은 그림을 어두운 바탕에 놓고 봅니다' },
]

/**
 * 그림 제목 옆에 섭니다. 이미지를 골랐을 때만 나옵니다.
 *
 * 투명한 그림이나 화면과 색이 비슷한 그림은 바탕에 묻혀 보이지 않습니다.
 * 어느 바탕이 알맞은지는 그림마다 다르므로 알아맞히지 않고 고르게 둡니다.
 * 문서의 보기 모드와 같은 자리, 같은 모양입니다.
 */
export function BackdropSwitch({ backdrop, onChange }: BackdropSwitchProps) {
  return (
    <div className="head-backdrop">
      {/* 글자만 넷 세워 두면 무엇을 고르는 자리인지 알 수 없습니다. */}
      <span className="backdrop-label">배경</span>
      <div className="backdrop-switch" role="group" aria-label="이미지 배경">
        {BACKDROPS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={backdrop === entry.key ? 'is-active' : ''}
            data-tip={entry.tip}
            aria-pressed={backdrop === entry.key}
            onClick={() => onChange(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  )
}
