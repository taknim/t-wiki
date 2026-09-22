import { useEffect, useState } from 'react'
import { InboundIcon, ListIcon, ToBottomIcon, ToTopIcon } from './icons'

interface DocToolsProps {
  /** 목차. 볼 것이 없으면 null. */
  toc: { count: number; open: boolean; onToggle: () => void } | null
  /** 백링크. 마크다운이 아닐 때는 null. */
  backlinks: { count: number; open: boolean; onToggle: () => void } | null
  /** 지금 보고 있는 것. 이것이 바뀌면 굴림 여부를 새로 잽니다. */
  path: string
}

/*
 * 굴릴 칸을 찾는 차례.
 *
 * 결과가 있으면 결과를, 없으면 편집기를, 그것도 없으면 첨부 보기를 굴립니다.
 * 나란히 보기에서는 둘 다 굴러가지만, 읽는 쪽이 결과이므로 그쪽을 잡습니다.
 * 칸을 만드는 곳이 넷으로 흩어져 있어 ref 를 넘기는 대신 여기서 찾습니다.
 */
/*
 * 본문 바로 아래 칸만 짚습니다(:scope >). 문서 안에 class="editor" 같은 요소가 있어도
 * 그것이 잡히지 않습니다. 문서가 앱의 단추를 엉뚱한 칸에 붙이게 둘 까닭이 없습니다.
 */
const PANES = [
  ':scope > .doc-body > .preview',
  ':scope > .asset-view > .preview',
  ':scope > .doc-body > .editor-frame > .editor',
  ':scope > .asset-view',
]

function findPane(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>('.main')
  if (!main) return null
  for (const one of PANES) {
    const found = main.querySelector<HTMLElement>(one)
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
/** 글에서 띄울 만큼. 굴림대와 아래 표시줄은 이 값에 더해 따로 셉니다. */
const GAP = 24

export function DocTools({ toc, backlinks, path }: DocToolsProps) {
  const [rolls, setRolls] = useState(false)
  /** 오른쪽·아래로 얼마나 띄울지. 굴림대와 아래 표시줄만큼 더해 잽니다. */
  const [gap, setGap] = useState({ right: GAP, bottom: GAP })

  // 보던 것이 바뀌면 굴림 여부도 새로 재야 합니다. 렌더 중에 비워 둡니다.
  const [shown, setShown] = useState(path)
  if (shown !== path) {
    setShown(path)
    setRolls(false)
  }

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.main')
    if (!main) return
    // 아래 함수 선언 안에서는 위의 null 검사가 잊히므로 이름을 하나 더 둡니다.
    const box: HTMLElement = main

    /*
     * 굴릴 칸은 그때그때 갈아 끼워집니다.
     *
     * 보기 모드를 바꾸면 결과 칸이 사라지고 편집기가 서고, 워드·엑셀은 벌을
     * 내려받아 그린 뒤에야 결과 칸이 생깁니다. 한 번 잡아 둔 칸을 붙들고 있으면
     * 그 칸이 헐린 뒤로는 아무것도 재지 못해 단추가 사라진 채로 남습니다.
     * 그래서 잴 때마다 칸을 다시 찾고, 바뀌었으면 지켜보는 대상도 옮깁니다.
     */
    function look() {
      const pane = findPane()
      if (pane !== watched) {
        if (watched) sizes.unobserve(watched)
        if (pane) sizes.observe(pane)
        watched = pane
      }

      setRolls(pane !== null && pane.scrollHeight > pane.clientHeight + 8)

      /*
       * 오른쪽·아래로 얼마나 띄울지.
       *
       * 굴림대가 자리를 차지하는 기계에서는 오른쪽 여백이 그만큼 깎여 단추가
       * 굴림대에 달라붙습니다. 눈에 보이는 틈을 같게 하려면 굴림대 너비를 재서
       * 더해야 합니다. 아래도 표시줄 높이만큼 더합니다.
       */
      const dock = box.querySelector(':scope > .info-dock')?.getBoundingClientRect().height ?? 0
      const next = {
        right: GAP + (pane ? pane.offsetWidth - pane.clientWidth : 0),
        bottom: GAP + dock,
      }
      // 같은 값을 새 꾸러미로 담아 돌려주면 다시 그려지고, 그것이 또 알림을 부릅니다.
      setGap((now) => (now.right === next.right && now.bottom === next.bottom ? now : next))
    }

    let watched: HTMLElement | null = null
    const sizes = new ResizeObserver(look)
    // 칸이 갈아 끼워지는 것은 크기 변화로 잡히지 않습니다. 본문 아래를 통째로 지켜봅니다.
    const inside = new MutationObserver(look)
    inside.observe(main, { childList: true, subtree: true, characterData: true })
    look()

    return () => {
      sizes.disconnect()
      inside.disconnect()
    }
  }, [])

  const jump = (to: 'top' | 'bottom') => {
    const pane = findPane()
    if (!pane) return
    pane.scrollTo({ top: to === 'top' ? 0 : pane.scrollHeight, behavior: 'smooth' })
  }

  if (!toc && !backlinks && !rolls) return null

  return (
    <div
      className="doc-tools"
      style={{ insetInlineEnd: gap.right, insetBlockEnd: gap.bottom }}
    >
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
