import { useEffect, useState } from 'react'
import type { TrashItem, TrashPeek } from '../lib/trash'
import { formatBytes } from '../lib/attachments'
import { displayPath, fileNameOf } from '../lib/paths'
import { DocIcon, FolderIcon, TrashIcon } from './icons'

interface TrashViewProps {
  items: TrashItem[]
  onRestore: (item: TrashItem) => void
  onPurge: (item: TrashItem) => void
  onEmpty: () => void
  /** 지운 것의 앞부분만 읽어 옵니다. */
  onPeek: (item: TrashItem) => Promise<TrashPeek>
}

/**
 * 지운 것이 무엇이었는지 엿보는 칸.
 *
 * 되돌릴지 없앨지 정하려면 이름과 자리만으로는 모자랄 때가 있습니다. 그렇다고 편집기를
 * 열어 주면 되돌리기와 뜻이 겹치므로 **읽기만, 앞부분만** 보여 줍니다.
 * 한 번에 한 줄만 펴 둡니다 — 여럿을 펴 두면 목록이 길어져 도리어 찾기 어렵습니다.
 */
function TrashPeekView({ item, onPeek }: { item: TrashItem; onPeek: (item: TrashItem) => Promise<TrashPeek> }) {
  const [peek, setPeek] = useState<TrashPeek | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let made: string | null = null
    onPeek(item).then(
      (result) => {
        if (!alive) {
          // 이미 접힌 뒤에 닿았으면 주소를 그 자리에서 거둡니다. 두면 그림이 메모리에 남습니다.
          if (result.kind === 'image') URL.revokeObjectURL(result.url)
          return
        }
        if (result.kind === 'image') made = result.url
        setPeek(result)
      },
      (cause: unknown) => alive && setError(cause instanceof Error ? cause.message : String(cause)),
    )
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [item, onPeek])

  if (error) return <p className="trash-peek is-empty">읽지 못했습니다: {error}</p>
  if (!peek) return <p className="trash-peek is-empty">읽는 중…</p>

  if (peek.kind === 'text') {
    return (
      <div className="trash-peek">
        <pre className="trash-peek-text">{peek.text}</pre>
        <p className="hint" style={{ margin: 0 }}>
          {formatBytes(peek.bytes)}
          {peek.truncated && ' · 앞부분만 보여 줍니다'}
        </p>
      </div>
    )
  }
  if (peek.kind === 'image') {
    return (
      <div className="trash-peek">
        {/* 그림은 칸 안에 가운데로 앉힙니다. 칸 키는 글·목록과 같아 줄마다 들쭉날쭉하지 않습니다. */}
        <div className="trash-peek-figure">
          <img className="trash-peek-image" src={peek.url} alt={`${fileNameOf(item.path)} 미리보기`} />
        </div>
        <p className="hint" style={{ margin: 0 }}>{formatBytes(peek.bytes)}</p>
      </div>
    )
  }
  if (peek.kind === 'dir') {
    return (
      <div className="trash-peek">
        {peek.entries.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>빈 폴더입니다.</p>
        ) : (
          <ul className="trash-peek-entries">
            {peek.entries.map((entry) => (
              <li key={entry.name}>
                <span className="trash-icon" aria-hidden="true">
                  {entry.kind === 'dir' ? <FolderIcon /> : <DocIcon />}
                </span>
                {entry.name}
              </li>
            ))}
          </ul>
        )}
        {peek.more > 0 && <p className="hint" style={{ margin: 0 }}>그 밖에 {peek.more}개 더 있습니다.</p>}
      </div>
    )
  }
  return (
    <p className="trash-peek is-empty">
      글로 볼 수 없는 파일입니다 ({formatBytes(peek.bytes)}). 되돌리면 그대로 살아납니다.
    </p>
  )
}

/**
 * 휴지통을 골랐을 때 나오는 자리.
 *
 * 지운 것마다 원래 어디 있었는지와 언제 지웠는지를 적고, 되돌리거나 완전히 없앨 수 있습니다.
 * 이름만 적으면 폴더마다 있는 README.md 같은 것을 가릴 수 없어 원래 자리를 함께 적습니다.
 */
export function TrashView({ items, onRestore, onPurge, onEmpty, onPeek }: TrashViewProps) {
  const [opened, setOpened] = useState<string | null>(null)

  return (
    <div className="trash-view">
      <div className="trash-head">
        <p className="hint" style={{ margin: 0 }}>
          여기 있는 것은 <strong>휴지통 비우기</strong>나 <strong>완전 삭제</strong>를 눌러야 없어집니다.
          휴지통은 동기화되지 않습니다.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          data-tip="휴지통에 든 것을 모두 없앱니다. 되돌릴 수 없습니다"
          disabled={items.length === 0}
          onClick={onEmpty}
        >
          <TrashIcon />
          휴지통 비우기
        </button>
      </div>

      {items.length === 0 ? (
        <p className="panel-empty">휴지통이 비어 있습니다.</p>
      ) : (
        <ul className="trash-list">
          {items.map((item) => {
            const parent = item.path.split('/').slice(0, -1).join('/')
            return (
              <li key={item.id} className="trash-item">
                <span className="trash-icon" aria-hidden="true">
                  {item.kind === 'dir' ? <FolderIcon /> : <DocIcon />}
                </span>
                <div className="trash-text">
                  <span className="trash-name">{fileNameOf(item.path)}</span>
                  <span className="trash-meta">
                    <span data-tip="원래 있던 폴더">{displayPath(parent)}</span>
                    {' · '}
                    <span data-tip="휴지통으로 옮긴 때">
                      {new Date(item.trashedAt).toLocaleString('ko-KR', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </span>
                </div>
                <div className="trash-tools">
                  <button
                    type="button"
                    className={opened === item.id ? 'btn is-active' : 'btn'}
                    data-tip="무엇이었는지 앞부분만 봅니다. 고치지는 못합니다"
                    aria-expanded={opened === item.id}
                    onClick={() => setOpened((now) => (now === item.id ? null : item.id))}
                  >
                    미리보기
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-tip={`${displayPath(item.path)} 로 되돌립니다`}
                    onClick={() => onRestore(item)}
                  >
                    복원
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-tip="휴지통에서도 없앱니다. 되돌릴 수 없습니다"
                    onClick={() => onPurge(item)}
                  >
                    완전 삭제
                  </button>
                </div>
                {opened === item.id && <TrashPeekView item={item} onPeek={onPeek} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
