import { useState, type DragEvent } from 'react'
import { ATTACHMENT_GROUPS } from '../lib/attachments'

interface FolderViewProps {
  onDropFiles: (files: File[]) => void
  onPickFiles: () => void
}

/**
 * 폴더를 골랐을 때 나오는 자리.
 * 편집할 것이 없으므로, 이 폴더에 파일을 넣는 자리로 씁니다.
 * 폴더의 경로와 크기는 아래 상태 표시줄에 이미 있으므로 여기서는 되풀이하지 않습니다.
 */
export function FolderView({ onDropFiles, onPickFiles }: FolderViewProps) {
  const [over, setOver] = useState(false)

  const stop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      className="folder-view"
      onDragEnter={(event) => {
        stop(event)
        // 파일을 끌어온 경우에만 반응합니다. 트리 항목을 옮기는 중일 수도 있습니다.
        if ([...event.dataTransfer.types].includes('Files')) setOver(true)
      }}
      onDragOver={stop}
      onDragLeave={(event) => {
        // 안쪽 요소로 옮겨가는 것도 leave 로 잡히므로, 영역을 정말 벗어났는지 확인합니다.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(event) => {
        stop(event)
        setOver(false)
        const files = [...event.dataTransfer.files]
        if (files.length > 0) onDropFiles(files)
      }}
    >
      <div className={over ? 'folder-drop is-over' : 'folder-drop'}>
        <p className="folder-drop-title">{over ? '여기에 놓으세요' : '이 폴더에 파일 넣기'}</p>
        <p className="folder-drop-hint">
          파일을 끌어다 놓거나{' '}
          <button type="button" className="link-button" onClick={onPickFiles}>
            골라서 넣기
          </button>
        </p>
        {/*
          갈래는 `attachments.ts` 에서 정한 것을 그대로 그립니다. 여기서 묶었더니 형식이
          늘 때마다 엉뚱한 갈래로 흘러들어 갔습니다.
        */}
        <dl className="folder-drop-types">
          <dt>위키 문서</dt>
          <dd>
            md
            <span className="folder-drop-note">크기 제한 없이 동기화되고 링크·검색·목차가 모두 됩니다</span>
          </dd>
          <dt>첨부</dt>
          <dd>
            <ul>
              {ATTACHMENT_GROUPS.map((group) => (
                <li key={group.name}>
                  <strong>{group.name}</strong> {group.extensions.join(', ')}
                  {group.note && <span className="folder-drop-note">{group.note}</span>}
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      </div>
    </div>
  )
}
