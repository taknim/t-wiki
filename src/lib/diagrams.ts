import DOMPurify from 'dompurify'
import type { Palette } from './theme'

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, source: string) => Promise<{ svg: string }>
}

let mermaid: MermaidApi | null = null
let loading: Promise<MermaidApi> | null = null
let appliedTheme: string | null = null
let sequence = 0

export interface DiagramTheme {
  /** 같은 테마면 다시 초기화하지 않기 위한 식별자. */
  key: string
  dark: boolean
  palette: Palette
}

/** mermaid 는 번들이 크므로 다이어그램이 실제로 있는 문서에서만 불러옵니다. */
async function ensureMermaid(theme: DiagramTheme): Promise<MermaidApi> {
  if (!loading) {
    loading = import('mermaid').then((module) => {
      mermaid = module.default as unknown as MermaidApi
      return mermaid
    })
  }
  const api = await loading

  if (appliedTheme !== theme.key) {
    const { palette } = theme
    api.initialize({
      startOnLoad: false,
      // 내장 테마 대신 base 를 쓰고 색을 직접 넘겨야 앱 테마와 어긋나지 않습니다.
      theme: 'base',
      themeVariables: {
        darkMode: theme.dark,
        background: palette.bgSunken,
        primaryColor: palette.accentSoft,
        primaryTextColor: palette.text,
        primaryBorderColor: palette.accent,
        secondaryColor: palette.bgRaised,
        tertiaryColor: palette.bgSunken,
        lineColor: palette.textMuted,
        textColor: palette.text,
        mainBkg: palette.accentSoft,
        nodeBorder: palette.accent,
        clusterBkg: palette.bgSunken,
        clusterBorder: palette.border,
        titleColor: palette.text,
        edgeLabelBackground: palette.bgRaised,
fontSize: '15px',
      },
      // 문서 내용이 그대로 다이어그램이 되므로 라벨의 HTML 을 신뢰하지 않습니다.
      securityLevel: 'strict',
      fontFamily: 'inherit',
      // 기본값인 foreignObject 안 HTML 라벨은 SVG 살균 과정에서 떨어져 나가
      // 도형만 남고 글자가 사라집니다. SVG text 로 그리면 그대로 살아남습니다.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
    })
    appliedTheme = theme.key
  }
  return api
}

const SVG_OPTIONS = {
  ADD_TAGS: ['style', 'foreignObject'],
  ADD_ATTR: ['dominant-baseline', 'transform-origin'],
}

/**
 * 미리보기 안의 mermaid 블록을 SVG 로 바꿉니다.
 * 원문 <pre> 는 그대로 두고 그림만 옆에 채워 넣습니다.
 * 그래야 테마가 바뀌었을 때 같은 원문으로 다시 그릴 수 있습니다.
 */
export async function renderDiagrams(container: HTMLElement, theme: DiagramTheme): Promise<void> {
  const blocks = [...container.querySelectorAll<HTMLElement>('.mermaid-block')]
  const pending = blocks.filter((block) => block.dataset.rendered !== theme.key)
  if (pending.length === 0) return

  let api: MermaidApi
  try {
    api = await ensureMermaid(theme)
  } catch (error) {
    for (const block of pending) showError(block, '다이어그램 엔진을 불러오지 못했습니다', error)
    return
  }

  for (const block of pending) {
    const source = block.querySelector('.mermaid-source')?.textContent ?? ''
    if (!source.trim()) continue

    try {
      sequence += 1
      const { svg } = await api.render(`mdwiki-diagram-${sequence}`, source)
      figureOf(block).innerHTML = DOMPurify.sanitize(svg, SVG_OPTIONS)
      block.querySelector('.diagram-error')?.remove()
      block.classList.remove('is-error')
      block.dataset.rendered = theme.key
    } catch (error) {
      showError(block, '다이어그램 문법 오류', error)
    }
  }
}

/** SVG 를 담을 자리. 없으면 만들어 붙입니다. */
function figureOf(block: HTMLElement): HTMLElement {
  const existing = block.querySelector<HTMLElement>('.mermaid-figure')
  if (existing) return existing

  const figure = document.createElement('div')
  figure.className = 'mermaid-figure'
  block.append(figure)
  return figure
}

function showError(block: HTMLElement, headline: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error)

  // 원문은 남겨 두고 오류만 위에 붙입니다. 무엇이 잘못됐는지 바로 고칠 수 있게.
  block.querySelector('.diagram-error')?.remove()
  const notice = document.createElement('p')
  notice.className = 'diagram-error'
  notice.textContent = `${headline}: ${detail}`
  block.prepend(notice)

  block.querySelector('.mermaid-figure')?.remove()
  block.classList.add('is-error')
  block.dataset.rendered = 'error'
}
