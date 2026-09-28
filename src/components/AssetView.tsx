import { useEffect, useRef, useState } from 'react'
import {
  attachmentKind, formatBytes, isAttachment, legacyOffice, MAX_ATTACHMENT_BYTES, withMime,
} from '../lib/attachments'
import { readBinaryFile } from '../lib/fsAccess'
import { imageFormatName } from '../lib/imageEdit'
import { ZoomControl } from './ZoomControl'
import { useSpacePan } from '../hooks/useSpacePan'
import { SheetPreview, WordPreview } from './OfficePreview'
import type { ImageBackdrop } from '../types'

interface AssetViewProps {
  root: FileSystemDirectoryHandle
  path: string
  size: number
  /** 이미지를 그려 볼지. 꺼 두면 파일을 읽지도 않고 안내만 내놓습니다. */
  imagePreview: boolean
  /** 워드·엑셀을 그려 볼지. 꺼 두면 읽는 벌도 내려받지 않습니다. */
  officePreview: boolean
  /** 그림 뒤에 깔 바탕. 고르는 자리는 제목 줄입니다. */
  backdrop: ImageBackdrop
  /**
   * 보기 배율. null 이면 화면에 맞춰 봅니다(예전 그대로).
   * 손잡이는 제목 줄에 있고, 값은 App 이 들고 있습니다 — 파일을 바꿔도 이어지게 하려면
   * 이 부품이 사라졌다 다시 서는 것과 상관없는 자리에 있어야 합니다.
   */
  zoom?: number | null
  /** 배율을 바꿀 때. null 이면 화면 맞춤으로 돌아갑니다. 없으면 손잡이를 내놓지 않습니다. */
  onZoom?: (next: number | null) => void
  /** 파일이 바뀐 때. 덮어쓴 뒤 같은 경로라도 다시 읽어야 합니다. */
  version?: number
}

/** 텍스트 미리보기에서 한 번에 읽을 최대 길이. 큰 로그 파일로 화면이 멎지 않게 합니다. */
const TEXT_PREVIEW_LIMIT = 200_000

/**
 * 마크다운이 아닌 파일은 고쳐 쓸 수 없으므로 보여 주기만 합니다.
 * 이미지와 PDF 는 그대로 띄우고, 텍스트 계열은 내용을 읽어 보여 줍니다.
 */
export function AssetView({
  root, path, size, imagePreview, officePreview, backdrop, zoom = null, onZoom, version = 0,
}: AssetViewProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 그림의 본디 크기. 그려 놓고 보면 창에 맞춰 줄어 있어, 원래 크기를 알 길이 없습니다.
  const [pixels, setPixels] = useState<{ width: number; height: number } | null>(null)
  // 지금 화면에 그려진 크기. 칸 너비와 설정에 따라 시시각각 달라집니다.
  const [drawn, setDrawn] = useState<{ width: number; height: number } | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const objectUrl = useRef<string | null>(null)
  const kind = attachmentKind(path)

  const canvasRef = useRef<HTMLDivElement>(null)
  /*
   * 스페이스를 누른 채 끌어 그림을 옮겨 봅니다. 수정 화면과 같은 손잡이입니다.
   * 배율을 정해 두었을 때만 켭니다 — 칸에 다 들어오는 그림은 옮길 것이 없고,
   * 그때까지 스페이스를 가로채면 제 할 일(한 화면 내리기)을 막게 됩니다.
   */
  const pan = useSpacePan(() => canvasRef.current, kind === 'image' && zoom !== null)

  // 파일이 바뀌면 이전 내용을 렌더 중에 비웁니다.
  // effect 안에서 비우면 옛 이미지가 한 프레임 남습니다.
  const [shownPath, setShownPath] = useState(path)
  if (shownPath !== path) {
    setShownPath(path)
    setUrl(null)
    setText(null)
    setError(null)
    setPixels(null)
    setDrawn(null)
  }

  // 꺼 두었으면 이미지는 읽지 않습니다. 안 보여 줄 것을 메모리에 올릴 까닭이 없습니다.
  const skipped = kind === 'image' && !imagePreview

  // 보다가 껐을 때도 같은 자리에서 비웁니다. 주소 자체는 effect 정리가 거두어 갑니다.
  const [wasSkipped, setWasSkipped] = useState(skipped)
  if (wasSkipped !== skipped) {
    setWasSkipped(skipped)
    if (skipped) setUrl(null)
  }

  const office = kind === 'sheet' || kind === 'word'
  // 꺼 두었으면 벌을 내려받는 자리(OfficePreview)를 아예 그리지 않습니다.
  const officeOff = office && !officePreview

  useEffect(() => {
    if (skipped || office) return
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
  }, [root, path, kind, skipped, office, version])

  /*
   * 그려진 크기는 창을 늘이거나 설정을 바꿀 때마다 달라집니다.
   * 한 번 재고 마는 대신 그림 자체를 지켜봅니다.
   */
  useEffect(() => {
    const node = imageRef.current
    if (!node) return

    const watcher = new ResizeObserver(([entry]) => {
      const box = entry.contentRect
      setDrawn({ width: Math.round(box.width), height: Math.round(box.height) })
    })
    watcher.observe(node)
    return () => watcher.disconnect()
  }, [url, skipped, kind])

  const name = path.split('/').pop() ?? path
  const tooBig = isAttachment(path) && size > MAX_ATTACHMENT_BYTES

  // 그림은 바탕을 칸 끝까지, 오피스 미리보기는 제 여백을 지고 옵니다. 둘 다 바깥 여백을 걷습니다.
  const filling = (kind === 'image' && !skipped) || (office && !officeOff)

  return (
    // 그림은 바탕을 칸 끝까지 깔아야 합니다. 여백이 남으면 거기만 테마 색이라 어수선합니다.
    <div className={filling ? 'asset-view is-filled' : 'asset-view'}>
      {tooBig && (
        <p className="asset-note">
          {formatBytes(MAX_ATTACHMENT_BYTES)} 가 넘어 동기화하지 않습니다. 이 컴퓨터에만 있습니다.
        </p>
      )}

      {error && <p className="status status-error">{error}</p>}

      {skipped && (
        <p className="asset-note">
          이미지 미리보기를 꺼 두셨습니다.
          보시려면 <strong>설정 → 일반 → 이미지 미리보기</strong>를 켜 주세요.
          파일은 그대로 폴더에 있습니다.
        </p>
      )}

      {/*
        그림이 바탕에 묻히는 일이 잦습니다. 흰 로고는 밝은 테마에서, 어두운 도표는
        어두운 테마에서 사라집니다. 그래서 뒤에 깔 바탕을 고를 수 있게 두었고,
        고르는 자리는 제목 줄(BackdropSwitch)입니다.
      */}
      {kind === 'image' && !skipped && url && (
        /*
         * 배율을 정해 두면 그림을 그 크기로 그리고 칸 안에서 굴립니다.
         * 정하지 않았으면 예전처럼 칸에 맞춰 줄입니다.
         */
        <div
          ref={canvasRef}
          className={`asset-canvas is-${backdrop}${zoom === null ? '' : ' is-zoomed'}${pan.held ? ' is-panning' : ''}`}
          onPointerDown={(event) => {
            if (pan.begin(event)) event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => pan.drag(event)}
          onPointerUp={() => pan.end()}
          onPointerCancel={() => pan.end()}
        >
          <img
            ref={imageRef}
            className="asset-image"
            style={zoom !== null && pixels ? { width: pixels.width * zoom, maxWidth: 'none', maxHeight: 'none' } : undefined}
            src={url}
            alt={name}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              // 크기를 밝히지 않은 SVG 는 0 으로 옵니다. 0 x 0 이라고 적어 봐야 헛말입니다.
              setPixels(naturalWidth > 0 && naturalHeight > 0
                ? { width: naturalWidth, height: naturalHeight }
                : null)
            }}
          />
          {/*
            배율 손잡이는 그림 위에 떠 있습니다. 제목 줄에 두었더니 그림을 보던 눈이
            멀리 갔고, 좁은 화면에서는 제목 줄이 두 줄로 접혔습니다.
          */}
          {onZoom && pixels && drawn && (
            <ZoomControl scale={drawn.width / pixels.width} fitted={zoom === null} onZoom={onZoom} />
          )}
          {pixels && (
            /*
             * 크기는 두 가지가 궁금합니다. 지금 눈에 보이는 크기와 파일이 지닌 크기.
             * 줄지 않았을 때까지 둘을 늘어놓으면 같은 숫자가 두 번 적혀 되레 읽기
             * 나쁩니다. 줄어든 회차에만 아래에 본디 크기와 몇 할인지를 붙입니다.
             */
            <span className="asset-size">
              <span className="asset-size-now">
                {/* 무슨 형식인지부터 밝힙니다. PNG 인지 JPG 인지에 따라 투명·품질이 갈립니다. */}
                <span className="asset-size-kind">{imageFormatName(path)}</span>
                {' '}
                {(drawn ?? pixels).width} × {(drawn ?? pixels).height}px
              </span>
              {drawn && drawn.width < pixels.width - 1 && (
                <span className="asset-size-origin">
                  원본 {pixels.width} × {pixels.height}px
                  {' · '}
                  {Math.round((drawn.width / pixels.width) * 100)}%
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {kind === 'pdf' && url && <iframe className="asset-frame" src={url} title={name} />}

      {kind === 'text' && text !== null && (
        <pre className="asset-text">
          {text}
          {size > TEXT_PREVIEW_LIMIT && '\n\n… 이후는 생략했습니다'}
        </pre>
      )}

      {officeOff && (
        <p className="asset-note">
          오피스 미리보기를 꺼 두셨습니다.
          보시려면 <strong>설정 → 일반 → 오피스 미리보기</strong>를 켜 주세요.
          파일은 그대로 폴더에 있습니다.
        </p>
      )}

      {kind === 'sheet' && !officeOff && <SheetPreview root={root} path={path} />}

      {kind === 'word' && !officeOff && <WordPreview root={root} path={path} />}

      {kind === 'binary' && (
        <p className="asset-note">
          {/*
            doc·ppt 는 브라우저에서 풀 방법이 사실상 없습니다. 못 연다고만 하면
            무엇을 해야 할지 알 수 없으니, 어느 형식으로 바꾸면 되는지 함께 적습니다.
          */}
          {legacyOffice(path)
            ? `옛 오피스 형식이라 여기서는 열어 볼 수 없습니다. ${legacyOffice(path)} 로 저장하면 미리보기가 됩니다. 파일은 그대로 폴더에 있습니다.`
            : '이 형식은 미리보기를 지원하지 않습니다. 파일은 그대로 폴더에 있습니다.'}
        </p>
      )}
    </div>
  )
}
