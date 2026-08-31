/**
 * 마크다운이 아닌 첨부 파일을 다루는 규칙.
 *
 * 아무 파일이나 동기화하면 저장소가 금방 무거워집니다.
 * git 은 한 번 올린 바이너리를 이력에 영구히 남기기 때문에, 지워도 저장소는 줄지 않습니다.
 * 그래서 문서에 곁들일 만한 형식만 골라 받고 크기도 제한합니다.
 */

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']

export const DOCUMENT_EXTENSIONS = [
  'pdf', 'txt', 'csv', 'tsv', 'json', 'yaml', 'yml',
  'docx', 'xlsx', 'pptx', 'hwp', 'hwpx',
]

const ATTACHMENT_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS])

/** 이보다 큰 첨부는 동기화하지 않습니다. 로컬에는 그대로 두고 목록에만 표시합니다. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

/** 파일 고르기 창에서 미리 걸러 주는 목록. */
export const ACCEPT_ATTRIBUTE = [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS]
  .map((extension) => `.${extension}`)
  .join(',')

export type AttachmentKind = 'image' | 'pdf' | 'text' | 'binary'

export function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? path
  const at = name.lastIndexOf('.')
  return at === -1 ? '' : name.slice(at + 1).toLowerCase()
}

export function isMarkdown(path: string): boolean {
  return extensionOf(path) === 'md'
}

export function isAttachment(path: string): boolean {
  return ATTACHMENT_EXTENSIONS.has(extensionOf(path))
}

/** 동기화 대상인지. 마크다운이거나, 크기 제한을 넘지 않는 첨부입니다. */
export function isSyncable(path: string, size: number): boolean {
  if (isMarkdown(path)) return true
  return isAttachment(path) && size <= MAX_ATTACHMENT_BYTES
}

/** 마크다운은 아니지만 글자로 되어 있어 고쳐 쓸 수 있는 형식. */
export function isEditableText(path: string): boolean {
  return attachmentKind(path) === 'text'
}

/** 미리보기를 어떤 방식으로 그릴지. */
export function attachmentKind(path: string): AttachmentKind {
  const extension = extensionOf(path)
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image'
  if (extension === 'pdf') return 'pdf'
  if (['txt', 'csv', 'tsv', 'json', 'yaml', 'yml'].includes(extension)) return 'text'
  return 'binary'
}

const UNITS = ['B', 'KB', 'MB', 'GB']

export function formatBytes(bytes: number): string {
  if (bytes < 1) return '0 B'
  const step = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** step
  return `${step === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${UNITS[step]}`
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values',
  json: 'application/json', yaml: 'text/yaml', yml: 'text/yaml',
}

/**
 * 확장자로 형식을 추정합니다.
 * 파일시스템이 형식을 비워 두는 경우가 있는데, 그대로 두면 <img> 나 <iframe> 이 내용을 해석하지 못합니다.
 */
export function mimeFor(path: string): string {
  return MIME_BY_EXTENSION[extensionOf(path)] ?? 'application/octet-stream'
}

/** 형식이 비어 있으면 확장자로 채워 돌려줍니다. */
export function withMime(blob: Blob, path: string): Blob {
  return blob.type ? blob : new Blob([blob], { type: mimeFor(path) })
}
