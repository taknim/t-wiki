import { ColumnsIcon, EyeIcon, PencilIcon } from './icons'
import type { ViewMode } from '../types'

interface ViewModeSwitchProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

const MODES: { key: ViewMode; label: string; tip: string }[] = [
  // 글자를 지웠으므로 안내에 이름을 함께 담습니다. 아이콘만으로는 뜻이 좁습니다.
  { key: 'edit', label: '편집', tip: '편집 · 원문만 보기' },
  { key: 'split', label: '나란히', tip: '나란히 · 원문과 미리보기를 함께 보기' },
  { key: 'preview', label: '미리보기', tip: '미리보기 · 결과만 보기' },
]

/**
 * 문서 제목 옆에 섭니다. 보여 줄 것이 있는 문서에서만 나옵니다.
 *
 * 아이콘 옆에 이름을 함께 적습니다. 그림만으로는 어느 것이 어느 모드인지
 * 눌러 봐야 알고, 세 아이콘은 서로 닮았습니다.
 */
export function ViewModeSwitch({ mode, onChange }: ViewModeSwitchProps) {
  return (
    <div className="head-tool">
      {/* 단추 넷이 나란히 선 다른 줄(배경)과 헷갈리지 않도록 무엇을 고르는지 적어 둡니다. */}
      <span className="head-tool-label">보기 모드</span>
      <div className="mode-switch" role="group" aria-label="보기 모드">
        {MODES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={mode === entry.key ? 'is-active' : ''}
            data-tip={entry.tip}
            aria-label={entry.label}
            aria-pressed={mode === entry.key}
            onClick={() => onChange(entry.key)}
          >
            {entry.key === 'edit'
              ? <PencilIcon />
              : entry.key === 'split' ? <ColumnsIcon /> : <EyeIcon />}
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  )
}
