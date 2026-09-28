import { MinusIcon, PlusIcon } from './icons'
import { stepZoom, ZOOMS } from '../lib/zoom'

interface ZoomControlProps {
  zoom: number
  onZoom: (next: number) => void
  /** 화면에 맞춰 보는 자리로 돌아가는 단추. 없으면 100% 로만 되돌립니다. */
  onFit?: () => void
  fitted?: boolean
}

/**
 * 보기 배율 손잡이.
 *
 * 그림을 볼 때도, 잘라 낼 자리를 고를 때도 같은 것이 필요합니다. 작은 그림에서 몇 픽셀을
 * 집어내려면 키워 놓아야 하고, 큰 그림은 줄여 놓아야 한눈에 들어옵니다.
 * 그래서 한 자리에 만들어 두 곳에서 같이 씁니다 — 생김새와 걸음이 어긋나지 않습니다.
 */
export function ZoomControl({ zoom, onZoom, onFit, fitted = false }: ZoomControlProps) {
  return (
    <div className="zoom-control" role="group" aria-label="보기 배율">
      <button
        type="button"
        className="btn btn-icon"
        aria-label="축소"
        data-tip="작게 봅니다"
        disabled={!fitted && zoom === ZOOMS[0]}
        onClick={() => onZoom(stepZoom(zoom, -1))}
      >
        <MinusIcon />
      </button>
      {/* 지금 배율. 눌러서 화면에 맞추거나 본디 크기로 돌아갑니다. */}
      <button
        type="button"
        className="btn btn-small zoom-now"
        data-tip={onFit ? '눌러서 화면에 맞춥니다' : '눌러서 본디 크기로 돌아갑니다'}
        onClick={() => (onFit ? onFit() : onZoom(1))}
      >
        {fitted ? '맞춤' : `${Math.round(zoom * 100)}%`}
      </button>
      <button
        type="button"
        className="btn btn-icon"
        aria-label="확대"
        data-tip="크게 봅니다"
        disabled={!fitted && zoom === ZOOMS[ZOOMS.length - 1]}
        onClick={() => onZoom(stepZoom(zoom, 1))}
      >
        <PlusIcon />
      </button>
    </div>
  )
}
