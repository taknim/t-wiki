/*
 * 그림을 고쳐 다시 내는 일.
 *
 * 서버가 없으므로 브라우저의 canvas 로 그려 냅니다. 원본 파일은 건드리지 않고 **새 파일로만**
 * 내놓습니다 — 고치는 일은 되돌릴 수 없고, 덮어쓰면 원본이 사라집니다.
 */

/** 내놓을 수 있는 형식. */
export type ImageFormat = 'png' | 'jpeg'

export const FORMATS: { id: ImageFormat; name: string; extension: string }[] = [
  { id: 'png', name: 'PNG', extension: 'png' },
  { id: 'jpeg', name: 'JPG', extension: 'jpg' },
]

/** 잘라 낼 자리. 본디 크기(픽셀) 기준입니다. */
export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

export interface RenderOptions {
  /** 잘라 낼 자리. 없으면 통째로. */
  crop?: Crop | null
  /** 내놓을 크기. 없으면 잘라 낸 크기 그대로. */
  width?: number
  height?: number
  format: ImageFormat
  /** JPG 의 품질(0.1 ~ 1). PNG 에는 뜻이 없습니다. */
  quality?: number
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

/** 한쪽을 정했을 때 비율을 지키는 다른 쪽 길이. */
export function keepRatio(side: number, from: number, to: number): number {
  return clampSide((side * to) / from)
}

/**
 * 내놓을 파일 이름. 확장자를 고른 형식으로 갈고, 원본을 덮지 않도록 꼬리말을 붙입니다.
 * (같은 이름이 이미 있으면 파일을 넣는 쪽에서 번호를 붙입니다.)
 */
export function outputName(path: string, format: ImageFormat, suffix = ' (고침)'): string {
  const name = path.split('/').pop() ?? path
  const at = name.lastIndexOf('.')
  const stem = at === -1 ? name : name.slice(0, at)
  const extension = FORMATS.find((one) => one.id === format)?.extension ?? 'png'
  return `${stem}${suffix}.${extension}`
}

/**
 * 잘라 내고 크기를 맞춰 새 그림을 냅니다.
 *
 * JPG 에는 투명이 없습니다. 그냥 그리면 투명한 자리가 검게 나오므로 흰 바탕을 먼저 깝니다.
 * 검정보다 흰 쪽이 원래 모습에 가깝습니다 — 화면도 문서도 대개 흰 바탕입니다.
 */
export async function renderImage(source: Blob, options: RenderOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  try {
    const crop = options.crop
      ? clampCrop(options.crop, { width: bitmap.width, height: bitmap.height })
      : { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
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
    paper.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('그림을 내놓지 못했습니다.'))),
        `image/${options.format}`,
        options.format === 'jpeg' ? (options.quality ?? 0.9) : undefined,
      )
    })
  } finally {
    bitmap.close()
  }
}
