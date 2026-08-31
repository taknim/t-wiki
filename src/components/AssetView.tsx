import { useEffect, useRef, useState } from 'react'
import {
  attachmentKind, formatBytes, isAttachment, MAX_ATTACHMENT_BYTES, withMime,
} from '../lib/attachments'
import { readBinaryFile } from '../lib/fsAccess'

interface AssetViewProps {
  root: FileSystemDirectoryHandle
  path: string
  size: number
}

/** 텍스트 미리보기에서 한 번에 읽을 최대 길이. 큰 로그 파일로 화면이 멎지 않게 합니다. */
const TEXT_PREVIEW_LIMIT = 200_000

/**
 * 마크다운이 아닌 파일은 고쳐 쓸 수 없으므로 보여 주기만 합니다.
 * 이미지와 PDF 는 그대로 띄우고, 텍스트 계열은 내용을 읽어 보여 줍니다.
 */
export function AssetView({ root, path, size }: AssetViewProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const objectUrl = useRef<string | null>(null)
  const kind = attachmentKind(path)

  // 파일이 바뀌면 이전 내용을 렌더 중에 비웁니다.
  // effect 안에서 비우면 옛 이미지가 한 프레임 남습니다.
  const [shownPath, setShownPath] = useState(path)
  if (shownPath !== path) {
    setShownPath(path)
    setUrl(null)
    setText(null)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const blob = withMime(await readBinaryFile(root, path), path)
        if (cancelled) return

        if (kind === 'text') {
          const slice = blob.slice(0, TEXT_PREVIEW_LIMIT)
          setText(await slice.text())
          return
        }

        // 이미지와 PDF 는 브라우저가 직접 그리도록 임시 주소를 만들어 줍니다.
        const next = URL.createObjectURL(blob)
        objectUrl.current = next
        setUrl(next)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = null
      }
    }
  }, [root, path, kind])

  const name = path.split('/').pop() ?? path
  const tooBig = isAttachment(path) && size > MAX_ATTACHMENT_BYTES

  return (
    <div className="asset-view">
      {tooBig && (
        <p className="asset-note">
          {formatBytes(MAX_ATTACHMENT_BYTES)} 가 넘어 동기화하지 않습니다. 이 컴퓨터에만 있습니다.
        </p>
      )}

      {error && <p className="status status-error">{error}</p>}

      {kind === 'image' && url && <img className="asset-image" src={url} alt={name} />}

      {kind === 'pdf' && url && <iframe className="asset-frame" src={url} title={name} />}

      {kind === 'text' && text !== null && (
        <pre className="asset-text">
          {text}
          {size > TEXT_PREVIEW_LIMIT && '\n\n… 이후는 생략했습니다'}
        </pre>
      )}

      {kind === 'binary' && (
        <p className="asset-note">
          이 형식은 미리보기를 지원하지 않습니다. 파일은 그대로 폴더에 있습니다.
        </p>
      )}
    </div>
  )
}
