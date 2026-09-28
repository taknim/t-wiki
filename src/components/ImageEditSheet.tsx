import { useCallback, useEffect, useRef, useState } from 'react'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { formatBytes, withMime } from '../lib/attachments'
import { readBinaryFile } from '../lib/fsAccess'
import { fileNameOf } from '../lib/paths'
import {
  clampCrop, clampSide, FORMATS, keepRatio, MAX_SIDE, MIN_SIDE, outputName, renderImage,
  type Crop, type ImageFormat,
} from '../lib/imageEdit'

interface ImageEditSheetProps {
  root: FileSystemDirectoryHandle
  path: string
  /** 새로 만든 파일을 담을 폴더(원본이 있던 자리). */
  onSave: (name: string, blob: Blob) => Promise<void>
  onClose: () => void
}

type Natural = { width: number; height: number }

/**
 * 그림을 고쳐 새 파일로 내놓는 창.
 *
 * 형식 바꾸기(PNG·JPG) · 크기 줄이기 · 잘라내기 셋만 둡니다. 그림판을 만들려는 것이 아니라,
 * 문서에 넣기 전에 흔히 한 번 거치는 손질을 앱 밖으로 나가지 않고 끝내려는 것입니다.
 *
 * **원본은 건드리지 않습니다.** 고치는 일은 되돌릴 수 없어, 덮어쓰면 원본이 사라집니다.
 * 늘 새 이름으로 내놓고, 같은 이름이 있으면 파일을 넣는 쪽에서 번호를 붙입니다.
 */
export function ImageEditSheet({ root, path, onSave, onClose }: ImageEditSheetProps) {
  useEscapeClose(onClose)

  const [url, setUrl] = useState<string | null>(null)
  const [source, setSource] = useState<Blob | null>(null)
  const [natural, setNatural] = useState<Natural | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [crop, setCrop] = useState<Crop | null>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [ratio, setRatio] = useState(true)
  const [format, setFormat] = useState<ImageFormat>('png')
  const [quality, setQuality] = useState(90)
  const [name, setName] = useState(() => outputName(path, 'png'))

  const frame = useRef<HTMLDivElement>(null)
  const shown = useRef<HTMLImageElement>(null)
  const dragFrom = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let alive = true
    let made: string | null = null
    readBinaryFile(root, path).then(
      (blob) => {
        if (!alive) return
        const typed = withMime(blob, path)
        made = URL.createObjectURL(typed)
        setSource(typed)
        setUrl(made)
      },
      (cause: unknown) => alive && setError(cause instanceof Error ? cause.message : String(cause)),
    )
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [root, path])

  /** 잘라 낸 자리(없으면 통째로)의 크기. 여기서부터 내놓을 크기를 셉니다. */
  const base = crop ?? (natural ? { x: 0, y: 0, ...natural } : null)

  const onLoaded = (event: { currentTarget: HTMLImageElement }) => {
    const image = event.currentTarget
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    setNatural(size)
    setWidth(size.width)
    setHeight(size.height)
  }

  const changeFormat = (next: ImageFormat) => {
    setFormat(next)
    setName(outputName(path, next))
  }

  const changeWidth = (value: number) => {
    const next = clampSide(value)
    setWidth(next)
    if (ratio && base) setHeight(keepRatio(next, base.width, base.height))
  }
  const changeHeight = (value: number) => {
    const next = clampSide(value)
    setHeight(next)
    if (ratio && base) setWidth(keepRatio(next, base.height, base.width))
  }

  /** 잘라 낸 자리가 바뀌면 내놓을 크기도 그 크기로 되돌립니다. 앞서 정한 수는 뜻이 달라집니다. */
  const applyCrop = (next: Crop | null) => {
    setCrop(next)
    const size = next ?? natural
    if (size) {
      setWidth(size.width)
      setHeight(size.height)
    }
  }

  /*
   * 화면에 그려진 그림 위에서 끌어 잘라 낼 자리를 정합니다.
   * 화면 크기는 창에 맞춰 줄어 있으므로, 잰 값을 본디 크기로 되돌려 적어 둡니다.
   */
  const pointAt = (event: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    // 재는 것은 칸이 아니라 **그림**입니다. 칸은 테두리와 여백만큼 크고, 그림이 칸보다 작을 수도 있습니다.
    const box = shown.current?.getBoundingClientRect()
    if (!box || !natural) return null
    const scale = natural.width / box.width
    return {
      x: Math.round((event.clientX - box.left) * scale),
      y: Math.round((event.clientY - box.top) * scale),
    }
  }

  const onDown = (event: React.PointerEvent) => {
    if (!natural) return
    const at = pointAt(event)
    if (!at) return
    dragFrom.current = at
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onMove = (event: React.PointerEvent) => {
    const from = dragFrom.current
    if (!from || !natural) return
    const to = pointAt(event)
    if (!to) return
    applyCrop(clampCrop({
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    }, natural))
  }
  const onUp = () => {
    dragFrom.current = null
  }

  const save = useCallback(async () => {
    if (!source || !natural) return
    setBusy(true)
    setError(null)
    try {
      const blob = await renderImage(source, {
        crop,
        width,
        height,
        format,
        quality: quality / 100,
      })
      await onSave(name.trim() || outputName(path, format), blob)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [crop, format, height, name, natural, onSave, path, quality, source, width])

  // 잘라 낸 자리를 화면 비율(%)로 옮겨 덮개를 그립니다.
  const overlay = crop && natural
    ? {
        left: `${(crop.x / natural.width) * 100}%`,
        top: `${(crop.y / natural.height) * 100}%`,
        width: `${(crop.width / natural.width) * 100}%`,
        height: `${(crop.height / natural.height) * 100}%`,
      }
    : null

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="sheet image-edit" role="dialog" aria-modal="true" aria-label="그림 고치기">
        <header className="sheet-head">
          <h2>그림 고치기</h2>
          <button
            type="button"
            className="btn sheet-close"
            aria-label="닫기"
            data-tip="고치지 않고 닫습니다 (Esc)"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="sheet-body image-edit-body">
          <p className="hint" style={{ marginTop: 0 }}>
            <strong>{fileNameOf(path)}</strong> 를 고쳐 <strong>새 파일로</strong> 내놓습니다.
            원본은 그대로 둡니다 — 고친 것은 되돌릴 수 없기 때문입니다.
          </p>

          {error && <p className="status image-edit-error">{error}</p>}

          <div
            ref={frame}
            className="image-edit-frame"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {url && (
              <img
                ref={shown}
                src={url}
                alt={`${fileNameOf(path)} 미리보기`}
                onLoad={onLoaded}
                draggable={false}
              />
            )}
            {overlay && <div className="image-edit-crop" style={overlay} />}
          </div>
          <p className="hint" style={{ margin: 0 }}>
            그림 위를 끌어 잘라 낼 자리를 고릅니다.
            {natural && ` · 본디 ${natural.width} × ${natural.height}`}
            {source && ` · ${formatBytes(source.size)}`}
          </p>

          <section className="field">
            <h4 className="field-group-title">잘라내기</h4>
            {crop ? (
              <div className="row" style={{ alignItems: 'center' }}>
                <span className="hint" style={{ margin: 0 }}>
                  {crop.x}, {crop.y} 에서 {crop.width} × {crop.height}
                </span>
                <button type="button" className="btn btn-small" onClick={() => applyCrop(null)}>
                  통째로 되돌리기
                </button>
              </div>
            ) : (
              <p className="hint" style={{ margin: 0 }}>고른 자리가 없어 통째로 내놓습니다.</p>
            )}
          </section>

          <section className="field">
            <h4 className="field-group-title">크기</h4>
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <label htmlFor="image-width">너비</label>
              <input
                id="image-width"
                className="dialog-input interval-input"
                type="number"
                inputMode="numeric"
                min={MIN_SIDE}
                max={MAX_SIDE}
                value={width}
                onChange={(event) => changeWidth(Number(event.target.value))}
              />
              <label htmlFor="image-height">높이</label>
              <input
                id="image-height"
                className="dialog-input interval-input"
                type="number"
                inputMode="numeric"
                min={MIN_SIDE}
                max={MAX_SIDE}
                value={height}
                onChange={(event) => changeHeight(Number(event.target.value))}
              />
              {base && (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => { setWidth(base.width); setHeight(base.height) }}
                >
                  원래 크기
                </button>
              )}
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={ratio} onChange={(event) => setRatio(event.target.checked)} />
              가로세로 비율 지키기
            </label>
          </section>

          <section className="field">
            <h4 className="field-group-title">형식</h4>
            {/* 설정의 다른 고르개와 같은 모양입니다. 고른 것이 눈에 띄어야 합니다. */}
            <div className="segmented" role="group" aria-label="내놓을 형식">
              {FORMATS.map((one) => (
                <button
                  key={one.id}
                  type="button"
                  className={one.id === format ? 'is-active' : ''}
                  aria-pressed={one.id === format}
                  onClick={() => changeFormat(one.id)}
                >
                  {one.name}
                </button>
              ))}
            </div>
            {/* JPG 는 그림을 버려 가며 줄입니다. PNG 는 버리는 것이 없어 이 값이 뜻이 없습니다. */}
            {format === 'jpeg' && (
              <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                <label htmlFor="image-quality">품질</label>
                <input
                  id="image-quality"
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                />
                <span className="hint" style={{ margin: 0 }}>{quality}%</span>
              </div>
            )}
            {format === 'jpeg' && (
              <p className="hint" style={{ margin: 0 }}>
                JPG 에는 투명이 없습니다. 투명한 자리는 흰 바탕으로 깔립니다.
              </p>
            )}
          </section>

          <section className="field">
            <h4 className="field-group-title">새 파일 이름</h4>
            <input
              className="dialog-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="새 파일 이름"
            />
            <p className="hint" style={{ margin: 0 }}>
              원본과 같은 폴더에 만듭니다. 같은 이름이 있으면 번호를 붙입니다.
            </p>
          </section>
        </div>

        <footer className="sheet-foot">
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !source || !natural}
            onClick={() => void save()}
          >
            {busy ? '만드는 중…' : '새 파일로 저장'}
          </button>
        </footer>
      </div>
    </div>
  )
}
