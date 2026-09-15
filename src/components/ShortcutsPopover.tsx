import { useEffect, useRef } from 'react'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { formatKeys, SHORTCUTS, type Shortcut } from '../lib/shortcuts'

interface ShortcutsPopoverProps {
  onClose: () => void
}

/**
 * 단축키 목록. 단추 아래에 안내처럼 붙어 뜹니다.
 *
 * 덮개도 닫기 단추도 없습니다. 다른 곳을 누르거나 Esc 를 누르면 걷힙니다.
 * 표 하나(lib/shortcuts)를 그대로 그리므로 코드와 어긋날 일이 없습니다.
 */
export function ShortcutsPopover({ onClose }: ShortcutsPopoverProps) {
  useEscapeClose(onClose)
  const box = useRef<HTMLDivElement>(null)

  // 바깥을 누르면 닫습니다. 단추 자체는 부모가 다시 누르면 접히도록 따로 봅니다.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (box.current?.contains(target)) return
      if (target.closest('[data-shortcuts-anchor]')) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const groups = new Map<Shortcut['scope'], Shortcut[]>()
  for (const one of SHORTCUTS) groups.set(one.scope, [...(groups.get(one.scope) ?? []), one])

  return (
    <div ref={box} className="shortcuts-pop" role="dialog" aria-label="단축키">
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
  )
}
