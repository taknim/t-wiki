import { useEscapeClose } from '../hooks/useEscapeClose'
import { formatKeys, SHORTCUTS, type Shortcut } from '../lib/shortcuts'

interface ShortcutsSheetProps {
  onClose: () => void
}

/** 단축키 목록. 표 하나(lib/shortcuts)를 그대로 그리므로 코드와 어긋날 일이 없습니다. */
export function ShortcutsSheet({ onClose }: ShortcutsSheetProps) {
  useEscapeClose(onClose)

  const groups = new Map<Shortcut['scope'], Shortcut[]>()
  for (const one of SHORTCUTS) groups.set(one.scope, [...(groups.get(one.scope) ?? []), one])

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {/* 두 칸짜리 표라 넓을 까닭이 없습니다. 좁게 둡니다. */}
      <div className="sheet sheet-narrow" role="dialog" aria-modal="true" aria-label="단축키">
        <header className="sheet-head">
          <h2>단축키</h2>
          <button
            type="button"
            className="btn sheet-close"
            aria-label="닫기"
            data-tip="단축키 목록을 닫습니다 (Esc)"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="sheet-body">
          {[...groups].map(([scope, items]) => (
            <section key={scope} className="shortcut-group">
              <h3 className="shortcut-scope">{scope}</h3>
              <ul className="shortcut-list">
                {items.map((one) => (
                  <li key={one.id} className="shortcut-row">
                    <span className="shortcut-label">
                      {one.label}
                      {one.note && <span className="shortcut-note">{one.note}</span>}
                    </span>
                    <kbd className="shortcut-keys">{formatKeys(one.keys)}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
