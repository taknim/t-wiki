import { extensionOf } from './attachments'

/** 글자 파일을 어떤 방식으로 보여 줄지. null 이면 보여 줄 것이 없어 편집기만 씁니다. */
export type TextPreviewKind = 'table' | 'code' | 'html' | null

export function textPreviewKind(path: string): TextPreviewKind {
  const extension = extensionOf(path)
  if (extension === 'csv' || extension === 'tsv') return 'table'
  if (['json', 'yaml', 'yml', 'xml'].includes(extension)) return 'code'
  if (extension === 'html' || extension === 'htm') return 'html'
  return null
}

/** 하이라이팅에 쓸 언어 이름. highlight.js 는 html 도 xml 로 다룹니다. */
export function highlightLanguage(path: string): string {
  const extension = extensionOf(path)
  if (extension === 'yml') return 'yaml'
  if (extension === 'htm' || extension === 'html') return 'xml'
  return extension
}

export function delimiterFor(path: string): string {
  return extensionOf(path) === 'tsv' ? '\t' : ','
}

/**
 * 쉼표로 나눈 표를 읽습니다.
 *
 * 단순히 쪼개면 따옴표 안의 쉼표와 줄바꿈에서 표가 어긋납니다.
 * 큰따옴표로 감싼 칸과 그 안의 `""` 는 규격대로 다룹니다.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]

    if (quoted) {
      if (char !== '"') {
        field += char
        continue
      }
      // 따옴표 두 개는 따옴표 한 글자입니다.
      if (text[at + 1] === '"') {
        field += '"'
        at += 1
        continue
      }
      quoted = false
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      // 윈도 줄바꿈은 두 글자를 한 번으로 셉니다.
      if (char === '\r' && text[at + 1] === '\n') at += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
