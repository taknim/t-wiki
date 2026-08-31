export type FormatId =
  | 'bold' | 'italic' | 'strike' | 'code' | 'math'
  | 'h1' | 'h2' | 'h3'
  | 'ul' | 'ol' | 'task' | 'quote'
  | 'link' | 'wikilink' | 'codeblock'

/** 편집기의 현재 상태. 서식 적용 결과도 같은 모양으로 돌려줍니다. */
export interface EditState {
  text: string
  start: number
  end: number
}

const HEADING = /^#{1,6}[ \t]+/
const BULLET = /^[-*+][ \t]+/
/** 체크박스 줄은 글머리 기호로 시작하지만 일반 목록으로 세면 안 됩니다. */
const PLAIN_BULLET = /^[-*+][ \t]+(?!\[[ xX]\][ \t])/
const NUMBERED = /^\d+\.[ \t]+/
const TASK = /^[-*+][ \t]+\[[ xX]\][ \t]+/
const QUOTE = /^>[ \t]?/

/** 선택이 비어 있을 때 대신 넣어 줄 문구. 넣은 뒤 그 부분을 선택 상태로 둡니다. */
const PLACEHOLDER: Partial<Record<FormatId, string>> = {
  bold: '굵게',
  italic: '기울임',
  strike: '취소선',
  code: '코드',
  math: 'E = mc^2',
  link: '링크 글자',
  wikilink: '문서 이름',
}

function replace(state: EditState, from: number, to: number, value: string, selectFrom: number, selectTo: number): EditState {
  return {
    text: state.text.slice(0, from) + value + state.text.slice(to),
    start: selectFrom,
    end: selectTo,
  }
}

/**
 * 앞뒤를 같은 기호로 감쌉니다. 이미 감싸져 있으면 벗깁니다.
 * 선택 범위가 기호를 포함한 경우와, 기호가 선택 바깥에 있는 경우를 모두 봅니다.
 */
function toggleWrap(state: EditState, marker: string, placeholder: string): EditState {
  const { text, start, end } = state
  const selected = text.slice(start, end)
  const size = marker.length

  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(size, -size)
    return replace(state, start, end, inner, start, start + inner.length)
  }

  const before = text.slice(Math.max(0, start - size), start)
  const after = text.slice(end, end + size)
  if (before === marker && after === marker) {
    return replace(state, start - size, end + size, selected, start - size, end - size)
  }

  const body = selected || placeholder
  return replace(state, start, end, marker + body + marker, start + size, start + size + body.length)
}

/** 선택이 걸쳐 있는 줄들의 전체 범위. */
function lineRange(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const found = text.indexOf('\n', end)
  return [from, found === -1 ? text.length : found]
}

/**
 * 줄 앞에 기호를 붙이거나 뗍니다.
 * 모든 줄이 이미 그 서식이면 해제하고, 아니면 기존 서식을 걷어내고 새로 붙입니다.
 */
function toggleLinePrefix(
  state: EditState,
  makePrefix: (index: number) => string,
  own: RegExp,
  clear: RegExp[],
): EditState {
  const { text, start, end } = state
  const [from, to] = lineRange(text, start, end)
  const lines = text.slice(from, to).split('\n')

  const allMarked = lines.every((line) => own.test(line))
  const next = lines.map((line, index) => {
    let bare = line
    for (const pattern of clear) bare = bare.replace(pattern, '')
    return allMarked ? bare : makePrefix(index) + bare
  })

  const block = next.join('\n')
  const delta = block.length - (to - from)
  // 선택 시작이 줄머리보다 앞으로 밀리지 않게 잡아 둡니다.
  return replace(state, from, to, block, Math.max(from, start + (next[0].length - lines[0].length)), end + delta)
}

function applyLink(state: EditState): EditState {
  const { text, start, end } = state
  const selected = text.slice(start, end)
  const looksLikeUrl = /^(https?:\/\/|www\.|\/)/i.test(selected.trim())

  if (looksLikeUrl) {
    const label = '링크 글자'
    const value = `[${label}](${selected.trim()})`
    return replace(state, start, end, value, start + 1, start + 1 + label.length)
  }

  const label = selected || PLACEHOLDER.link!
  const url = 'https://'
  const value = `[${label}](${url})`
  // 주소 자리에 커서를 두어 바로 붙여 넣을 수 있게 합니다.
  const urlAt = start + 1 + label.length + 2
  return replace(state, start, end, value, urlAt, urlAt + url.length)
}

function applyCodeBlock(state: EditState): EditState {
  const { text, start, end } = state
  const [from, to] = lineRange(text, start, end)
  const block = text.slice(from, to)

  const lines = block.split('\n')
  const fenced = lines.length >= 2 && /^```/.test(lines[0]) && /^```/.test(lines[lines.length - 1])

  if (fenced) {
    const inner = lines.slice(1, -1).join('\n')
    return replace(state, from, to, inner, from, from + inner.length)
  }

  const value = '```\n' + block + '\n```'
  // 언어를 바로 입력할 수 있도록 여는 울타리 끝에 커서를 둡니다.
  return replace(state, from, to, value, from + 3, from + 3)
}

export function applyFormat(id: FormatId, state: EditState): EditState {
  switch (id) {
    case 'bold':
      return toggleWrap(state, '**', PLACEHOLDER.bold!)
    case 'italic':
      return toggleWrap(state, '*', PLACEHOLDER.italic!)
    case 'strike':
      return toggleWrap(state, '~~', PLACEHOLDER.strike!)
    case 'code':
      return toggleWrap(state, '`', PLACEHOLDER.code!)
    case 'math':
      return toggleWrap(state, '$', PLACEHOLDER.math!)

    case 'h1':
      return toggleLinePrefix(state, () => '# ', /^#[ \t]+/, [HEADING])
    case 'h2':
      return toggleLinePrefix(state, () => '## ', /^##[ \t]+/, [HEADING])
    case 'h3':
      return toggleLinePrefix(state, () => '### ', /^###[ \t]+/, [HEADING])

    case 'ul':
      return toggleLinePrefix(state, () => '- ', PLAIN_BULLET, [TASK, BULLET, NUMBERED])
    case 'ol':
      return toggleLinePrefix(state, (index) => `${index + 1}. `, NUMBERED, [TASK, BULLET, NUMBERED])
    case 'task':
      return toggleLinePrefix(state, () => '- [ ] ', TASK, [TASK, BULLET, NUMBERED])
    case 'quote':
      return toggleLinePrefix(state, () => '> ', QUOTE, [QUOTE])

    case 'wikilink':
      return wrapWikilink(state)
    case 'link':
      return applyLink(state)
    case 'codeblock':
      return applyCodeBlock(state)
  }
}

/** `[[`/`]]` 는 여는 기호와 닫는 기호가 달라 toggleWrap 을 쓸 수 없습니다. */
function wrapWikilink(state: EditState): EditState {
  const { text, start, end } = state
  const selected = text.slice(start, end)

  if (selected.startsWith('[[') && selected.endsWith(']]') && selected.length >= 4) {
    const inner = selected.slice(2, -2)
    return replace(state, start, end, inner, start, start + inner.length)
  }
  if (text.slice(Math.max(0, start - 2), start) === '[[' && text.slice(end, end + 2) === ']]') {
    return replace(state, start - 2, end + 2, selected, start - 2, end - 2)
  }

  const body = selected || PLACEHOLDER.wikilink!
  return replace(state, start, end, `[[${body}]]`, start + 2, start + 2 + body.length)
}
