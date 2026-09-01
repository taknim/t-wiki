import { ColumnsIcon, EyeIcon, PencilIcon } from './icons'
import type { ViewMode } from '../types'

interface ViewModeSwitchProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

const MODES: { key: ViewMode; label: string; tip: string }[] = [
  { key: 'edit', label: '편집', tip: '원문만 보기' },
  { key: 'split', label: '나란히', tip: '원문과 미리보기를 나란히 보기' },
  { key: 'preview', label: '미리보기', tip: '결과만 보기' },
]

/** 문서 제목 옆에 섭니다. 보여 줄 것이 있는 문서에서만 나옵니다. */
export function ViewModeSwitch({ mode, onChange }: ViewModeSwitchProps) {
  return (
    <div className="mode-switch" role="group" aria-label="보기 모드">
      {MODES.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className={mode === entry.key ? 'is-active' : ''}
          data-tip={entry.tip}
          onClick={() => onChange(entry.key)}
        >
          {entry.key === 'edit' ? <PencilIcon /> : entry.key === 'split' ? <ColumnsIcon /> : <EyeIcon />}
          <span>{entry.label}</span>
        </button>
      ))}
    </div>
  )
}
