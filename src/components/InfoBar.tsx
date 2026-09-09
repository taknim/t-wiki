import { useState } from 'react'
import type { DocIndex } from '../types'
import type { Heading } from '../lib/markdown'
import { formatBytes } from '../lib/attachments'
import { Backlinks } from './Backlinks'
import { Toc } from './Toc'
import { displayPath } from '../lib/paths'

/** 첨부는 이미지와 그 밖의 문서로 나눠 표시합니다. */
export type SelectionKind = 'markdown' | 'image' | 'document' | 'dir'

export interface SelectionInfo {
  kind: SelectionKind
  path: string
  name: string
  size: number
  lastModified: number | null
  /** 폴더일 때만: 안에 든 파일 수. */
  fileCount?: number
}

interface InfoBarProps {
  info: SelectionInfo
  headings: Heading[]
  index: DocIndex
  showToc: boolean
  onOpen: (path: string) => void
  /** 지금 열어 둔 폴더 이름. 경로 앞에 세워 어느 볼트의 것인지 밝힙니다. */
  vaultName: string
  /** 알림 한 줄. 경로를 베낀 뒤 알려 줍니다. */
  onNotice: (message: string) => void
}

const KIND_LABEL: Record<SelectionKind, string> = {
  markdown: '마크다운',
  image: '이미지',
  document: '문서',
  dir: '폴더',
}

type Panel = 'toc' | 'backlinks' | null

export function InfoBar({
  info, headings, index, showToc, onOpen, vaultName, onNotice,
}: InfoBarProps) {
  const [panel, setPanel] = useState<Panel>(null)

  const backlinkCount = info.kind === 'markdown' ? countBacklinks(info.path, index) : 0
  const tocAvailable = showToc && info.kind === 'markdown' && headings.length >= 2
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next))

  /*
   * 열어 둔 폴더 이름까지 붙인 경로.
   *
   * 볼트 안 경로만 보여 주면 폴더를 여럿 오갈 때 어느 쪽 것인지 알 수 없습니다.
   * 디스크의 절대 경로까지는 붙일 수 없습니다. 브라우저가 폴더 손잡이에 그 값을
   * 내주지 않습니다. 우리가 아는 가장 바깥이 이 폴더 이름입니다.
   */
  const fullPath = `${vaultName}${displayPath(info.path)}`

  const copyPath = async () => {
    const what = info.kind === 'dir' ? '폴더' : '파일'
    try {
      await navigator.clipboard.writeText(fullPath)
      onNotice(`${what} 경로를 클립보드에 복사했습니다.`)
    } catch {
      // 권한이 막혀 있거나 안전한 자리가 아니면 베낄 수 없습니다. 그대로 알립니다.
      onNotice(`${what} 경로를 복사하지 못했습니다.`)
    }
  }

  return (
    <div className="info-dock">
      {panel === 'toc' && (
        <div className="info-panel">
          <Toc headings={headings} />
        </div>
      )}
      {panel === 'backlinks' && (
        <div className="info-panel">
          <p className="toc-head">이 문서를 가리키는 문서</p>
          <Backlinks path={info.path} index={index} onOpen={onOpen} />
        </div>
      )}

      <div className="info-bar">
        <span
          className={`info-kind info-kind-${info.kind}`}
          data-tip={`고른 것의 갈래 · ${KIND_LABEL[info.kind]}`}
        >
          {KIND_LABEL[info.kind]}
        </span>
        {/* 눌러서 베낍니다. 긴 경로를 손으로 골라 잡는 것은 번거롭습니다. */}
        <button
          type="button"
          className="info-path"
          title={fullPath}
          data-tip="눌러서 경로를 클립보드에 복사합니다"
          onClick={() => void copyPath()}
        >
          {fullPath}
        </button>

        <span className="info-sep" />

        {/*
          숫자만 놓여 있으면 무엇을 센 것인지 알 수 없습니다. 손을 얹으면 말로 밝힙니다.
          크기는 반올림해 보여 주므로, 안내에는 바이트 그대로도 함께 적습니다.
        */}
        {info.kind === 'dir' ? (
          <>
            <span className="info-meta" data-tip="이 폴더 아래에 있는 파일 수입니다. 하위 폴더까지 셉니다">
              파일 {info.fileCount ?? 0}개
            </span>
            <span
              className="info-meta"
              data-tip={`폴더 크기 · 이 폴더 아래 파일을 모두 더해 ${info.size.toLocaleString('ko-KR')}바이트입니다`}
            >
              {formatBytes(info.size)}
            </span>
          </>
        ) : (
          <span
            className="info-meta"
            data-tip={`파일 크기 · ${info.size.toLocaleString('ko-KR')}바이트`}
          >
            {formatBytes(info.size)}
          </span>
        )}

        {info.lastModified !== null && (
          <span
            className="info-meta"
            /*
             * 만든 시각은 적을 수 없습니다. 브라우저가 파일에서 내주는 시각은
             * 마지막으로 고친 때 하나뿐입니다. 헷갈리지 않도록 그렇게 밝힙니다.
             */
            data-tip={`마지막으로 고친 시각 · ${new Date(info.lastModified).toLocaleString('ko-KR', {
              dateStyle: 'full', timeStyle: 'medium',
            })}`}
          >
            {new Date(info.lastModified).toLocaleString('ko-KR', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        )}

        {tocAvailable && (
          <button
            type="button"
            className={panel === 'toc' ? 'info-toggle is-open' : 'info-toggle'}
            data-tip="문서 안의 제목 목록을 펼칩니다"
            onClick={() => toggle('toc')}
          >
            목차 {headings.length}
          </button>
        )}

        {info.kind === 'markdown' && (
          <button
            type="button"
            className={panel === 'backlinks' ? 'info-toggle is-open' : 'info-toggle'}
            data-tip="이 문서로 [[링크]] 를 건 다른 문서를 보여 줍니다"
            onClick={() => toggle('backlinks')}
          >
            백링크 {backlinkCount}
          </button>
        )}
      </div>
    </div>
  )
}

/** 목록을 만들지 않고 개수만 셉니다. 표시줄에는 숫자만 필요합니다. */
function countBacklinks(path: string, index: DocIndex): number {
  const WIKILINK = /\[\[([^\][|]+)(?:\|[^\]]+)?\]\]/g
  const target = (path.split('/').pop() ?? path).replace(/\.md$/i, '').toLowerCase()

  let count = 0
  for (const entry of index.values()) {
    if (entry.path === path) continue
    for (const match of entry.content.matchAll(WIKILINK)) {
      const name = match[1].trim().split('/').pop() ?? ''
      if (name.replace(/\.md$/i, '').toLowerCase() === target) {
        count += 1
        break
      }
    }
  }
  return count
}
