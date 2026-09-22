import { useMemo, useState } from 'react'
import type { DocIndex } from '../types'
import type { Heading } from '../lib/markdown'
import { formatBytes } from '../lib/attachments'
import { Backlinks } from './Backlinks'
import { backlinksFor } from '../lib/wikilinks'
import { DocTools } from './DocTools'
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
  /** 폴더일 때만: 안에 든 항목 수. 하위 폴더와 그 안의 파일까지 셉니다. */
  itemCount?: number
}

interface InfoBarProps {
  info: SelectionInfo
  headings: Heading[]
  index: DocIndex
  onOpen: (path: string) => void
  /** 지금 열어 둔 폴더 이름. 경로 앞에 세워 어느 볼트의 것인지 밝힙니다. */
  vaultName: string
  /** 알림 한 줄. 경로를 베낀 뒤 알려 줍니다. */
  onNotice: (message: string) => void
  /** 편집기 낫표가 선 행·열. 설정을 켰고 편집기가 있을 때만 옵니다. */
  caret?: { line: number; column: number } | null
}

const KIND_LABEL: Record<SelectionKind, string> = {
  markdown: '마크다운',
  image: '이미지',
  document: '문서',
  dir: '폴더',
}

type Panel = 'toc' | 'backlinks' | null

export function InfoBar({
  info, headings, index, onOpen, vaultName, onNotice, caret = null,
}: InfoBarProps) {
  const [panel, setPanel] = useState<Panel>(null)

  /*
   * 백링크는 셈과 목록을 한 자리에서 냅니다.
   *
   * 예전에는 단추에 적을 셈만 따로 세었습니다. 그 셈은 [[링크]] 의 파일명만 맞춰
   * 보았고, 같은 이름이 여러 폴더에 있으면 실제로는 다른 문서를 가리키는 링크까지
   * 제 것으로 세었습니다. 그래서 백링크가 없는 문서에도 큰 수가 적혔습니다.
   * 목록을 짓는 쪽(backlinksFor)은 링크를 실제 문서로 풀어 보므로, 그 결과의
   * 길이를 그대로 씁니다. 적힌 수와 펼친 목록이 어긋날 자리가 없습니다.
   */
  const links = useMemo(
    () => (info.kind === 'markdown' ? backlinksFor(info.path, index) : []),
    [info.kind, info.path, index],
  )
  const tocAvailable = info.kind === 'markdown' && headings.length >= 2
  const backlinksAvailable = info.kind === 'markdown'
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next))

  /*
   * 부를 단추가 사라졌으면 펼쳐 둔 것도 접습니다.
   *
   * 마크다운이 아닌 것을 고르면 목차도 백링크도 부를 단추가 사라집니다. 그런데
   * 펼친 채로 두면 그 칸만 덩그러니 남고, 접을 단추가 없어 닫지도 못했습니다.
   */
  if (panel === 'toc' && !tocAvailable) setPanel(null)
  if (panel === 'backlinks' && !backlinksAvailable) setPanel(null)

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
    <>
      {/* 목차·백링크는 표시줄이 아니라 글 옆에 뜹니다. 읽던 자리에서 손이 닿습니다. */}
      <DocTools
        path={info.path}
        toc={tocAvailable
          ? { count: headings.length, open: panel === 'toc', onToggle: () => toggle('toc') }
          : null}
        backlinks={backlinksAvailable
          ? {
              count: links.length,
              open: panel === 'backlinks',
              onToggle: () => toggle('backlinks'),
            }
          : null}
      />

    <div className="info-dock">
      {panel === 'toc' && (
        <div className="info-panel">
          <Toc headings={headings} />
        </div>
      )}
      {panel === 'backlinks' && (
        <div className="info-panel">
          <p className="toc-head">이 문서를 가리키는 문서</p>
          <Backlinks links={links} onOpen={onOpen} />
        </div>
      )}

      <div className="info-bar">
        <span className={`info-kind info-kind-${info.kind}`} data-tip="고른 것의 갈래">
          {KIND_LABEL[info.kind]}
        </span>
        {/* 눌러서 베낍니다. 긴 경로를 손으로 골라 잡는 것은 번거롭습니다. */}
        <button
          type="button"
          className="info-path"
          title={fullPath}
          data-tip="눌러서 경로 복사"
          onClick={() => void copyPath()}
        >
          {fullPath}
        </button>

        <span className="info-sep" />

        {/*
          숫자만 놓여 있으면 무엇을 센 것인지 알 수 없습니다. 손을 얹으면 말로 밝힙니다.
          말은 짧게 답니다. 손을 얹은 채 긴 문장을 읽고 있을 사람은 없습니다.

          폴더도 파일과 같은 차례(크기 · 시각)로 늘어놓고, 그 앞에 항목 수만 더 답니다.
          고른 것에 따라 자리가 바뀌면 눈이 매번 다시 훑어야 합니다.
        */}
        {info.kind === 'dir' && (
          <span className="info-meta" data-tip="하위 항목 개수">
            항목 {info.itemCount ?? 0}개
          </span>
        )}

        <span className="info-meta" data-tip={info.kind === 'dir' ? '폴더 크기' : '파일 크기'}>
          {formatBytes(info.size)}
        </span>

        {caret && (
          <span className="info-meta info-caret" data-tip="편집기에서 낫표가 선 행과 열">
            {caret.line}행 {caret.column}열
          </span>
        )}

        {info.lastModified !== null && (
          <span
            className="info-meta"
            /*
             * 만든 시각은 적을 수 없습니다. 브라우저가 파일에서 내주는 시각은
             * 마지막으로 고친 때 하나뿐입니다. 헷갈리지 않도록 그렇게 밝힙니다.
             * 폴더는 안에서 가장 최근에 고친 때입니다.
             */
            data-tip="최종 수정일시"
          >
            {new Date(info.lastModified).toLocaleString('ko-KR', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        )}

      </div>
    </div>
    </>
  )
}
