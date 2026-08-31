import { useState } from 'react'
import type { DocIndex } from '../types'
import type { Heading } from '../lib/markdown'
import { formatBytes } from '../lib/attachments'
import { Backlinks } from './Backlinks'
import { Toc } from './Toc'

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
}

const KIND_LABEL: Record<SelectionKind, string> = {
  markdown: '마크다운',
  image: '이미지',
  document: '문서',
  dir: '폴더',
}

type Panel = 'toc' | 'backlinks' | null

export function InfoBar({ info, headings, index, showToc, onOpen }: InfoBarProps) {
  const [panel, setPanel] = useState<Panel>(null)

  const backlinkCount = info.kind === 'markdown' ? countBacklinks(info.path, index) : 0
  const tocAvailable = showToc && info.kind === 'markdown' && headings.length >= 2
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next))

  // 최상위 폴더는 경로가 비어 있으므로 폴더 이름을 씁니다.
  const fullPath = info.path || info.name

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
        <span className={`info-kind info-kind-${info.kind}`}>{KIND_LABEL[info.kind]}</span>
        <span className="info-path" title={fullPath}>
          {fullPath}
        </span>

        <span className="info-sep" />

        {info.kind === 'dir' ? (
          <span className="info-meta">
            파일 {info.fileCount ?? 0}개 · {formatBytes(info.size)}
          </span>
        ) : (
          <span className="info-meta">{formatBytes(info.size)}</span>
        )}

        {info.lastModified !== null && (
          <span className="info-meta">
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
