import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { AssetIndex, DocIndex } from '../types'
import { resolveVaultImages } from '../lib/assets'
import { renderDiagrams } from '../lib/diagrams'
import { renderMarkdown } from '../lib/markdown'
import { resolveLink } from '../lib/wikilinks'
import { useTheme } from './themeContext'

interface PreviewProps {
  markdown: string
  index: DocIndex
  assets: AssetIndex
  root: FileSystemDirectoryHandle
  docPath: string
  onOpenLink: (target: string, resolvedPath: string | null) => void
  /** 할 일 네모를 눌렀을 때. 몇 번째 네모인지 넘깁니다. */
  onToggleTask: (index: number) => void
}

/** 타자를 칠 때마다 하이라이팅과 다이어그램을 다시 그리지 않도록 잠깐 기다립니다. */
const RENDER_DELAY = 220

export function Preview({
  markdown, index, assets, root, docPath, onOpenLink, onToggleTask,
}: PreviewProps) {
  const [html, setHtml] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const { settings, isDark, palette } = useTheme()
  // 테마가 바뀌면 다이어그램도 그 색으로 다시 그려야 합니다.
  const diagramTheme = { key: `${settings.theme}:${isDark}`, dark: isDark, palette }

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void renderMarkdown(markdown, (target) => resolveLink(target, index)).then((result) => {
        if (!cancelled) setHtml(result.html)
      })
    }, RENDER_DELAY)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [markdown, index])

  /**
   * 본문을 직접 넣고, 그 위에 이미지와 다이어그램을 채웁니다.
   *
   * dangerouslySetInnerHTML 로 두면 안 됩니다. React 는 렌더할 때마다 새로 만들어지는
   * `{ __html }` 객체를 보고 innerHTML 을 다시 쓰는데, 그러면 우리가 나중에 끼워 넣은
   * SVG 와 blob 이미지가 조용히 지워집니다. 상태는 그대로라 effect 도 다시 돌지 않아
   * 그림이 영영 돌아오지 않습니다. 이 영역은 React 가 아니라 이 effect 가 소유합니다.
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    generation.current += 1
    const mine = generation.current
    container.innerHTML = html

    void (async () => {
      await resolveVaultImages(container, root, docPath, assets)
      if (generation.current !== mine) return
      await renderDiagrams(container, diagramTheme)
    })()
    // diagramTheme 은 매번 새 객체라 key 로만 비교합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, root, docPath, assets, diagramTheme.key])

  // 위키링크는 개수가 많아 각각 핸들러를 다는 대신 컨테이너에서 위임 처리합니다.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    /*
     * 할 일 네모.
     *
     * 몇 번째 네모인지만 세어 넘깁니다. 그린 차례와 원문에 적힌 차례가 같으므로
     * 그 수만으로 원문의 자리를 짚을 수 있습니다.
     * 눌린 대로 먼저 켜졌다 꺼지게 두고(막지 않습니다) 원문은 뒤따라 바뀝니다.
     * 막아 두면 다시 그릴 때까지 눌러도 아무 일이 없는 것처럼 보입니다.
     */
    const box = (event.target as HTMLElement).closest('input.task-check')
    if (box && containerRef.current) {
      const boxes = [...containerRef.current.querySelectorAll('input.task-check')]
      onToggleTask(boxes.indexOf(box))
      return
    }

    const anchor = (event.target as HTMLElement).closest('a[data-wikilink]')
    if (!anchor) return
    event.preventDefault()
    const target = anchor.getAttribute('data-wikilink') ?? ''
    onOpenLink(target, resolveLink(target, index))
  }

  return <div ref={containerRef} className="preview markdown-body" onClick={handleClick} />
}
