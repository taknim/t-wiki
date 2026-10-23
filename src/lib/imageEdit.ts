/*
 * 그림을 고쳐 다시 내는 일.
 *
 * 서버가 없으므로 브라우저의 canvas 로 그려 냅니다. 원본 파일은 건드리지 않고 **새 파일로만**
 * 내놓습니다 — 고치는 일은 되돌릴 수 없고, 덮어쓰면 원본이 사라집니다.
 */

/** canvas 가 그려서 내놓을 수 있는 그림 형식. */
export type ImageFormat = 'png' | 'jpeg' | 'webp'

/** 수정 화면에서 내놓을 수 있는 것. 그림 형식에 종이(PDF)를 더합니다. */
export type OutputFormat = ImageFormat | 'pdf'

export interface OutputSpec {
  id: OutputFormat
  name: string
  extension: string
  /** 버려 가며 줄이는 형식인지. 이쪽만 품질을 고를 수 있습니다. */
  lossy?: boolean
}

const SPECS: Record<OutputFormat, OutputSpec> = {
  png: { id: 'png', name: 'PNG', extension: 'png' },
  jpeg: { id: 'jpeg', name: 'JPG', extension: 'jpg', lossy: true },
  webp: { id: 'webp', name: 'WEBP', extension: 'webp', lossy: true },
  pdf: { id: 'pdf', name: 'PDF', extension: 'pdf' },
}

/**
 * 어느 그림에서나 낼 수 있는 것.
 *
 * **PDF 가 여기 있는 것은 그림을 종이로 내는 길을 이 화면 하나로 모았기 때문입니다.**
 * 예전에는 보는 화면에 Export PDF 단추가 따로 떠 있었습니다. 그런데 그림을 종이에 담기
 * 전에 하고 싶은 일(돌리기·자르기·크기 줄이기)은 모두 이 화면에 있어, 손질한 뒤 PDF 로
 * 내려면 파일을 한 번 만들어 폴더에 남기고 그것을 다시 열어 단추를 눌러야 했습니다.
 * 같은 일을 하는 자리를 둘로 두지 않습니다.
 */
const ALWAYS: OutputFormat[] = ['png', 'jpeg', 'pdf']

/**
 * 원본 형식 그대로 다시 쓸 수 있는 것.
 *
 * **canvas 가 되돌려 주는 형식만** 둡니다. gif·svg·bmp·ico 는 받아서 그릴 수는 있어도
 * 내놓지는 못합니다. avif 도 빠집니다 — 크롬은 `toBlob('image/avif')` 를 거절하는 대신
 * **말없이 PNG 를 돌려줍니다.** 그러면 avif 로 저장한 줄 알고 받은 파일이 PNG 입니다.
 */
const KEEPABLE: Record<string, ImageFormat> = {
  png: 'png', jpg: 'jpeg', jpeg: 'jpeg', jpe: 'jpeg', webp: 'webp',
}

/** 그림 파일의 확장자. 대소문자를 가리지 않습니다. */
function suffixOf(path: string): string {
  const name = path.split('/').pop() ?? path
  const at = name.lastIndexOf('.')
  return at === -1 ? '' : name.slice(at + 1).toLowerCase()
}

/** 원래 형식 그대로 다시 쓸 수 있으면 그 형식. 없으면 null. */
export function keepFormatOf(path: string): ImageFormat | null {
  return KEEPABLE[suffixOf(path)] ?? null
}

/**
 * 고를 수 있는 형식. **원래 형식이 맨 앞**이고, 열었을 때 그것이 골라져 있습니다.
 *
 * 예전에는 늘 PNG 가 맨 앞이고 PNG 로 골라져 있었습니다. 그래서 사진(JPG)을 조금 자르려고
 * 열면 형식이 PNG 로 갈려, 자르기만 하려던 사람이 몇 배로 불어난 파일을 받았습니다.
 * 되돌릴 수 없는 형식(gif·svg·bmp·ico·avif)만 PNG 로 엽니다 — 그 그림은 어차피 갈아야 합니다.
 */
export function formatsFor(path: string): OutputSpec[] {
  const keep = keepFormatOf(path)
  const rest = ALWAYS.filter((one) => one !== keep).map((one) => SPECS[one])
  return keep ? [SPECS[keep], ...rest] : rest
}

/*
 * 투명한 자리를 지닐 수 있는 형식.
 *
 * PDF 에 PNG 로 실을지 JPG 로 실을지 가립니다. 사진을 PNG 로 담으면 PDF 가 몇 배로
 * 불어나는데, 사진에는 애초에 투명이 없습니다. 반대로 투명을 지닌 그림을 JPG 로 담으면
 * 투명하던 자리가 흰 바탕으로 굳습니다.
 */
const ALPHA = ['png', 'gif', 'webp', 'avif', 'svg', 'ico']

export function keepsAlpha(path: string): boolean {
  return ALPHA.includes(suffixOf(path))
}

/**
 * 그림 파일의 형식 이름. 확장자를 사람이 부르는 이름으로 옮깁니다.
 * jpe·jpeg 처럼 같은 것을 다르게 적은 확장자도 한 이름으로 모읍니다.
 */
export function imageFormatName(path: string): string {
  const extension = suffixOf(path)
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'jpe') return 'JPG'
  return extension.toUpperCase()
}

/** 잘라 낼 자리. 화면에 보이는 대로의 크기(픽셀) 기준입니다. */
export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 그림을 놓는 방향. 돌리기와 뒤집기를 함께 담습니다.
 *
 * 각과 뒤집기를 따로 들고 있으면 "오른쪽으로 두 번 = 180도" 같은 일을 셈으로 다룰 수 있고,
 * 뒤집기가 겹쳐도 각은 그대로입니다. 뒤집기를 각으로 바꿔 적으려 하면(예: 좌우 뒤집기를
 * 180도로) 글자만 뒤집힌 그림을 만들 수 없습니다.
 */
export interface Orient {
  /** 시계 방향으로 돌린 각. 90도 단위만 둡니다 — 그 사이 각은 빈 자리가 생겨 채울 색을 정해야 합니다. */
  turn: Turn
  /** 보이는 대로 좌우를 뒤집었는지. 돌린 뒤의 축이 아니라 화면의 가로축입니다. */
  flipX: boolean
  /** 보이는 대로 위아래를 뒤집었는지. */
  flipY: boolean
}

export type Turn = 0 | 90 | 180 | 270

/** 손대지 않은 방향. */
export const UPRIGHT: Orient = { turn: 0, flipX: false, flipY: false }

export function isUpright(orient: Orient): boolean {
  return orient.turn === 0 && !orient.flipX && !orient.flipY
}

/** 왼쪽(-1)이나 오른쪽(+1)으로 한 번 돌린 각. 한 바퀴를 넘으면 처음으로 돌아옵니다. */
export function turnBy(turn: Turn, delta: 1 | -1): Turn {
  return (((turn + delta * 90) % 360 + 360) % 360) as Turn
}

/** 90도·270도로 돌리면 가로와 세로가 바뀝니다. 보이는 대로의 크기를 셉니다. */
export function orientedSize<T extends { width: number; height: number }>(
  size: T, turn: Turn,
): { width: number; height: number } {
  return turn % 180 === 0
    ? { width: size.width, height: size.height }
    : { width: size.height, height: size.width }
}

/**
 * 화면에 그릴 때 쓰는 CSS 변환.
 *
 * canvas 에 그리는 차례와 **똑같은 순서**여야 합니다(뒤집기가 돌리기보다 앞). CSS 도 canvas 도
 * 왼쪽에 적은 것이 나중에 먹으므로, 그림은 먼저 돌아간 뒤 보이는 축으로 뒤집힙니다.
 * 한 군데서만 지어 두 곳이 어긋나지 않게 합니다.
 */
export function orientCss(orient: Orient): string {
  const flip = `scale(${orient.flipX ? -1 : 1}, ${orient.flipY ? -1 : 1})`
  return `translate(-50%, -50%) ${flip} rotate(${orient.turn}deg)`
}

/** 지금 방향을 사람 말로. 무엇을 해 놓았는지 화면에 적어 주는 데 씁니다. */
export function orientName(orient: Orient): string {
  const said = [
    orient.turn === 0 ? '' : `오른쪽으로 ${orient.turn}°`,
    orient.flipX ? '좌우 뒤집음' : '',
    orient.flipY ? '상하 뒤집음' : '',
  ].filter(Boolean)
  return said.length ? said.join(' · ') : '그대로'
}

export interface RenderOptions {
  /** 돌리기·뒤집기. 없으면 그대로. */
  orient?: Orient
  /** 잘라 낼 자리. **돌리고 뒤집은 뒤의**(보이는 대로의) 좌표입니다. 없으면 통째로. */
  crop?: Crop | null
  /** 내놓을 크기. 없으면 잘라 낸 크기 그대로. */
  width?: number
  height?: number
  format: ImageFormat
  /** JPG·WEBP 의 품질(0.1 ~ 1). PNG 에는 뜻이 없습니다. */
  quality?: number
  /**
   * 화면에서 재어 둔 본디 크기. 크기를 밝히지 않은 SVG 처럼 그림 스스로 크기를 말해 주지
   * 못할 때만 씁니다.
   */
  natural?: { width: number; height: number }
}

/** 그림 크기의 위아래 끝. 1픽셀 아래로는 그릴 것이 없고, 너무 크면 브라우저가 canvas 를 내주지 않습니다. */
export const MIN_SIDE = 1
export const MAX_SIDE = 10000

export function clampSide(value: number): number {
  if (!Number.isFinite(value)) return MIN_SIDE
  return Math.min(Math.max(Math.round(value), MIN_SIDE), MAX_SIDE)
}

/**
 * 잘라 낼 자리를 그림 안으로 밀어 넣습니다.
 * 끌다 보면 가장자리를 넘어가는데, 그대로 그리면 빈 자리가 검게 남습니다.
 */
export function clampCrop(crop: Crop, natural: { width: number; height: number }): Crop {
  const width = Math.min(Math.max(Math.round(crop.width), MIN_SIDE), natural.width)
  const height = Math.min(Math.max(Math.round(crop.height), MIN_SIDE), natural.height)
  const x = Math.min(Math.max(Math.round(crop.x), 0), natural.width - width)
  const y = Math.min(Math.max(Math.round(crop.y), 0), natural.height - height)
  return { x, y, width, height }
}

/**
 * 잘라낼 자리에 씌울 수 있는 비율. **긴 쪽이 앞**입니다.
 *
 * 흔히 쓰는 것만 둡니다 — 정사각(1:1), 화면(4:3·16:9), 사진(3:2·5:3), 인화지(5:4·7:5).
 * 임의의 비율을 적어 넣는 길은 두지 않습니다. 여기서 하려는 일은 "어디에 넣을 그림인지"를
 * 고르는 것이지 비를 만들어 내는 것이 아닙니다.
 */
export const CROP_RATIOS: { id: string; long: number; short: number }[] = [
  { id: '1:1', long: 1, short: 1 },
  { id: '4:3', long: 4, short: 3 },
  { id: '16:9', long: 16, short: 9 },
  { id: '3:2', long: 3, short: 2 },
  { id: '5:3', long: 5, short: 3 },
  { id: '5:4', long: 5, short: 4 },
  { id: '7:5', long: 7, short: 5 },
]

/** 눕힐지 세울지. 긴 쪽이 가로면 `wide`, 세로면 `tall`. */
export type Lay = 'wide' | 'tall'

/** 너비 ÷ 높이. 세우면 뒤집힙니다 — 16:9 를 세우면 9:16 입니다. */
export function ratioOf(id: string | null, lay: Lay): number | null {
  const one = CROP_RATIOS.find((each) => each.id === id)
  if (!one) return null
  return lay === 'wide' ? one.long / one.short : one.short / one.long
}

/** 끌어서 크기를 잡는 한 번의 셈. 새로 고르기와 손잡이로 늘이기가 같은 길을 씁니다. */
export interface Sizing {
  /** 붙박이 자리. 새로 고를 때는 처음 누른 곳, 늘일 때는 잡은 손잡이의 맞은편입니다. */
  from: { x: number; y: number }
  /** 지금 손가락이 짚은 자리. */
  to: { x: number; y: number }
  /** 이번 끌기가 건드리는 축. 변을 잡으면 한 축만 움직입니다. */
  axes: { x: boolean; y: boolean }
  /** 늘이기 전의 자리. 건드리지 않는 축은 여기서 그대로 가져옵니다. */
  base: Crop | null
}

/**
 * 끌어 고른 자리를 셉니다. 비율을 씌워 두면 그 비를 지킵니다.
 *
 * 비율을 지킬 때는 **손끝을 덮는 쪽**에 맞춥니다(두 축 가운데 큰 쪽). 작은 쪽에 맞추면
 * 손은 저만치 갔는데 네모는 따라오지 않아 끌리지 않는 것처럼 보입니다.
 * 변을 잡아 한 축만 움직일 때는 다른 축이 **가운데를 지키며** 따라옵니다 — 한쪽 끝을
 * 붙박이로 두면 옆으로 늘일 때마다 네모가 위나 아래로 미끄러집니다.
 *
 * 그림 밖으로 넘치면 **비율을 지킨 채 줄입니다.** clampCrop 처럼 안으로 밀어 넣기만 하면
 * 붙박이로 둔 자리가 함께 밀려, 잡고 있던 꼭지점이 손에서 빠져나갑니다.
 */
export function sizeCrop(spec: Sizing, ratio: number | null, paper: { width: number; height: number }): Crop {
  const { from, to, axes, base } = spec
  const rightward = to.x >= from.x
  const downward = to.y >= from.y
  let width = axes.x ? Math.abs(to.x - from.x) : base?.width ?? MIN_SIDE
  let height = axes.y ? Math.abs(to.y - from.y) : base?.height ?? MIN_SIDE

  if (ratio === null) {
    return clampCrop({
      x: axes.x ? Math.min(from.x, to.x) : base?.x ?? 0,
      y: axes.y ? Math.min(from.y, to.y) : base?.y ?? 0,
      width,
      height,
    }, paper)
  }

  if (axes.x && axes.y) {
    width = Math.max(width, height * ratio)
    // 붙박이에서 손이 간 쪽으로 남은 자리만큼만 자랍니다.
    const room = Math.min(
      rightward ? paper.width - from.x : from.x,
      (downward ? paper.height - from.y : from.y) * ratio,
    )
    width = Math.round(Math.min(width, room))
    height = Math.round(width / ratio)
    return clampCrop({
      x: rightward ? from.x : from.x - width,
      y: downward ? from.y : from.y - height,
      width,
      height,
    }, paper)
  }

  // 한 축만 잡은 자리. 움직인 축이 크기를 정하고 다른 축은 가운데를 지키며 따라옵니다.
  const middle = base
    ? { x: base.x + base.width / 2, y: base.y + base.height / 2 }
    : { x: from.x, y: from.y }
  if (axes.x) {
    width = Math.round(Math.min(width, rightward ? paper.width - from.x : from.x, paper.height * ratio))
    height = Math.round(width / ratio)
    return clampCrop({ x: rightward ? from.x : from.x - width, y: middle.y - height / 2, width, height }, paper)
  }
  height = Math.round(Math.min(height, downward ? paper.height - from.y : from.y, paper.width / ratio))
  width = Math.round(height * ratio)
  return clampCrop({ x: middle.x - width / 2, y: downward ? from.y : from.y - height, width, height }, paper)
}

/**
 * 이미 고른 자리를 새 비율에 맞춰 다시 잡습니다.
 *
 * 고른 네모 **안에 들어가도록** 줄이고 가운데를 지킵니다. 넓이를 지키며 늘이는 길도
 * 있었지만, 가장자리에 붙여 고른 자리가 그림 밖으로 삐져나가 되레 다시 잡아야 했습니다.
 */
export function reshapeCrop(crop: Crop, ratio: number, paper: { width: number; height: number }): Crop {
  const width = Math.round(Math.min(crop.width, crop.height * ratio))
  const height = Math.round(width / ratio)
  return clampCrop({
    x: crop.x + (crop.width - width) / 2,
    y: crop.y + (crop.height - height) / 2,
    width,
    height,
  }, paper)
}

/** 한쪽을 정했을 때 비율을 지키는 다른 쪽 길이. */
export function keepRatio(side: number, from: number, to: number): number {
  return clampSide((side * to) / from)
}

/**
 * 내놓을 파일 이름. 확장자를 고른 형식으로 갈고, 원본을 덮지 않도록 꼬리말을 붙입니다.
 * 꼬리말은 빈칸도 괄호도 없는 `_modified` 입니다 — 웹에 올리거나 명령줄에서 다룰 때
 * 빈칸과 괄호는 따옴표로 감싸야 하고, 주소에서는 `%20` 으로 바뀌어 읽기 어렵습니다.
 * (같은 이름이 이미 있으면 덮을지 묻습니다.)
 */
export function outputName(path: string, format: OutputFormat, suffix = '_modified'): string {
  const name = path.split('/').pop() ?? path
  const at = name.lastIndexOf('.')
  const stem = at === -1 ? name : name.slice(0, at)
  /*
   * PDF 는 원래 확장자를 **지우지 않고 뒤에 덧붙입니다** — 문서를 내보낼 때 저장 창에 미리
   * 적는 이름과 같은 규칙입니다(pdfExport 의 pdfNameFor). 지우면 `사진.png` 에서 낸 것과
   * `사진.jpg` 에서 낸 것이 한 이름이 되어, 같은 폴더에 둘 때 뒤에 낸 것이 앞의 것을 덮을지
   * 묻는 물음을 받습니다. 덧붙이면 무엇에서 낸 종이인지가 이름에 남습니다.
   */
  if (format === 'pdf') return `${stem}${suffix}${at === -1 ? '' : name.slice(at)}.pdf`
  return `${stem}${suffix}.${SPECS[format].extension}`
}

/**
 * 잘라 내고 크기를 맞춰 새 그림을 냅니다.
 *
 * JPG 에는 투명이 없습니다. 그냥 그리면 투명한 자리가 검게 나오므로 흰 바탕을 먼저 깝니다.
 * 검정보다 흰 쪽이 원래 모습에 가깝습니다 — 화면도 문서도 대개 흰 바탕입니다.
 */
export async function renderImage(source: Blob, options: RenderOptions): Promise<Blob> {
  /*
   * 그릴 바탕은 **<img> 로** 읽습니다.
   *
   * `createImageBitmap` 은 한 줄로 끝나지만 **크롬이 SVG 를 받지 않습니다**
   * (InvalidStateError: The source image could not be decoded). 그래서 SVG 그림은 수정
   * 화면을 열어 손질해 놓고 저장을 누르는 순간에야 그 오류를 만났습니다. <img> 는 화면에
   * 그려 보여 줄 때 이미 쓰고 있는 길이고, SVG 도 그대로 읽습니다.
   *
   * 크기를 밝히지 않은 SVG 는 naturalWidth 가 0 으로 옵니다. 그때는 **부르는 쪽이 재어
   * 둔 크기**(화면에 그려진 크기)를 씌워 그립니다.
   */
  const url = URL.createObjectURL(source)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const bitmap = image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : options.natural ?? { width: 0, height: 0 }
    if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error('그림의 크기를 알 수 없습니다.')
    const orient = options.orient ?? UPRIGHT
    /*
     * 돌리기·뒤집기를 **먼저 마친 그림**을 하나 만들어 두고, 잘라내기와 크기는 그 위에서 셉니다.
     *
     * 한 번에 그려 낼 수도 있지만 그러려면 화면에서 고른 자리를 원본 좌표로 되짚어야 합니다.
     * 90도마다 축이 바뀌고 뒤집기까지 겹치므로, 네 방향 × 네 가지 뒤집기를 모두 맞추기 전에는
     * 어느 한 조합이 늘 어긋났습니다. 판을 한 장 더 쓰는 값으로 셈을 한 갈래로 줄입니다.
     */
    const shown = orientedSize(bitmap, orient.turn)
    const turned = document.createElement('canvas')
    turned.width = shown.width
    turned.height = shown.height
    const board = turned.getContext('2d')
    if (!board) throw new Error('그림을 그릴 수 없습니다.')
    board.translate(shown.width / 2, shown.height / 2)
    // 차례는 orientCss 와 같습니다. 나중에 적은 것이 먼저 먹으므로 그림은 돌아간 뒤 뒤집힙니다.
    board.scale(orient.flipX ? -1 : 1, orient.flipY ? -1 : 1)
    board.rotate((orient.turn * Math.PI) / 180)
    board.drawImage(image, -bitmap.width / 2, -bitmap.height / 2, bitmap.width, bitmap.height)

    const crop = options.crop ? clampCrop(options.crop, shown) : { x: 0, y: 0, ...shown }
    const width = clampSide(options.width ?? crop.width)
    const height = clampSide(options.height ?? crop.height)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const paper = canvas.getContext('2d')
    if (!paper) throw new Error('그림을 그릴 수 없습니다.')

    if (options.format === 'jpeg') {
      paper.fillStyle = '#ffffff'
      paper.fillRect(0, 0, width, height)
    }
    paper.drawImage(turned, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('그림을 내놓지 못했습니다.'))),
        `image/${options.format}`,
        SPECS[options.format].lossy ? (options.quality ?? 0.9) : undefined,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
