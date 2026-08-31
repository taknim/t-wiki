import { useState, type DragEvent } from 'react'
import { formatBytes, DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS } from '../lib/attachments'

interface FolderViewProps {
  path: string
  name: string
  fileCount: number
  size: number
  onDropFiles: (files: File[]) => void
  onPickFiles: () => void
}

/**
 * 폴더를 골랐을 때 나오는 자리.
 * 편집할 것이 없으므로, 이 폴더에 파일을 넣는 자리로 씁니다.
 */
export function FolderView({ path, name, fileCount, size, onDropFiles, onPickFiles }: FolderViewProps) {
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
        <p className="folder-drop-types">
          이미지 {IMAGE_EXTENSIONS.length}종 · 문서 {DOCUMENT_EXTENSIONS.length}종을 받습니다
        </p>
      </div>

      <dl className="folder-facts">
        <div>
          <dt>폴더</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>경로</dt>
          <dd className="mono">{path || '최상위'}</dd>
        </div>
        <div>
          <dt>담긴 파일</dt>
          <dd>{fileCount}개</dd>
        </div>
        <div>
          <dt>크기 합계</dt>
          <dd>{formatBytes(size)}</dd>
        </div>
      </dl>
    </div>
  )
}
