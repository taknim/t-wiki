/**
 * 마크다운이 아닌 첨부 파일을 다루는 규칙.
 *
 * 아무 파일이나 동기화하면 저장소가 금방 무거워집니다.
 * git 은 한 번 올린 바이너리를 이력에 영구히 남기기 때문에, 지워도 저장소는 줄지 않습니다.
 * 그래서 문서에 곁들일 만한 형식만 골라 받고 크기도 제한합니다.
 */

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']

/*
 * 코드 파일. 편집기에서 고치고, 미리보기는 실행이 아니라 문법 강조로만 보여 줍니다.
 * 강조기(highlight.js 의 common 벌)가 아는 말만 둡니다. 모르는 말을 두면 흰 글로만 나옵니다.
 * 확장자 → 강조기가 부르는 이름은 textPreview.ts 의 highlightLanguage 에 있습니다.
 */
export const CODE_EXTENSIONS = [
  'sql', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'sh', 'bash', 'zsh',
  'java', 'kt', 'kts', 'go', 'rs', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'swift',
  'rb', 'php', 'lua', 'pl', 'r', 'css', 'scss', 'less', 'ini', 'toml', 'properties',
  'diff', 'patch', 'graphql', 'gql', 'makefile',
]

export const DOCUMENT_EXTENSIONS = [
  'pdf', 'txt', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'htm',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx',
  ...CODE_EXTENSIONS,
]

/** 표로 그릴 수 있는 엑셀. 옛 이진 형식(xls)도 읽습니다. */
const SHEET_EXTENSIONS = ['xlsx', 'xlsm', 'xls', 'csv2']

/** 글로 풀어 볼 수 있는 워드. 옛 이진 형식(doc)은 브라우저에서 읽을 방법이 없습니다. */
const WORD_EXTENSIONS = ['docx']

/** 글자로 되어 있어 편집기에서 고쳐 쓸 수 있는 형식. */
const TEXT_EXTENSIONS = ['txt', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', ...CODE_EXTENSIONS]

const ATTACHMENT_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS])

/** 이보다 큰 첨부는 동기화하지 않습니다. 로컬에는 그대로 두고 목록에만 표시합니다. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

/**
 * 파일 고르기 창에서 미리 걸러 주는 목록.
 * 마크다운을 빼면 이 위키가 다루는 본래 형식을 정작 넣을 수 없습니다.
 */
export const ACCEPT_ATTRIBUTE = ['md', ...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS]
  .map((extension) => `.${extension}`)
  .join(',')

export type AttachmentKind = 'image' | 'pdf' | 'text' | 'sheet' | 'word' | 'binary'

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

/** 밖에서 끌어다 넣을 수 있는 형식인지. 마크다운과 첨부가 모두 들어옵니다. */
export function isAddable(path: string): boolean {
  return isMarkdown(path) || isAttachment(path)
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
  if (TEXT_EXTENSIONS.includes(extension)) return 'text'
  if (SHEET_EXTENSIONS.includes(extension)) return 'sheet'
  if (WORD_EXTENSIONS.includes(extension)) return 'word'
  return 'binary'
}

/**
 * 옛 오피스 이진 형식인지. doc·ppt 는 브라우저에서 풀 방법이 사실상 없습니다.
 * 못 여는 까닭을 밝히고 무엇으로 바꾸면 되는지 일러 주려고 따로 가립니다.
 */
export function legacyOffice(path: string): string | null {
  const extension = extensionOf(path)
  if (extension === 'doc') return 'docx'
  if (extension === 'ppt') return 'pptx'
  return null
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
  // 코드 파일은 모두 글자입니다. 브라우저가 형식을 비워 두어도 글자로 읽히게 합니다.
  ...Object.fromEntries(CODE_EXTENSIONS.map((extension) => [extension, 'text/plain'])),
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
