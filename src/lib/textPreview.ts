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

/*
 * XML 들여쓰기.
 *
 * DOMParser 로 읽고 다시 써 내는 길도 있지만, 그러면 원문에 있던 것이 조용히
 * 바뀝니다. 실체 참조가 풀리고, 빈 요소가 <a/> 로 접히고, 선언이 사라집니다.
 * 그래서 JSON 때와 같이 글자를 그대로 두고 줄과 들여쓰기만 새로 잡습니다.
 *
 * 되돌릴 수 없는 곳에는 손대지 않습니다.
 * - 글이 태그와 섞여 있는 요소(<p>앞 <b>강조</b> 뒤</p>)는 통째로 원문 그대로 둡니다.
 *   줄을 바꾸면 없던 공백이 생겨 뜻이 달라집니다.
 * - xml:space="preserve" 가 붙은 요소도 마찬가지입니다.
 * - 짝이 맞지 않으면 null 을 돌려주고 아무것도 하지 않습니다.
 */
type XmlNode =
  | { kind: 'raw'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'element'; open: string; close: string; children: XmlNode[]; source: string }

interface Scanner {
  text: string
  at: number
  /** 방금 닫은 태그가 시작한 자리. 원문을 그대로 떠 올 때 씁니다. */
  closeFrom: number
  /** 방금 닫은 태그의 원문. `</ a >` 처럼 띄어 쓴 것도 그대로 지킵니다. */
  closeTag: string
}

/** 여는 태그의 끝 `>`. 속성값 안의 `>` 에 속지 않도록 따옴표를 셉니다. */
function tagEnd(text: string, from: number): number {
  let quote = ''
  for (let at = from; at < text.length; at += 1) {
    const letter = text[at]
    if (quote) {
      if (letter === quote) quote = ''
    } else if (letter === '"' || letter === "'") {
      quote = letter
    } else if (letter === '>') {
      return at
    }
  }
  return -1
}

/** 닫는 기호까지의 덩어리를 통째로 집습니다. 주석·CDATA·선언에 씁니다. */
function chunkUntil(scan: Scanner, ending: string): string | null {
  const end = scan.text.indexOf(ending, scan.at)
  if (end === -1) return null
  const piece = scan.text.slice(scan.at, end + ending.length)
  scan.at = end + ending.length
  return piece
}

function parseNodes(scan: Scanner, until: string | null): XmlNode[] | null {
  const nodes: XmlNode[] = []

  while (scan.at < scan.text.length) {
    if (scan.text[scan.at] !== '<') {
      const next = scan.text.indexOf('<', scan.at)
      const end = next === -1 ? scan.text.length : next
      nodes.push({ kind: 'text', text: scan.text.slice(scan.at, end) })
      scan.at = end
      continue
    }

    if (scan.text.startsWith('</', scan.at)) {
      const end = scan.text.indexOf('>', scan.at)
      if (end === -1) return null
      const name = scan.text.slice(scan.at + 2, end).trim()
      if (name !== until) return null
      scan.closeFrom = scan.at
      scan.closeTag = scan.text.slice(scan.at, end + 1)
      scan.at = end + 1
      return nodes
    }

    if (scan.text.startsWith('<!--', scan.at)) {
      const piece = chunkUntil(scan, '-->')
      if (piece === null) return null
      nodes.push({ kind: 'raw', text: piece })
      continue
    }
    if (scan.text.startsWith('<![CDATA[', scan.at)) {
      const piece = chunkUntil(scan, ']]>')
      if (piece === null) return null
      // 글자 그대로여야 하므로 글로 셉니다. 이 요소는 줄을 바꾸지 않습니다.
      nodes.push({ kind: 'text', text: piece })
      continue
    }
    if (scan.text.startsWith('<?', scan.at)) {
      const piece = chunkUntil(scan, '?>')
      if (piece === null) return null
      nodes.push({ kind: 'raw', text: piece })
      continue
    }
    if (scan.text.startsWith('<!', scan.at)) {
      const end = tagEnd(scan.text, scan.at)
      if (end === -1) return null
      nodes.push({ kind: 'raw', text: scan.text.slice(scan.at, end + 1) })
      scan.at = end + 1
      continue
    }

    const end = tagEnd(scan.text, scan.at)
    if (end === -1) return null
    const open = scan.text.slice(scan.at, end + 1)
    scan.at = end + 1

    if (open.endsWith('/>')) {
      nodes.push({ kind: 'raw', text: open })
      continue
    }

    const name = /^<\s*([^\s/>]+)/.exec(open)?.[1]
    if (!name) return null

    const innerFrom = scan.at
    const children = parseNodes(scan, name)
    if (children === null) return null

    nodes.push({
      kind: 'element',
      open,
      close: scan.closeTag,
      children,
      source: open + scan.text.slice(innerFrom, scan.closeFrom) + scan.closeTag,
    })
  }

  // 닫는 태그를 기다리고 있었는데 글이 끝났으면 짝이 맞지 않는 것입니다.
  return until === null ? nodes : null
}

function hasWords(node: XmlNode): boolean {
  return node.kind === 'text' && node.text.trim().length > 0
}

function render(nodes: XmlNode[], depth: number, indent: string): string[] {
  const lines: string[] = []
  const pad = indent.repeat(depth)

  for (const node of nodes) {
    if (node.kind === 'text') {
      if (node.text.trim().length > 0) lines.push(pad + node.text.trim())
      continue
    }
    if (node.kind === 'raw') {
      lines.push(pad + node.text.trim())
      continue
    }

    // 글이 섞여 있거나 공백을 지키라고 했으면 원문 그대로 한 줄에 둡니다.
    if (node.children.some(hasWords) || /\sxml:space\s*=\s*(["'])preserve\1/.test(node.open)) {
      lines.push(pad + node.source.trim())
      continue
    }
    if (node.children.length === 0 || node.children.every((child) => child.kind === 'text')) {
      lines.push(pad + node.open + node.close)
      continue
    }

    lines.push(pad + node.open)
    lines.push(...render(node.children, depth + 1, indent))
    lines.push(pad + node.close)
  }

  return lines
}

/** 정돈한 XML. 짝이 맞지 않거나 손댈 것이 없으면 null 입니다. */
export function reindentXml(text: string, indent = '  '): string | null {
  if (text.trim().length === 0) return null

  const nodes = parseNodes({ text, at: 0, closeFrom: 0, closeTag: '' }, null)
  if (nodes === null) return null
  if (!nodes.some((node) => node.kind === 'element' || node.kind === 'raw')) return null

  const lines = render(nodes, 0, indent)
  return lines.length > 0 ? `${lines.join('\n')}\n` : null
}
