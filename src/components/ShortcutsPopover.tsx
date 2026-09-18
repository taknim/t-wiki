import { useEffect, useRef, useState } from 'react'
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
/** 화면 가장자리에서 띄울 만큼. 창 끝에 붙으면 잘린 것처럼 보입니다. */
const EDGE = 8

export function ShortcutsPopover({ onClose }: ShortcutsPopoverProps) {
  useEscapeClose(onClose)
  const box = useRef<HTMLDivElement>(null)

  /*
   * 자리는 단추 아래이되 화면 안에 들어오게 잡습니다.
   *
   * 단추의 오른쪽 끝에 맞춰 두면 좁은 화면에서는 왼쪽이 화면 밖으로 잘립니다.
   * 단추를 기준으로 오른쪽을 맞추되, 왼쪽이 가장자리 안쪽에 들도록 밀고, 너비도
   * 화면 폭 안에서 정합니다. 창 크기가 바뀌면 다시 잽니다.
   */
  const [spot, setSpot] = useState<{ top: number; right: number; width: number } | null>(null)
  useEffect(() => {
    const place = () => {
      const anchor = document.querySelector<HTMLElement>('[data-shortcuts-anchor]')
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(440, window.innerWidth - EDGE * 2)
      // 단추 오른쪽 끝에서 왼쪽으로 width 만큼. 화면 왼쪽을 넘으면 그만큼 오른쪽으로 옮깁니다.
      const right = Math.max(EDGE, Math.min(window.innerWidth - rect.right, window.innerWidth - EDGE - width))
      setSpot({ top: rect.bottom + 6, right, width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])

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
    <div
      ref={box}
      className="shortcuts-pop"
      role="dialog"
      aria-label="단축키"
      style={spot ? { top: spot.top, right: spot.right, width: spot.width } : { visibility: 'hidden' }}
    >
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
