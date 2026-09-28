import { useCallback, useEffect, useRef, useState } from 'react'
import { formatBytes, withMime } from '../lib/attachments'
import { readBinaryFile } from '../lib/fsAccess'
import { fileNameOf } from '../lib/paths'
import {
  clampCrop, clampSide, FORMATS, keepRatio, MAX_SIDE, MIN_SIDE, outputName, renderImage,
  type Crop, type ImageFormat,
} from '../lib/imageEdit'
import { clampPercent } from '../lib/zoom'
import { ZoomControl } from './ZoomControl'
import { useSpacePan } from '../hooks/useSpacePan'

interface ImageEditorProps {
  root: FileSystemDirectoryHandle
  path: string
  /** 새 이름과 그려 낸 그림. 같은 이름이 이미 있으면 덮을지 묻는 것은 부르는 쪽의 몫입니다. */
  onSave: (name: string, blob: Blob) => Promise<void>
  onCancel: () => void
}

type Natural = { width: number; height: number }

/**
 * 고른 자리를 잡아 늘이는 손잡이. 네 꼭지점과 네 변.
 * 글자에 방향이 들어 있어(n·s·e·w) 어느 축을 움직이는지와 어느 쪽이 붙박이인지가 그대로 나옵니다.
 */
const GRIPS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Grip = (typeof GRIPS)[number]

/** 그림 칸의 안쪽 여백(CSS 와 같은 값). 꽉 차게 맞출 때 이만큼 빼고 잽니다. */
const STAGE_PAD = 16

/** 이 두께 안으로 들어오면 저절로 굴러가기 시작합니다. */
const EDGE_ZONE = 56
/** 한 프레임에 굴러가는 최대 거리. 가장자리에 가까울수록 이만큼까지 빨라집니다. */
const EDGE_SPEED = 18

/**
 * 그림 수정 화면.
 *
 * 형식 바꾸기(PNG·JPG) · 크기 줄이기 · 잘라내기 셋만 둡니다. 그림판을 만들려는 것이 아니라,
 * 문서에 넣기 전에 흔히 한 번 거치는 손질을 앱 밖으로 나가지 않고 끝내려는 것입니다.
 *
 * 덮개 창이 아니라 **본문 자리에서** 엽니다. 고치는 동안에도 옆줄과 제목 줄이 그대로 보여야
 * 어느 파일을 만지고 있는지 알 수 있고, 창이 작을 때 고칠 자리가 덮개에 갇히지 않습니다.
 */
export function ImageEditor({ root, path, onSave, onCancel }: ImageEditorProps) {
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
  const [zoom, setZoom] = useState(1)
  /** 고른 자리를 통째로 옮기는 중. 잡은 자리와 그때의 자리를 들고 있습니다. */
  const moveFrom = useRef<{ x: number; y: number; crop: Crop } | null>(null)
  /** 손이 고른 자리 안에 있는지. 손 모양을 바꿔 옮길 수 있다고 알립니다. */
  const [inside, setInside] = useState(false)

  const stage = useRef<HTMLDivElement>(null)
  const shown = useRef<HTMLImageElement>(null)
  // 스페이스를 누른 채 끌어 옮기기. 보기 모드와 같은 손잡이를 씁니다.
  const pan = useSpacePan(() => stage.current, true)
  /** 끄는 동안 붙박이로 두는 자리. 새로 고를 때는 처음 누른 곳, 늘일 때는 맞은편입니다. */
  const dragFrom = useRef<{ x: number; y: number } | null>(null)
  /** 이번 끌기가 건드리는 축. 변을 잡으면 한 축만 움직이고 다른 축은 그대로 둡니다. */
  const dragAxes = useRef({ x: true, y: true })
  /** 늘이기 전의 자리. 건드리지 않는 축은 여기서 그대로 가져옵니다. */
  const dragBase = useRef<Crop | null>(null)
  /** 끄는 동안의 마지막 손가락 자리(화면 좌표). 저절로 굴릴 때 다시 씁니다. */
  const dragAt = useRef<{ x: number; y: number } | null>(null)
  const rolling = useRef(0)
  /** 이번에 누른 뒤 손이 움직였는지. 움직이지 않았으면 고르려던 것이 아니라 그냥 누른 것입니다. */
  const dragMoved = useRef(false)
  /*
   * 손가락 옆에 따라다니는 쪽지. 고르기 전에는 그림에서 어디를 짚고 있는지(x, y),
   * 고르는 중에는 얼마나 골랐는지(너비 × 높이)를 적습니다. 잘라내기는 픽셀 단위로 맞추는
   * 일인데, 아래 칸의 숫자를 보려면 눈이 손에서 멀리 떠나야 했습니다.
   */
  const [readout, setReadout] = useState<{ left: number; top: number; text: string } | null>(null)

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

  /** 잘라 낸 자리(없으면 통째로). 여기서부터 내놓을 크기를 셉니다. */
  const base = crop ?? (natural ? { x: 0, y: 0, ...natural } : null)

  const onLoaded = (event: { currentTarget: HTMLImageElement }) => {
    const image = event.currentTarget
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    setNatural(size)
    setWidth(size.width)
    setHeight(size.height)

    /*
     * 처음에는 칸에 꽉 차게 맞춥니다.
     *
     * 100% 로 열었더니 큰 그림은 한 귀퉁이만 보여 어디를 고르는지 알 수 없었고, 작은 그림은
     * 너른 칸 한가운데 조그맣게 놓여 픽셀을 집어내기 어려웠습니다. 잘라낼 자리를 고르는
     * 화면이므로 그림이 가장 크게 보이는 자리에서 시작하는 편이 낫습니다.
     * 여기서 한 번만 잡고, 그 뒤로는 사람이 고른 배율을 덮지 않습니다.
     */
    const box = stage.current
    if (!box || size.width === 0 || size.height === 0) return
    const room = { width: box.clientWidth - STAGE_PAD * 2, height: box.clientHeight - STAGE_PAD * 2 }
    const fit = Math.min(room.width / size.width, room.height / size.height)
    /*
     * 내림으로 셉니다. 반올림하면 한 픽셀 넘쳐 굴림대가 생기는데, 꽉 채우려다 굴림대를
     * 부르는 것은 얻는 것보다 잃는 것이 큽니다.
     * 배율은 사람이 적어 넣을 수 있는 자리 안에 둡니다(10 ~ 300%).
     */
    setZoom(clampPercent(Math.floor(fit * 100)) / 100)
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
   * 재는 것은 칸이 아니라 **그림**입니다. 칸은 테두리와 여백만큼 크고, 배율을 키우면
   * 그림이 칸보다 커져 굴러갑니다. 그림의 자리를 그대로 재서 본디 크기로 되돌립니다.
   */
  const pointAt = (event: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const box = shown.current?.getBoundingClientRect()
    if (!box || !natural) return null
    const scale = natural.width / box.width
    return {
      x: Math.round((event.clientX - box.left) * scale),
      y: Math.round((event.clientY - box.top) * scale),
    }
  }

  /** 쪽지를 손가락 오른쪽 아래에 붙입니다. 화면 끝에서는 안쪽으로 접어 잘리지 않게 합니다. */
  const showReadout = (where: { clientX: number; clientY: number }, text: string) => {
    setReadout({
      left: Math.min(where.clientX + 14, window.innerWidth - 120),
      top: Math.min(where.clientY + 16, window.innerHeight - 40),
      text,
    })
  }

  /** 지금 손가락 자리까지를 고른 자리로 삼습니다. 굴러가는 동안에도 같은 셈을 씁니다. */
  const dragTo = (where: { clientX: number; clientY: number }) => {
    // 옮기는 중이면 크기는 그대로 두고 자리만 밀어 줍니다. 그림 밖으로는 나가지 않습니다.
    const moving = moveFrom.current
    if (moving && natural) {
      const to = pointAt(where)
      if (!to) return
      const next = {
        x: Math.min(Math.max(moving.crop.x + (to.x - moving.x), 0), natural.width - moving.crop.width),
        y: Math.min(Math.max(moving.crop.y + (to.y - moving.y), 0), natural.height - moving.crop.height),
        width: moving.crop.width,
        height: moving.crop.height,
      }
      setCrop(next)
      showReadout(where, `${next.x}, ${next.y}`)
      return
    }

    const from = dragFrom.current
    if (!from || !natural) return
    const to = pointAt(where)
    if (!to) return
    const base = dragBase.current
    const axes = dragAxes.current
    const next = clampCrop({
      x: axes.x ? Math.min(from.x, to.x) : base?.x ?? 0,
      y: axes.y ? Math.min(from.y, to.y) : base?.y ?? 0,
      width: axes.x ? Math.abs(to.x - from.x) : base?.width ?? MIN_SIDE,
      height: axes.y ? Math.abs(to.y - from.y) : base?.height ?? MIN_SIDE,
    }, natural)
    applyCrop(next)
    showReadout(where, `${next.width} × ${next.height}`)
  }

  /*
   * 칸 가장자리까지 끌고 가면 저절로 굴러갑니다.
   *
   * 크게 키워 놓으면 그림이 칸보다 커서, 화면에 보이는 데까지만 고를 수 있었습니다.
   * 잡은 손으로는 굴림대를 만질 수 없고 놓으면 거기서 끝나므로, 끌고 있는 동안 칸을
   * 대신 굴려 줍니다. 손가락을 멈춰 두어도 이어지도록 프레임마다 다시 봅니다.
   */
  const rollNearEdge = () => {
    const box = stage.current
    const at = dragAt.current
    if (!box || !at || (!dragFrom.current && !moveFrom.current)) {
      rolling.current = 0
      return
    }
    const view = box.getBoundingClientRect()
    const reach = (gap: number) => Math.ceil(EDGE_SPEED * (1 - Math.max(gap, 0) / EDGE_ZONE))
    const left = at.x - view.left
    const right = view.right - at.x
    const top = at.y - view.top
    const bottom = view.bottom - at.y

    let dx = 0
    let dy = 0
    if (left < EDGE_ZONE) dx = -reach(left)
    else if (right < EDGE_ZONE) dx = reach(right)
    if (top < EDGE_ZONE) dy = -reach(top)
    else if (bottom < EDGE_ZONE) dy = reach(bottom)

    if (dx !== 0 || dy !== 0) {
      box.scrollLeft += dx
      box.scrollTop += dy
      // 칸이 움직였으니 같은 손가락 자리라도 그림에서는 다른 곳입니다. 다시 셉니다.
      dragTo({ clientX: at.x, clientY: at.y })
    }
    rolling.current = requestAnimationFrame(rollNearEdge)
  }

  const stopRolling = () => {
    if (rolling.current) cancelAnimationFrame(rolling.current)
    rolling.current = 0
  }

  /*
   * 왼쪽 단추로만 고릅니다.
   *
   * pointerdown 은 어느 단추든 똑같이 옵니다. 그래서 오른쪽 단추로 눌러도 고르기가
   * 시작되어, 메뉴를 부르려던 손이 고른 자리를 통째로 지워 버렸습니다.
   * 오른쪽 단추는 브라우저에 그대로 넘깁니다 — 그림 저장하기 같은 제 할 일이 있습니다.
   */
  const isPicking = (event: React.PointerEvent) => event.button === 0 && event.isPrimary

  /** 그 자리가 고른 칸 안인지. */
  const within = (at: { x: number; y: number } | null) =>
    at !== null && crop !== null
    && at.x >= crop.x && at.x <= crop.x + crop.width
    && at.y >= crop.y && at.y <= crop.y + crop.height

  const onDown = (event: React.PointerEvent) => {
    if (!natural || !isPicking(event)) return
    if (pan.begin(event)) {
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    const at = pointAt(event)
    if (!at) return

    /*
     * 고른 칸 안을 누르면 그 자리를 통째로 옮깁니다.
     *
     * 크기는 맞는데 자리만 조금 어긋나는 일이 잦습니다. 그때마다 다시 고르게 하면
     * 크기를 또 맞춰야 합니다. 안쪽은 옮기는 자리, 테두리는 늘이는 자리, 바깥은 새로
     * 고르는 자리 — 그림 다루는 프로그램들이 쓰는 갈래를 그대로 따릅니다.
     */
    if (crop && within(at)) {
      moveFrom.current = { x: at.x, y: at.y, crop }
      dragAt.current = { x: event.clientX, y: event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
      if (!rolling.current) rolling.current = requestAnimationFrame(rollNearEdge)
      return
    }

    // 새로 고르는 길. 누른 곳이 붙박이가 되고 두 축이 모두 움직입니다.
    dragMoved.current = false
    dragFrom.current = at
    dragAxes.current = { x: true, y: true }
    dragBase.current = null
    dragAt.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!rolling.current) rolling.current = requestAnimationFrame(rollNearEdge)
  }

  /*
   * 고른 자리를 잡아 늘입니다.
   *
   * 한 번에 딱 맞게 끄는 일은 드뭅니다. 조금 넓거나 좁게 고른 것을 다시 그리지 않고
   * 고칠 수 있어야 합니다. 잡은 손잡이의 **맞은편**을 붙박이로 두면, 새로 고르는 것과
   * 똑같은 셈으로 늘이기까지 다룰 수 있습니다.
   */
  const onGrip = (grip: Grip) => (event: React.PointerEvent) => {
    if (!crop || !natural || !isPicking(event)) return
    /*
     * 옮기는 중에는 손잡이도 옮기는 자리입니다. 여기서 사건을 붙들지 않고 흘려보내면
     * 아래 칸(그림 틀)이 받아 옮기기로 다룹니다. 붙들면 손잡이 위에서만 옮기기가
     * 되지 않아, 크게 키워 놓았을 때 옮길 수 있는 자리가 드문드문해집니다.
     */
    if (pan.held) return
    // 손잡이를 잡은 것이 칸을 새로 고르는 일로 읽히면 안 됩니다.
    event.stopPropagation()
    dragBase.current = crop
    dragAxes.current = {
      x: grip.includes('e') || grip.includes('w'),
      y: grip.includes('n') || grip.includes('s'),
    }
    dragFrom.current = {
      x: grip.includes('w') ? crop.x + crop.width : crop.x,
      y: grip.includes('n') ? crop.y + crop.height : crop.y,
    }
    dragAt.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!rolling.current) rolling.current = requestAnimationFrame(rollNearEdge)
  }
  const onMove = (event: React.PointerEvent) => {
    if (pan.drag(event)) return
    // 새로 고르는 중이거나 고른 자리를 옮기는 중. 둘 다 dragTo 가 갈라 다룹니다.
    if (dragFrom.current || moveFrom.current) {
      dragMoved.current = true
      dragAt.current = { x: event.clientX, y: event.clientY }
      dragTo(event)
      return
    }
    // 옮기는 중에는 쪽지를 띄우지 않습니다. 고르는 일이 아니므로 자리를 적을 까닭이 없습니다.
    if (pan.held) {
      setReadout(null)
      return
    }
    // 아직 고르기 전. 그림에서 어디를 짚고 있는지 적고, 안쪽이면 옮길 수 있다고 알립니다.
    const at = pointAt(event)
    setInside(within(at))
    if (at && natural) showReadout(event, `${at.x}, ${at.y}`)
  }
  const onUp = () => {
    /*
     * 바깥을 그냥 눌렀다 뗀 것은 "고르기를 그만두겠다" 는 뜻입니다.
     * 새로 고르는 길로 들어왔는데 손이 움직이지 않았으면 고른 자리를 지웁니다.
     * (끌었다면 새로 고른 것이므로 그대로 둡니다.)
     */
    if (dragFrom.current && !dragBase.current && !dragMoved.current && crop) applyCrop(null)
    dragFrom.current = null
    dragBase.current = null
    dragAt.current = null
    pan.end()
    moveFrom.current = null
    stopRolling()
  }
  const onLeave = () => {
    // 끌고 있는 중이면 칸 밖으로 나가도 쪽지를 지우지 않습니다. 저절로 굴러가는 중입니다.
    if (dragFrom.current || moveFrom.current) return
    setReadout(null)
    setInside(false)
  }

  // 창을 떠날 때도 돌던 것을 세웁니다. 남겨 두면 없는 칸을 굴리려 듭니다.
  useEffect(() => stopRolling, [])

  const save = useCallback(async () => {
    if (!source || !natural) return
    setBusy(true)
    setError(null)
    try {
      const blob = await renderImage(source, { crop, width, height, format, quality: quality / 100 })
      await onSave(name.trim() || outputName(path, format), blob)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [crop, format, height, name, natural, onSave, path, quality, source, width])

  // 잘라 낸 자리를 그림 안의 비율(%)로 옮겨 덮개를 그립니다. 배율이 바뀌어도 그대로 따라갑니다.
  const overlay = crop && natural
    ? {
        left: `${(crop.x / natural.width) * 100}%`,
        top: `${(crop.y / natural.height) * 100}%`,
        width: `${(crop.width / natural.width) * 100}%`,
        height: `${(crop.height / natural.height) * 100}%`,
      }
    : null

  return (
    <div className="image-edit">
      <div className="image-edit-stage" ref={stage}>
        <div className="image-edit-canvas" style={natural ? { width: natural.width * zoom } : undefined}>
          {url && (
            <div
              className={`image-edit-frame${pan.held ? ' is-panning' : ''}${inside ? ' is-inside' : ''}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={onLeave}
            >
              <img ref={shown} src={url} alt={`${fileNameOf(path)} 미리보기`} onLoad={onLoaded} draggable={false} />
              {overlay && (
                <div className="image-edit-crop" style={overlay}>
                  {GRIPS.map((grip) => (
                    <span
                      key={grip}
                      className={`crop-grip crop-grip-${grip}`}
                      onPointerDown={onGrip(grip)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={onUp}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 쪽지는 칸 밖으로도 나갈 수 있어야 해서 화면에 바로 붙입니다(fixed). */}
      {readout && (
        <div className="image-edit-readout" style={{ left: readout.left, top: readout.top }} aria-hidden="true">
          {readout.text}
        </div>
      )}

      <div className="image-edit-panel">
        {error && <p className="status image-edit-error">{error}</p>}

        <section className="field">
          <h4 className="field-group-title">잘라내기</h4>
          <p className="hint" style={{ marginTop: 0 }}>
            그림 위를 끌어 남길 자리를 고릅니다. 작은 그림은 키워 놓고 고르면 쉽습니다.
          </p>
          <div className="row" style={{ alignItems: 'center', gap: 6 }}>
            <span className="hint" style={{ margin: 0 }}>보기 배율</span>
            {/* 고칠 때는 늘 배율을 정해 두고 봅니다(맞춤 없음). 잘라 낼 자리를 재려면 기준이 있어야 합니다. */}
            <ZoomControl scale={zoom} fitted={false} canFit={false} onZoom={(next) => setZoom(next ?? 1)} />
          </div>
          <div className="row" style={{ alignItems: 'center' }}>
            {crop ? (
              <>
                <span className="hint" style={{ margin: 0 }}>
                  {crop.x}, {crop.y} 에서 {crop.width} × {crop.height}
                </span>
                <button
                  type="button"
                  className="btn btn-small"
                  data-tip="고른 자리를 지웁니다. 그림 전체를 내놓습니다"
                  onClick={() => applyCrop(null)}
                >
                  선택 영역 해제
                </button>
              </>
            ) : (
              <span className="hint" style={{ margin: 0 }}>
                고른 자리가 없어 통째로 내놓습니다.
                {natural && ` 본디 ${natural.width} × ${natural.height}`}
                {source && ` · ${formatBytes(source.size)}`}
              </span>
            )}
          </div>
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
            <>
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
              <p className="hint" style={{ margin: 0 }}>
                JPG 에는 투명이 없습니다. 투명한 자리는 흰 바탕으로 깔립니다.
              </p>
            </>
          )}
        </section>

        <section className="field">
          <h4 className="field-group-title">파일 이름</h4>
          <input
            className="dialog-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="파일 이름"
          />
          <p className="hint" style={{ margin: 0 }}>
            원본과 같은 폴더에 만듭니다. 같은 이름이 이미 있으면 덮을지 묻습니다.
          </p>
        </section>

        <div className="image-edit-actions">
          <button type="button" className="btn" onClick={onCancel}>취소</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !source || !natural}
            onClick={() => void save()}
          >
            {busy ? '만드는 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
