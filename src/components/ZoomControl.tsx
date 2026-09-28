import { ActualSizeIcon, FitIcon, MinusIcon, PlusIcon } from './icons'
import { stepZoom } from '../lib/zoom'

interface ZoomControlProps {
  /** 지금 화면에 그려진 배율. 화면 맞춤일 때는 줄어든 그 값입니다. */
  scale: number
  /** 화면 맞춤으로 보고 있는지. 배율을 정해 두면 false. */
  fitted: boolean
  /** 배율을 정합니다. null 이면 화면 맞춤으로 돌아갑니다. */
  onZoom: (next: number | null) => void
  /**
   * 화면 맞춤 단추를 세울지. 그림을 고칠 때는 세우지 않습니다 —
   * 잘라 낼 자리를 재려면 배율이 늘 또렷한 값이어야 합니다.
   */
  canFit?: boolean
}

/**
 * 그림을 크게·작게 보는 단추.
 *
 * 제목 줄이 아니라 **그림 위에 떠 있습니다**. 문서의 맨 위·맨 아래 단추와 같은 자리라,
 * 그림을 보던 눈과 손이 멀리 가지 않습니다. 세로로 화면 맞춤 · 원본 크기 · 확대 · 배율 · 축소.
 *
 * 확대·축소는 **지금 그려진 배율에서** 한 걸음 옮깁니다. 화면 맞춤으로 36% 로 줄어 있는데
 * 100% 에서부터 세면, 키우려고 눌렀는데 오히려 더 작아지는 일이 생깁니다.
 */
export function ZoomControl({ scale, fitted, onZoom, canFit = true }: ZoomControlProps) {
  const percent = Math.round(scale * 100)

  return (
    <div className="zoom-control" role="group" aria-label="보기 배율">
      {canFit && (
        <button
          type="button"
          className={fitted ? 'zoom-btn is-on' : 'zoom-btn'}
          aria-label="화면에 맞추기"
          aria-pressed={fitted}
          data-tip="칸에 들어오도록 맞춥니다 (0)"
          onClick={() => onZoom(null)}
        >
          <FitIcon />
        </button>
      )}
      <button
        type="button"
        className={!fitted && scale === 1 ? 'zoom-btn is-on' : 'zoom-btn'}
        aria-label="원본 크기"
        aria-pressed={!fitted && scale === 1}
        data-tip="그림이 지닌 크기 그대로 봅니다 (1)"
        onClick={() => onZoom(1)}
      >
        <ActualSizeIcon />
      </button>
      <button
        type="button"
        className="zoom-btn"
        aria-label="확대"
        data-tip="한 걸음 크게 봅니다 (+)"
        onClick={() => onZoom(stepZoom(scale, 1))}
      >
        <PlusIcon />
      </button>
      {/* 지금 몇 할인지. 단추가 아니라 읽는 자리입니다 — 맞춤과 원본은 위에 따로 있습니다. */}
      <span className="zoom-now" aria-live="off">{percent}%</span>
      <button
        type="button"
        className="zoom-btn"
        aria-label="축소"
        data-tip="한 걸음 작게 봅니다 (−)"
        onClick={() => onZoom(stepZoom(scale, -1))}
      >
        <MinusIcon />
      </button>
    </div>
  )
}
