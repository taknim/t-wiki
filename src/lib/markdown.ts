import DOMPurify from 'dompurify'
import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked'

export type LinkResolver = (target: string) => string | null

export interface Heading {
  id: string
  depth: number
  text: string
  /**
   * 이 제목 줄이 시작하는 글자 자리.
   *
   * 편집만 보고 있을 때는 뛰어갈 앵커가 없습니다. 그때는 이 자리를 짚어
   * 편집기를 그 줄로 굴려 보냅니다.
   */
  offset: number
}

export interface RenderResult {
  html: string
  /** mermaid 블록이 들어 있는지. 있으면 Preview 가 다이어그램 렌더 패스를 한 번 더 돕니다. */
  hasDiagram: boolean
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

/* ------------------------------------------------------------------ */
/* 렌더 중에만 쓰이는 상태                                              */
/* marked.parse 는 동기라 아래 값들을 설정한 뒤 곧바로 파싱하고 비웁니다. */
/* ------------------------------------------------------------------ */

let currentResolver: LinkResolver = () => null
let currentSlugs = new Map<string, number>()

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_LINE = /^\s*(`{3,}|~{3,})/

/**
 * 코드 울타리를 여닫습니다. 열어 둔 표시(`fence`)를 받아 새 표시를 돌려줍니다.
 *
 * 그냥 뒤집기만 했더니 울타리 안의 울타리에서 어긋났습니다. 코드 블록 쓰는 법을 글로
 * 보이려면 바깥을 백틱 넷으로 두르고 안에 셋을 적는데, 안쪽 셋을 닫는 것으로 세어
 * 그 뒤가 통째로 밀렸습니다 — 목차에 엉뚱한 제목이 들거나 빠지고, 할 일 네모도 어긋납니다.
 * 규격대로 **같은 글자에 길이가 같거나 더 긴 울타리**만 닫는 것으로 봅니다.
 */
function nextFence(line: string, fence: string | null): string | null | undefined {
  const match = FENCE_LINE.exec(line)
  if (!match) return undefined
  const mark = match[1]
  if (fence === null) return mark
  return mark[0] === fence[0] && mark.length >= fence.length ? null : fence
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 제목을 앵커로 쓸 수 있는 형태로. 한글은 그대로 두고 공백만 하이픈으로 바꿉니다. */
function slugify(text: string, seenCounts: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    || 'section'

  const seen = seenCounts.get(base) ?? 0
  seenCounts.set(base, seen + 1)
  return seen === 0 ? base : `${base}-${seen + 1}`
}

/**
 * 목차용 제목 목록. 렌더와 같은 slugify 를 쓰므로 앵커가 정확히 맞습니다.
 * 미리보기를 띄우지 않은 편집 모드에서도 목차를 보여 주기 위해 따로 뽑습니다.
 */
export function extractHeadings(markdown: string): Heading[] {
  const seenCounts = new Map<string, number>()
  const headings: Heading[] = []
  let fence: string | null = null
  // 줄 바꿈까지 세어 가며 글자 자리를 붙듭니다. 편집기로 뛰어갈 때 이 자리를 씁니다.
  let offset = 0

  for (const raw of markdown.split('\n')) {
    // 윈도우에서 온 글은 줄 끝에 \r 이 붙습니다. 셈에서는 빼지 않고 볼 때만 떼어 냅니다.
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const at = offset
    offset += raw.length + 1

    const fenced = nextFence(line, fence)
    if (fenced !== undefined) {
      fence = fenced
      continue
    }
    if (fence !== null) continue

    const match = HEADING_LINE.exec(line)
    if (!match) continue

    const text = match[2].replace(/\[\[([^\][|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label ?? target)
    headings.push({ id: slugify(text, seenCounts), depth: match[1].length, text, offset: at })
  }

  return headings
}

/**
 * 할 일 줄. `- [ ]`, `* [x]`, `1. [ ]`, 인용 안의 `> - [ ]` 까지 잡습니다.
 */
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/

/**
 * 미리보기에서 누른 네모를 원문에서도 켜고 끕니다.
 *
 * 몇 번째 네모인지로 자리를 짚습니다. 그린 차례와 원문에 적힌 차례가 같기 때문입니다.
 * 코드 블록 안의 `- [ ]` 는 네모로 그려지지 않으므로 셈에서도 뺍니다.
 * 짚을 자리가 없으면 null 을 돌려주고 원문은 건드리지 않습니다.
 */
export function toggleTask(markdown: string, index: number): string | null {
  const lines = markdown.split('\n')
  let fence: string | null = null
  let at = 0

  for (let where = 0; where < lines.length; where += 1) {
    const raw = lines[where]
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw

    const fenced = nextFence(line, fence)
    if (fenced !== undefined) {
      fence = fenced
      continue
    }
    if (fence !== null) continue

    const match = TASK_LINE.exec(line)
    if (!match) continue

    if (at === index) {
      const next = match[2] === ' ' ? 'x' : ' '
      lines[where] = match[1] + next + match[3] + line.slice(match[0].length)
        + (raw.endsWith('\r') ? '\r' : '')
      return lines.join('\n')
    }
    at += 1
  }

  return null
}

/* ------------------------------------------------------------------ */
/* 확장                                                                */
/* ------------------------------------------------------------------ */

interface WikilinkToken extends Tokens.Generic {
  target: string
  label: string
}

/** `![[그림.png]]` — 볼트 안 파일을 그대로 끼워 넣습니다. */
const embedExtension: TokenizerAndRendererExtension = {
  name: 'embed',
  level: 'inline',
  start(src: string) {
    const at = src.indexOf('![[')
    return at === -1 ? undefined : at
  },
  tokenizer(src: string) {
    const match = /^!\[\[([^\][|]+)(?:\|([^\]]+))?\]\]/.exec(src)
    if (!match) return undefined
    return {
      type: 'embed',
      raw: match[0],
      target: match[1].trim(),
      label: (match[2] ?? match[1]).trim(),
    } satisfies WikilinkToken
  },
  renderer(token) {
    const { target, label } = token as WikilinkToken
    if (!IMAGE_EXTENSIONS.test(target)) {
      // 이미지가 아닌 임베드는 일단 평범한 링크로 보여 줍니다.
      return `<a href="#" class="wikilink" data-wikilink="${escapeHtml(target)}">${escapeHtml(label)}</a>`
    }
    return `<img data-vault-src="${escapeHtml(target)}" alt="${escapeHtml(label)}" />`
  },
}

const wikilinkExtension: TokenizerAndRendererExtension = {
  name: 'wikilink',
  level: 'inline',
  start(src: string) {
    const at = src.indexOf('[[')
    return at === -1 ? undefined : at
  },
  tokenizer(src: string) {
    const match = /^\[\[([^\][|]+)(?:\|([^\]]+))?\]\]/.exec(src)
    if (!match) return undefined
    return {
      type: 'wikilink',
      raw: match[0],
      target: match[1].trim(),
      label: (match[2] ?? match[1]).trim(),
    } satisfies WikilinkToken
  },
  renderer(token) {
    const { target, label } = token as WikilinkToken
    const resolved = currentResolver(target)
    const cls = resolved ? 'wikilink' : 'wikilink wikilink-missing'
    const title = resolved ?? `"${target}" 문서가 아직 없습니다 (클릭하면 새로 만듭니다)`
    return `<a href="#" class="${cls}" data-wikilink="${escapeHtml(target)}" title="${escapeHtml(title)}">${escapeHtml(label)}</a>`
  },
}

const CALLOUT_LABEL: Record<string, string> = {
  note: '노트', info: '정보', tip: '팁', todo: '할 일',
  success: '완료', question: '질문', warning: '주의',
  danger: '위험', bug: '버그', example: '예시', quote: '인용',
}

const CALLOUT_ALIAS: Record<string, string> = {
  abstract: 'info', summary: 'info', hint: 'tip', important: 'tip',
  check: 'success', done: 'success', help: 'question', faq: 'question',
  caution: 'warning', attention: 'warning', error: 'danger', failure: 'danger',
  cite: 'quote',
}

interface CalloutToken extends Tokens.Generic {
  variant: string
  title: string
  tokens: Tokens.Generic[]
}

/** 옵시디안식 콜아웃: `> [!NOTE] 제목` 으로 시작하는 인용문. */
const calloutExtension: TokenizerAndRendererExtension = {
  name: 'callout',
  level: 'block',
  start(src: string) {
    return /^>\s*\[!/m.exec(src)?.index
  },
  tokenizer(src: string) {
    const block = /^((?:>[^\n]*(?:\n|$))+)/.exec(src)
    if (!block) return undefined

    const lines = block[1].replace(/\n$/, '').split('\n')
    const header = /^>\s*\[!([A-Za-z]+)\][+-]?\s*(.*)$/.exec(lines[0])
    if (!header) return undefined

    const raw = header[1].toLowerCase()
    const variant = CALLOUT_ALIAS[raw] ?? raw
    const body = lines.slice(1).map((line) => line.replace(/^>\s?/, '')).join('\n')

    return {
      type: 'callout',
      raw: block[1],
      variant: variant in CALLOUT_LABEL ? variant : 'note',
      title: header[2].trim() || CALLOUT_LABEL[variant] || '노트',
      tokens: this.lexer.blockTokens(body, []),
    } satisfies CalloutToken
  },
  renderer(token) {
    const { variant, title, tokens } = token as CalloutToken
    const body = tokens.length > 0 ? this.parser.parse(tokens) : ''
    return (
      `<div class="callout callout-${escapeHtml(variant)}">` +
      `<p class="callout-title">${escapeHtml(title)}</p>` +
      `<div class="callout-body">${body}</div>` +
      '</div>'
    )
  },
}

interface MathToken extends Tokens.Generic {
  text: string
  display: boolean
}

type Katex = {
  renderToString: (source: string, options: Record<string, unknown>) => string
}

let katex: Katex | null = null

function renderMath(source: string, display: boolean): string {
  if (!katex) return `<code class="math-pending">${escapeHtml(source)}</code>`
  try {
    return katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      output: 'htmlAndMathml',
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return `<code class="math-error" title="${escapeHtml(detail)}">${escapeHtml(source)}</code>`
  }
}

/** 백슬래시로 escape 하지 않은 첫 `$` 위치. 없으면 undefined. */
function findDollar(src: string): number | undefined {
  const at = src.search(/(?<!\\)\$/)
  return at === -1 ? undefined : at
}

/**
 * 블록 수식은 **줄 첫머리의** `$$` 에서만 시작합니다.
 *
 * `$` 하나까지 가리키면 marked 가 그 자리에서 문단을 끊어 버려 문장 안 수식이 인라인
 * 확장까지 도달하지 못합니다. 그렇다고 줄 가운데의 `$$` 까지 가리키면, 글 속에 `$$` 를
 * 적어 두기만 해도(수식 설명처럼 따옴표 안에 적은 것까지) 거기서 문단이 끊기고 블록
 * 수식이 그 뒤의 코드 울타리를 통째로 삼켜, 문서의 나머지가 통째로 어긋났습니다.
 */
function findDoubleDollar(src: string): number | undefined {
  const match = /(^|\n)(?<!\\)\$\$/.exec(src)
  return match ? match.index + match[1].length : undefined
}

/** 문단 하나를 통째로 차지하는 `$$ ... $$`. */
const mathBlockExtension: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: findDoubleDollar,
  tokenizer(src: string) {
    const match = /^\$\$([\s\S]+?)\$\$(?:\n+|$)/.exec(src)
    if (!match) return undefined
    return { type: 'mathBlock', raw: match[0], text: match[1].trim(), display: true } satisfies MathToken
  },
  renderer(token) {
    return `<div class="math-block">${renderMath((token as MathToken).text, true)}</div>`
  },
}

/** 문장 안의 `$ ... $`, 그리고 줄 가운데 놓인 `$$ ... $$`. */
const mathInlineExtension: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: findDollar,
  tokenizer(src: string) {
    const block = /^\$\$([\s\S]+?)\$\$/.exec(src)
    if (block) {
      return { type: 'mathInline', raw: block[0], text: block[1].trim(), display: true } satisfies MathToken
    }
    // 여는 `$` 뒤와 닫는 `$` 앞에는 공백이 올 수 없습니다. 금액 표기가 수식으로 잡히지 않게.
    const inline = /^\$(?![\s$])((?:\\.|[^$\\])+?)(?<![\s\\])\$(?!\d)/.exec(src)
    if (!inline) return undefined
    return { type: 'mathInline', raw: inline[0], text: inline[1], display: false } satisfies MathToken
  },
  renderer(token) {
    const { text, display } = token as MathToken
    return renderMath(text, display)
  },
}

/* ------------------------------------------------------------------ */
/* 무거운 기능은 필요할 때만 불러옵니다                                  */
/* ------------------------------------------------------------------ */

type Highlighter = {
  highlight: (code: string, options: { language: string; ignoreIllegals?: boolean }) => { value: string }
  getLanguage: (name: string) => unknown
}

let highlighter: Highlighter | null = null
const inFlight = new Map<string, Promise<void>>()

function once(key: string, load: () => Promise<void>): Promise<void> {
  const existing = inFlight.get(key)
  if (existing) return existing
  const job = load().catch((error) => {
    // 실패하면 다음 렌더에서 다시 시도할 수 있게 비웁니다.
    inFlight.delete(key)
    console.warn(`[t-WiKi] ${key} 를 불러오지 못했습니다`, error)
  })
  inFlight.set(key, job)
  return job
}

const loadHighlighter = () =>
  once('highlight.js', async () => {
    const module = await import('highlight.js/lib/common')
    highlighter = module.default as unknown as Highlighter
  })

const loadKatex = () =>
  once('katex', async () => {
    const [module] = await Promise.all([
      import('katex'),
      import('katex/dist/katex.min.css'),
    ])
    katex = module.default as unknown as Katex
  })

const loadFootnotes = () =>
  once('footnotes', async () => {
    const { default: markedFootnote } = await import('marked-footnote')
    marked.use(markedFootnote({ refMarkers: true }))
  })

const HAS_FENCE = /^[ \t]*(```|~~~)/m
const HAS_MATH = /\$\$[\s\S]+?\$\$|(?<![\\$])\$[^\s$][^\n$]*\$/
const HAS_FOOTNOTE = /\[\^[^\]\s]+\]/

async function ensureFeatures(markdown: string): Promise<void> {
  const jobs: Promise<void>[] = []
  if (HAS_FENCE.test(markdown)) jobs.push(loadHighlighter())
  if (HAS_MATH.test(markdown)) jobs.push(loadKatex())
  if (HAS_FOOTNOTE.test(markdown)) jobs.push(loadFootnotes())
  await Promise.all(jobs)
}

/** 문서 바깥에서도 같은 하이라이팅을 쓰기 위해 내보냅니다(첨부 미리보기). */
export async function highlightCode(code: string, language: string): Promise<string> {
  await loadHighlighter()
  if (!highlighter || !highlighter.getLanguage(language)) return escapeHtml(code)
  return highlighter.highlight(code, { language, ignoreIllegals: true }).value
}

/* ------------------------------------------------------------------ */
/* marked 인스턴스                                                      */
/* ------------------------------------------------------------------ */

const marked = new Marked({ gfm: true, breaks: false })

marked.use({
  extensions: [embedExtension, wikilinkExtension, calloutExtension, mathBlockExtension, mathInlineExtension],
  renderer: {
    heading(token) {
      const text = this.parser.parseInline(token.tokens)
      const plain = token.text.replace(/<[^>]+>/g, '')
      const id = slugify(plain, currentSlugs)
      return `<h${token.depth} id="${escapeHtml(id)}">${text}<a class="anchor" href="#${escapeHtml(id)}" aria-label="이 절로 가는 링크">#</a></h${token.depth}>`
    },

    /*
     * 할 일 네모. marked 는 기본으로 disabled 를 달아 내놓습니다.
     *
     * 눌러도 아무 일이 없는 네모를 그려 둘 까닭이 없습니다. 여기서는 눌러서 켜고
     * 끄고, 그 자리를 원문에서도 [ ] ↔ [x] 로 바꿔 씁니다(toggleTask).
     */
    checkbox({ checked }: Tokens.Checkbox) {
      return `<input type="checkbox" class="task-check"${checked ? ' checked' : ''}>`
    },

    code(token) {
      const language = (token.lang ?? '').trim().split(/\s+/)[0]

      // 다이어그램은 코드로 칠하지 않고 원문만 남깁니다. 실제 렌더는 Preview 에서 합니다.
      // 여러 줄짜리 값은 속성에 담으면 살균 과정에서 통째로 떨어져 나가고,
      // 텍스트로 두면 엔진을 불러오기 전이나 실패했을 때 원문이 그대로 보입니다.
      if (language === 'mermaid') {
        return `<div class="mermaid-block"><pre class="mermaid-source">${escapeHtml(token.text)}</pre></div>`
      }

      const canHighlight = highlighter !== null && language !== '' && highlighter.getLanguage(language)
      const body = canHighlight
        ? highlighter!.highlight(token.text, { language, ignoreIllegals: true }).value
        : escapeHtml(token.text)

      const className = language ? `hljs language-${escapeHtml(language)}` : 'hljs'
      const label = language ? `<span class="code-lang">${escapeHtml(language)}</span>` : ''
      return `<pre>${label}<code class="${className}">${body}</code></pre>`
    },

    image(token) {
      const href = token.href ?? ''
      const alt = escapeHtml(token.text ?? '')
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''

      // 볼트 안 상대경로는 Preview 가 blob URL 로 바꿔 줍니다.
      const isExternal = /^(https?:|data:|blob:)/i.test(href)
      return isExternal
        ? `<img src="${escapeHtml(href)}" alt="${alt}"${title} />`
        : `<img data-vault-src="${escapeHtml(decodePath(href))}" alt="${alt}"${title} />`
    },
  },
})

/**
 * 주소에 쓰인 %  자리를 되돌립니다.
 *
 * `decodeURIComponent` 는 `%` 하나만 있어도 던집니다. 그러면 문서 한 줄 때문에
 * 렌더가 통째로 멈추고 미리보기가 빈 채로 남습니다. 되돌릴 수 없는 글자는
 * 적힌 그대로 두는 편이 낫습니다.
 */
function decodePath(href: string): string {
  try {
    return decodeURIComponent(href)
  } catch {
    return href
  }
}

// 외부 링크는 새 탭에서 열되 opener 를 넘겨주지 않도록 후처리합니다.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof HTMLAnchorElement && node.getAttribute('href')?.startsWith('http')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/*
 * 문서 안의 <style> 은 걷어냅니다.
 *
 * 저장소를 같이 쓰는 사람이 넣은 CSS 가 앱 화면을 덮거나 가짜 안내를 그릴 수
 * 있습니다. 밖으로 새 나갈 길은 CSP 가 막지만, 그래도 문서 하나가 앱의 생김새를
 * 바꿔서는 안 됩니다. 인라인 style 속성은 그 요소 안에 갇히므로 그대로 둡니다.
 */
const PURIFY_OPTIONS = {
  // DOMPurify 는 기본으로 <style> 을 살려 둡니다. 여기서는 통째로 걷어냅니다(안의 글도).
  FORBID_TAGS: ['style'],
  ADD_ATTR: ['data-wikilink', 'data-vault-src', 'target', 'rel', 'id', 'align'],
}

export async function renderMarkdown(markdown: string, resolve: LinkResolver): Promise<RenderResult> {
  await ensureFeatures(markdown)

  currentResolver = resolve
  currentSlugs = new Map()

  try {
    const raw = marked.parse(markdown, { async: false }) as string
    return {
      html: DOMPurify.sanitize(raw, PURIFY_OPTIONS),
      hasDiagram: raw.includes('class="mermaid-block"'),
    }
  } finally {
    currentResolver = () => null
  }
}

/* ------------------------------------------------------------------ */
/* 프론트매터                                                           */
/* ------------------------------------------------------------------ */

export interface Frontmatter {
  fields: { key: string; values: string[] }[]
  body: string
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * 문서 맨 앞의 `---` 블록을 메타데이터로 떼어냅니다.
 * 전체 YAML 을 다루지는 않고 `키: 값`, 인라인 배열, `- 항목` 목록만 읽습니다.
 */
export function parseFrontmatter(markdown: string): Frontmatter {
  const match = FRONTMATTER.exec(markdown)
  if (!match) return { fields: [], body: markdown }

  const fields: { key: string; values: string[] }[] = []
  let current: { key: string; values: string[] } | null = null

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue

    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && current) {
      current.values.push(stripQuotes(item[1]))
      continue
    }

    const pair = /^([\w가-힣][\w가-힣\s-]*?)\s*:\s*(.*)$/.exec(line)
    if (!pair) continue

    const value = pair[2].trim()
    const inlineList = /^\[(.*)\]$/.exec(value)
    current = {
      key: pair[1].trim(),
      values: inlineList
        ? inlineList[1].split(',').map((part) => stripQuotes(part.trim())).filter(Boolean)
        : value
          ? [stripQuotes(value)]
          : [],
    }
    fields.push(current)
  }

  return { fields, body: markdown.slice(match[0].length) }
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, '')
}

/** 문서 첫 번째 h1 을 제목으로 씁니다. 없으면 호출한 쪽이 파일명으로 대체합니다. */
export function headingTitle(markdown: string): string | null {
  const match = /^#\s+(.+)$/m.exec(markdown)
  return match ? match[1].trim() : null
}
