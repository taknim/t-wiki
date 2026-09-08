import type { GitHubConfig, SyncLogLine } from '../types'
import { displayPath } from '../lib/paths'
import { commitUrl } from '../lib/github/links'
import { ACTION_LABEL, splitCommitSha } from './syncLabels'

interface LogRowsProps {
  lines: SyncLogLine[]
  /** 이 회차가 남긴 커밋. 줄 끝에 붙은 이름을 그 커밋으로 가는 길로 바꿉니다. */
  commitSha: string | null
  config: GitHubConfig
}

/**
 * 무엇이 오갔는지 한 줄에 하나씩.
 *
 * 결과 창과 지난 기록이 같은 줄을 그립니다. 두 벌로 두면 한쪽만 고치게 됩니다.
 */
export function LogRows({ lines, commitSha, config }: LogRowsProps) {
  const href = commitUrl(config, commitSha)

  return (
    <ul className="plan">
      {lines.map((line, position) => {
        const { text, sha } = splitCommitSha(line.detail, commitSha)
        return (
          <li
            key={`${line.path}-${position}`}
            className={line.status === 'error' ? 'plan-error' : `plan-${line.action}`}
          >
            <span className="plan-action">{ACTION_LABEL[line.action]}</span>
            <span className="plan-path">{displayPath(line.path)}</span>
            {(text || sha) && (
              <span className="plan-reason">
                {text}
                {sha && (
                  <>
                    {text && ' · '}
                    {href ? (
                      <a
                        className="commit-link"
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        data-tip={`${sha.slice(0, 7)} 커밋을 GitHub 에서 새 탭으로 엽니다`}
                      >
                        {sha.slice(0, 7)}
                      </a>
                    ) : (
                      sha.slice(0, 7)
                    )}
                  </>
                )}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
