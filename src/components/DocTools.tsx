import { useEffect, useState } from 'react'
import { InboundIcon, ListIcon, ToBottomIcon, ToTopIcon } from './icons'

interface DocToolsProps {
  /** 목차. 볼 것이 없으면 null. */
  toc: { count: number; open: boolean; onToggle: () => void } | null
  /** 백링크. 마크다운이 아닐 때는 null. */
  backlinks: { count: number; open: boolean; onToggle: () => void } | null
  /** 지금 보고 있는 것. 이것이 바뀌면 굴릴 칸을 다시 찾습니다. */
  path: string
}

/*
 * 굴릴 칸을 찾는 차례.
 *
 * 결과가 있으면 결과를, 없으면 편집기를, 그것도 없으면 첨부 보기를 굴립니다.
 * 나란히 보기에서는 둘 다 굴러가지만, 읽는 쪽이 결과이므로 그쪽을 잡습니다.
 * 칸을 만드는 곳이 넷으로 흩어져 있어 ref 를 넘기는 대신 여기서 찾습니다.
 */
const PANES = ['.preview', '.editor', '.asset-view']

function findPane(): HTMLElement | null {
  for (const one of PANES) {
    const found = document.querySelector<HTMLElement>(`.main ${one}`)
    if (found) return found
  }
  return null
}

/**
 * 본문 오른쪽 아래에 떠 있는 단추들.
 *
 * 목차와 백링크는 아래 표시줄에 있었는데, 긴 글을 읽다 목차를 부르려면 눈이
 * 맨 아래까지 내려가야 했습니다. 글 옆에 두면 읽던 자리에서 손이 닿습니다.
 * 맨 위·맨 아래는 굴릴 것이 있을 때만 나옵니다.
 */
export function DocTools({ toc, backlinks, path }: DocToolsProps) {
  const [rolls, setRolls] = useState(false)

  // 보던 것이 바뀌면 굴림 여부도 새로 재야 합니다. 렌더 중에 비워 둡니다.
  const [shown, setShown] = useState(path)
  if (shown !== path) {
    setShown(path)
    setRolls(false)
  }

  useEffect(() => {
    const pane = findPane()
    if (!pane) return

    // 글이 늘거나 창이 바뀌면 굴릴 수 있는지도 달라집니다. 칸을 지켜봅니다.
    const look = () => setRolls(pane.scrollHeight > pane.clientHeight + 8)

    const watcher = new ResizeObserver(look)
    watcher.observe(pane)
    // 안엣것이 늘어나는 것은 크기 변화로 잡히지 않을 때가 있습니다.
    const inside = new MutationObserver(look)
    inside.observe(pane, { childList: true, subtree: true, characterData: true })

    return () => {
      watcher.disconnect()
      inside.disconnect()
    }
  }, [path])

  const jump = (to: 'top' | 'bottom') => {
    const pane = findPane()
    if (!pane) return
    pane.scrollTo({ top: to === 'top' ? 0 : pane.scrollHeight, behavior: 'smooth' })
  }

  if (!toc && !backlinks && !rolls) return null

  return (
    <div className="doc-tools">
      {toc && (
        <button
          type="button"
          className={toc.open ? 'doc-tool is-open' : 'doc-tool'}
          data-tip="문서 안의 제목 목록을 펼칩니다"
          aria-pressed={toc.open}
          onClick={toc.onToggle}
        >
          <span className="doc-tool-top"><ListIcon />목차</span>
          <span className="doc-tool-count">{toc.count}</span>
        </button>
      )}

      {backlinks && (
        <button
          type="button"
          className={backlinks.open ? 'doc-tool is-open' : 'doc-tool'}
          data-tip="이 문서로 [[링크]] 를 건 다른 문서를 보여 줍니다"
          aria-pressed={backlinks.open}
          onClick={backlinks.onToggle}
        >
          <span className="doc-tool-top"><InboundIcon />백링크</span>
          <span className="doc-tool-count">{backlinks.count}</span>
        </button>
      )}

      {rolls && (
        <>
          <button
            type="button"
            className="doc-tool"
            data-tip="맨 위로 올라갑니다"
            onClick={() => jump('top')}
          >
            <span className="doc-tool-top"><ToTopIcon /></span>
            <span className="doc-tool-label">맨 위</span>
          </button>
          <button
            type="button"
            className="doc-tool"
            data-tip="맨 아래로 내려갑니다"
            onClick={() => jump('bottom')}
          >
            <span className="doc-tool-top"><ToBottomIcon /></span>
            <span className="doc-tool-label">맨 아래</span>
          </button>
        </>
      )}
    </div>
  )
}
