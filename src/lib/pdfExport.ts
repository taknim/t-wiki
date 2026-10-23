import { extensionOf, IMAGE_EXTENSIONS, isMarkdown, withMime } from './attachments'

/**
 * 보던 것을 PDF 한 벌로 내보냅니다.
 *
 * **그려서 보여 주는 것만** 냅니다. 글자를 글자 그대로(또는 문법 강조만 입혀) 보여 주는
 * 파일 — txt·log·json·xml·html 과 코드 — 은 빼 두었습니다. 그런 파일은 PDF 로 감싸도
 * 원본에 아무것도 더해지지 않고, 자리만 네 배로 먹습니다. 필요하면 파일 그대로 보내면 됩니다.
 *
 * ppt·pptx·hwp·hwpx·doc 도 빠집니다. 앱이 아직 그려 보여 주지 못하는 형식이라,
 * 내보낼 그림이 없습니다. 그릴 수 있게 되면 여기 한 줄을 더하면 따라옵니다.
 */
const DOCUMENT_EXPORTS = ['csv', 'tsv', 'docx', 'xlsx', 'xlsm', 'xls']

export function canExportPdf(path: string): boolean {
  const extension = extensionOf(path)
  if (isMarkdown(path)) return true
  return IMAGE_EXTENSIONS.includes(extension) || DOCUMENT_EXPORTS.includes(extension)
}

/** 내보낼 파일에 미리 적어 둘 이름. `회의록.md` → `회의록.pdf`. */
export function pdfNameFor(path: string): string {
  const name = path.split('/').pop() ?? path
  const at = name.lastIndexOf('.')
  return `${at <= 0 ? name : name.slice(0, at)}.pdf`
}

/*
 * 쪽 크기는 A4(210 × 297mm)를 포인트로 적은 값입니다. 세로로 세우고 네 변에 36pt(12.7mm)
 * 여백을 둡니다. 여백을 둘러야 어느 프린터로 뽑아도 글자가 잘리지 않습니다.
 */
export const PAGE_WIDTH = 595.28
export const PAGE_HEIGHT = 841.89
export const PAGE_MARGIN = 36
/** 글이 들어가는 자리. */
export const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2
export const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2

/**
 * 글을 그릴 자리의 너비(CSS 픽셀).
 *
 * 1pt = 1/72인치, CSS 1px = 1/96인치이므로 포인트 자리를 4/3 배 하면 픽셀 자리입니다.
 * 이 너비로 글을 앉혀야 화면에서 창을 넓히거나 좁혀 둔 것과 상관없이 늘 같은 PDF 가 나옵니다.
 */
export const SHEET_WIDTH = Math.round((CONTENT_WIDTH * 4) / 3)

/**
 * 쪽을 가를 자리.
 *
 * 한 쪽에 담을 만큼(`limit`)씩 끊되, **끊어도 되는 자리**(`stops`)가 있으면 그 가운데
 * 가장 아래쪽을 고릅니다. 정해진 높이로 기계처럼 자르면 글줄 한복판이나 표의 한 줄
 * 가운데가 잘려, 위쪽 쪽에는 글자의 윗동만 남고 아래쪽 쪽에는 아랫동만 남습니다.
 *
 * 한 덩어리가 쪽보다 길면(아주 큰 그림, 긴 코드 블록) 어쩔 수 없이 가운데를 자릅니다.
 * 그때 자르지 않으면 그 덩어리는 어느 쪽에도 들어가지 못합니다.
 */
export function pageBreaks(stops: number[], total: number, limit: number): number[] {
  const sorted = [...new Set(stops)].filter((y) => y > 0 && y < total).sort((a, b) => a - b)
  const cuts: number[] = []
  let from = 0

  // 남은 길이가 한 쪽에 들어갈 때까지 끊습니다. 0.5px 은 재는 값의 어림수입니다.
  while (total - from > limit + 0.5) {
    const room = from + limit
    let cut = 0
    for (const stop of sorted) {
      if (stop > room) break
      if (stop > from) cut = stop
    }
    const next = cut > from ? cut : room
    cuts.push(next)
    from = next
  }

  return cuts
}

/**
 * 끊어도 되는 자리를 글에서 재어 옵니다.
 *
 * 덩어리의 **위쪽 선**이 끊어도 되는 자리입니다. 그 선에서 자르면 덩어리가 통째로
 * 다음 쪽으로 넘어갑니다.
 *
 * 다만 제목 바로 뒤는 뺍니다. 제목만 쪽 끝에 홀로 남고 그 아래 글이 다음 쪽으로
 * 넘어가면, 무엇에 대한 글인지 모르는 쪽이 하나 생깁니다.
 */
const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,ul,ol,li,dl,pre,blockquote,table,thead,tbody,tr,hr,figure,img,.mermaid-block,.sheet-page'
const HEADINGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']

export function breakStops(sheet: HTMLElement): number[] {
  const top = sheet.getBoundingClientRect().top

  return [...sheet.querySelectorAll<HTMLElement>(BLOCKS)]
    .filter((block) => !HEADINGS.includes(block.previousElementSibling?.tagName ?? ''))
    .map((block) => block.getBoundingClientRect().top - top)
}

/** 쪽 하나에 그림을 앉힐 자리. 긴 쪽에 맞춰 누이고 가운데에 둡니다. */
export interface Placement {
  orientation: 'portrait' | 'landscape'
  pageWidth: number
  pageHeight: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * 그림 한 장을 쪽 하나에 앉힙니다.
 *
 * 가로로 긴 그림은 쪽을 누입니다. 세운 쪽에 억지로 넣으면 좌우 여백만 남고 그림은
 * 손톱만 해집니다. 여러 쪽으로 잘라 이어 붙이는 길은 버렸습니다 — 한 장의 그림을
 * 두 쪽에 걸쳐 놓으면 이어 보려고 종이를 맞대야 하고, 화면에서는 더 쓸모가 없습니다.
 */
export function fitOnPage(width: number, height: number): Placement {
  const landscape = width > height
  const pageWidth = landscape ? PAGE_HEIGHT : PAGE_WIDTH
  const pageHeight = landscape ? PAGE_WIDTH : PAGE_HEIGHT
  const room = { width: pageWidth - PAGE_MARGIN * 2, height: pageHeight - PAGE_MARGIN * 2 }

  // 넘치는 것만 줄입니다. 작은 그림을 억지로 늘리면 뿌옇게 번집니다.
  const scale = Math.min(1, room.width / width, room.height / height)
  const drawn = { width: width * scale, height: height * scale }

  return {
    orientation: landscape ? 'landscape' : 'portrait',
    pageWidth,
    pageHeight,
    x: (pageWidth - drawn.width) / 2,
    y: (pageHeight - drawn.height) / 2,
    width: drawn.width,
    height: drawn.height,
  }
}

/*
 * 그림을 몇 배로 그릴지.
 *
 * 한 배로 그리면 글자 획이 뭉개집니다. 두 배로 떠서 쪽 크기로 줄여 앉히면 종이에서도
 * 또렷합니다. 다만 canvas 한 장이 가질 수 있는 넓이에는 한계가 있어(크롬은 넓이로 셉니다)
 * 긴 글에서는 배율을 낮춥니다. 낮추지 않으면 canvas 가 조용히 빈 그림을 돌려줍니다.
 */
const RASTER_SCALE = 2
const MAX_RASTER_PIXELS = 48_000_000

export function rasterScale(width: number, height: number): number {
  const fits = Math.sqrt(MAX_RASTER_PIXELS / Math.max(1, width * height))
  return Math.max(1, Math.min(RASTER_SCALE, fits))
}

/** 글자 꼴을 입힌 조각이 아니라 그림을 싣습니다. 쪽마다 조각을 따로 떠서 넣습니다. */
function sliceOf(canvas: HTMLCanvasElement, from: number, to: number): string {
  const slice = document.createElement('canvas')
  slice.width = canvas.width
  slice.height = Math.max(1, Math.round(to - from))

  const paint = slice.getContext('2d')
  if (!paint) throw new Error('이 브라우저에서는 그림을 뜰 수 없습니다.')
  // 투명한 자리가 남으면 PDF 에서 검게 나옵니다. 흰 바탕을 먼저 깔아 둡니다.
  paint.fillStyle = '#ffffff'
  paint.fillRect(0, 0, slice.width, slice.height)
  paint.drawImage(canvas, 0, -from)

  return slice.toDataURL('image/png')
}

/**
 * 글이 담긴 칸을 그대로 떠서 쪽마다 나눠 담습니다.
 *
 * 글자를 PDF 의 글자로 옮기는 길(jsPDF 의 text)은 버렸습니다. 그 길로 한글을 쓰려면
 * 한글 글꼴 한 벌(수 MB)을 앱에 싣고 다녀야 하고, 싣더라도 마크다운의 표·코드·수식·
 * 다이어그램을 손으로 다시 앉혀야 합니다. 브라우저에게 그리게 하고 그 그림을 담으면
 * **화면에서 보던 그대로** 나옵니다. 글자를 집어낼 수는 없는 대신, 어긋나는 것이 없습니다.
 */
export async function sheetToPdf(sheet: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  // 넓은 표는 글자 폭보다 바깥으로 비어져 나옵니다. 그만큼까지 떠서 쪽에 맞춰 줄입니다.
  const width = Math.max(sheet.scrollWidth, SHEET_WIDTH)
  const height = sheet.scrollHeight
  /*
   * 뜨는 쪽은 제 틀을 세워 화면을 한 벌 베낀 뒤 거기서 그립니다. 그 틀의 너비를 쪽 너비로
   * 일러 주었더니(`windowWidth`), **베낀 쪽에서는 좁은 화면 규칙이 걸렸습니다**(@media
   * max-width: 720px). 글 칸의 좌우 여백이 20px 에서 12px 로 줄어 글이 다르게 접히고,
   * 그러면 쪽을 가를 자리를 재어 둔 이쪽(진짜 화면)과 그려진 그림이 어긋납니다. 어긋난
   * 만큼 쪽 끝에서 글줄과 표의 한 줄이 반 토막 났습니다. 틀의 너비는 건드리지 않습니다 —
   * 그래야 재는 쪽과 그리는 쪽이 같은 규칙으로 섭니다. 그와 짝으로, 글 칸의 여백은
   * `.pdf-sheet .preview` 에서 못 박아 두었습니다. 사람이 창을 좁혀 두었을 때도 쪽은
   * 같은 모양이어야 하기 때문입니다.
   */
  const canvas = await html2canvas(sheet, {
    scale: rasterScale(width, height),
    width,
    height,
    backgroundColor: '#ffffff',
    logging: false,
  })

  /* 실제로 뜬 배율. 브라우저가 한계에 걸려 깎았을 수도 있어 재어 씁니다. */
  const scale = canvas.width / width
  // 쪽에 들어가는 높이를 글 쪽 자리(CSS 픽셀)로 환산합니다.
  const limit = (CONTENT_HEIGHT * width) / CONTENT_WIDTH
  const edges = [0, ...pageBreaks(breakStops(sheet), height, limit), height]

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true })
  for (let page = 0; page + 1 < edges.length; page += 1) {
    if (page > 0) doc.addPage()
    const from = edges[page] * scale
    const to = edges[page + 1] * scale
    const drawn = ((to - from) / scale) * (CONTENT_WIDTH / width)
    doc.addImage(sliceOf(canvas, from, to), 'PNG', PAGE_MARGIN, PAGE_MARGIN, CONTENT_WIDTH, drawn)
  }

  return doc.output('blob')
}

/** 크기를 밝히지 않은 SVG. 그려 둔 자리를 읽어 가로세로 비를 셉니다. */
async function svgSize(blob: Blob): Promise<{ width: number; height: number }> {
  const text = await blob.text()
  const box = /viewBox\s*=\s*["']\s*[\d.+-]+[\s,]+[\d.+-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text)
  if (box) return { width: Number(box[1]), height: Number(box[2]) }
  // 그것도 없으면 브라우저가 쓰는 기본 크기입니다. 벡터라 키워 떠도 번지지 않습니다.
  return { width: 300, height: 150 }
}

/** 벡터 그림을 이만큼 키워 뜹니다. 본디 크기로 뜨면 종이에서 획이 뭉개집니다. */
const VECTOR_WIDTH = 1600

async function imageCanvas(blob: Blob, path: string): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(withMime(blob, path))
  try {
    const image = new Image()
    image.src = url
    await image.decode()

    /*
     * SVG 는 크기를 밝히지 않은 것이 많아 naturalWidth 가 0 으로 옵니다. 그대로
     * canvas 를 만들면 넓이가 0 이라 아무것도 그려지지 않습니다.
     */
    const natural = image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : await svgSize(blob)
    const scale = extensionOf(path) === 'svg' ? Math.max(1, VECTOR_WIDTH / natural.width) : 1

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(natural.width * scale)
    canvas.height = Math.round(natural.height * scale)

    const paint = canvas.getContext('2d')
    if (!paint) throw new Error('이 브라우저에서는 그림을 뜰 수 없습니다.')
    paint.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/*
 * 투명한 자리를 지닐 수 있는 형식. 이쪽은 PNG 로 싣습니다.
 *
 * 나머지(사진)는 JPEG 로 싣습니다. 사진을 PNG 로 담으면 파일이 열 배로 불어나는데,
 * 사진은 애초에 JPEG 로 들어온 것이라 다시 JPEG 로 담아도 눈에 띄게 나빠지지 않습니다.
 */
const ALPHA_FORMATS = ['png', 'gif', 'webp', 'avif', 'svg', 'ico']

/**
 * 그림 한 장을 PDF 한 쪽으로 냅니다.
 *
 * 움직이는 GIF 는 첫 장만 담깁니다. PDF 에는 움직임을 담을 자리가 없습니다.
 */
export async function imageToPdf(blob: Blob, path: string): Promise<Blob> {
  const canvas = await imageCanvas(blob, path)
  const alpha = ALPHA_FORMATS.includes(extensionOf(path))

  if (!alpha) {
    // 투명한 자리가 없는 형식이라도 JPEG 로 바꾸는 길에 검게 깔리지 않도록 흰 바탕을 먼저 둡니다.
    const paint = canvas.getContext('2d')
    if (paint) {
      paint.globalCompositeOperation = 'destination-over'
      paint.fillStyle = '#ffffff'
      paint.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  const place = fitOnPage(canvas.width, canvas.height)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: place.orientation,
    compress: true,
  })
  doc.addImage(
    alpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92),
    alpha ? 'PNG' : 'JPEG',
    place.x, place.y, place.width, place.height,
  )

  return doc.output('blob')
}
