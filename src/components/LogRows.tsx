import { Fragment } from 'react'
import type { SyncLogLine } from '../types'
import { ACTION_LABEL, splitCommitSha } from './syncLabels'

interface LogRowsProps {
  lines: SyncLogLine[]
  /**
   * 이 회차가 남긴 커밋. 줄 끝에 붙은 그 이름을 **떼어 냅니다.**
   *
   * 한 회차의 줄은 모두 같은 커밋에서 났으므로 줄마다 적으면 같은 일곱 글자가
   * 수십 번 되풀이됩니다. 이름은 회차 머리줄(동기화 일시가 있는 줄)에 한 번만 답니다.
   */
  commitSha: string | null
  /** 경로를 눌러 그 파일로 갈 수 있게 합니다. 지운 줄에는 걸지 않습니다. */
  onOpen: (path: string) => void
  /** 경로 가운데 폴더 이름을 눌렀을 때. 지운 줄에도 겁니다. 담고 있던 폴더는 남아 있습니다. */
  onOpenDir: (path: string) => void
}

/** 지운 줄인지. 지운 파일은 열 것이 없습니다. */
const isGone = (action: SyncLogLine['action']) =>
  action === 'delete-local' || action === 'delete-remote'

/**
 * 경로를 마디마디 눌리는 자리로 나눕니다.
 *
 * 한 덩어리로 두면 파일까지 가야만 갈 수 있습니다. 문서가 어디에 놓였는지
 * 보러 갈 때가 더 잦은데, 그때마다 트리를 처음부터 펴 내려가야 했습니다.
 */
function PathTrail({
  path, openable, onOpen, onOpenDir,
}: {
  path: string
  openable: boolean
  onOpen: (path: string) => void
  onOpenDir: (path: string) => void
}) {
  const segments = path.split('/').filter(Boolean)
  const name = segments.pop() ?? path

  return (
    <span className="plan-path">
      {segments.map((segment, at) => {
        // 그 마디까지의 경로가 곧 그 폴더입니다.
        const dir = segments.slice(0, at + 1).join('/')
        return (
          <Fragment key={dir}>
            <span className="plan-sep">/</span>
            <button
              type="button"
              className="plan-open"
              data-tip={`"${segment}" 폴더를 엽니다`}
              onClick={() => onOpenDir(dir)}
            >
              {segment}
            </button>
          </Fragment>
        )
      })}
      <span className="plan-sep">/</span>
      {openable ? (
        <button
          type="button"
          className="plan-open"
          data-tip="이 파일을 엽니다"
          onClick={() => onOpen(path)}
        >
          {name}
        </button>
      ) : (
        name
      )}
    </span>
  )
}

/**
 * 무엇이 오갔는지 한 줄에 하나씩.
 *
 * 결과 창과 지난 기록이 같은 줄을 그립니다. 두 벌로 두면 한쪽만 고치게 됩니다.
 */
export function LogRows({ lines, commitSha, onOpen, onOpenDir }: LogRowsProps) {
  return (
    <ul className="plan">
      {lines.map((line, position) => {
        // 커밋 이름은 떼어 버립니다(머리줄에 한 번 적힙니다). 남는 것은 까닭뿐입니다.
        const { text } = splitCommitSha(line.detail, commitSha)
        return (
          <li
            key={`${line.path}-${position}`}
            className={line.status === 'error' ? 'plan-error' : `plan-${line.action}`}
          >
            <span className="plan-action">{ACTION_LABEL[line.action]}</span>
            <PathTrail
              path={line.path}
              openable={!isGone(line.action)}
              onOpen={onOpen}
              onOpenDir={onOpenDir}
            />
            {text && <span className="plan-reason">{text}</span>}
          </li>
        )
      })}
    </ul>
  )
}
