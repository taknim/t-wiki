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

/**
 * JSON 을 값은 그대로 두고 들여쓰기만 다시 맞춥니다.
 *
 * JSON.parse 후 다시 문자열로 만들면 간단하지만, 큰 정수의 정밀도가 조용히 깨집니다.
 * (8143661439548533232 → 8143661439548533000)
 * 그래서 글자를 훑으며 공백만 새로 넣습니다. 숫자와 문자열은 원문 그대로 옮깁니다.
 *
 * 형식이 어긋나면 null 을 돌려주고, 부르는 쪽은 원문을 그대로 씁니다.
 */
export function reindentJson(text: string, indent = '  '): string | null {
  let out = ''
  let depth = 0
  let at = 0

  const pad = (level: number) => '\n' + indent.repeat(level)
  const lastMeaningful = () => out.trimEnd().slice(-1)

  while (at < text.length) {
    const char = text[at]

    // 문자열은 따옴표가 닫힐 때까지 한 글자도 바꾸지 않고 옮깁니다.
    if (char === '"') {
      const start = at
      at += 1
      while (at < text.length) {
        if (text[at] === '\\') {
          at += 2
          continue
        }
        if (text[at] === '"') {
          at += 1
          break
        }
        at += 1
      }
      if (text[at - 1] !== '"' || at - start < 2) return null
      out += text.slice(start, at)
      continue
    }

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      at += 1
      continue
    }

    if (char === '{' || char === '[') {
      out += char
      depth += 1
      at += 1
      // 바로 닫히는 빈 묶음은 한 줄로 둡니다.
      const next = text.slice(at).search(/\S/)
      if (next !== -1 && (text[at + next] === '}' || text[at + next] === ']')) {
        depth -= 1
        out += text[at + next]
        at += next + 1
      } else {
        out += pad(depth)
      }
      continue
    }

    if (char === '}' || char === ']') {
      depth -= 1
      if (depth < 0) return null
      out += pad(depth) + char
      at += 1
      continue
    }

    if (char === ',') {
      out += ',' + pad(depth)
      at += 1
      continue
    }

    if (char === ':') {
      out += ': '
      at += 1
      continue
    }

    // 숫자, true/false/null 같은 값은 통째로 옮깁니다.
    const literal = /^[^\s,:{}[\]"]+/.exec(text.slice(at))
    if (!literal) return null
    out += literal[0]
    at += literal[0].length
  }

  if (depth !== 0) return null
  // 값 하나만 덩그러니 있거나 뒤에 군더더기가 붙은 경우는 손대지 않습니다.
  return lastMeaningful() === '}' || lastMeaningful() === ']' ? out + '\n' : null
}
