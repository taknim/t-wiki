import type { TrashItem } from '../lib/trash'
import { displayPath, fileNameOf } from '../lib/paths'
import { DocIcon, FolderIcon, TrashIcon } from './icons'

interface TrashViewProps {
  items: TrashItem[]
  onRestore: (item: TrashItem) => void
  onPurge: (item: TrashItem) => void
  onEmpty: () => void
}

/**
 * 휴지통을 골랐을 때 나오는 자리.
 *
 * 지운 것마다 원래 어디 있었는지와 언제 지웠는지를 적고, 되돌리거나 완전히 없앨 수 있습니다.
 * 이름만 적으면 폴더마다 있는 README.md 같은 것을 가릴 수 없어 원래 자리를 함께 적습니다.
 */
export function TrashView({ items, onRestore, onPurge, onEmpty }: TrashViewProps) {
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
