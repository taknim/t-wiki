import { useState } from 'react'
import type { GitHubConfig, SyncRun } from '../types'
import { commitsUrl, commitUrl } from '../lib/github/links'
import { MAX_SYNC_HISTORY } from '../lib/store'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { LogRows } from './LogRows'
import { failureFacts, summarizeLog } from './syncLabels'

interface SyncHistorySheetProps {
  runs: SyncRun[]
  config: GitHubConfig
  onClose: () => void
  /** 오간 파일을 눌렀을 때. 창을 걷고 그 파일을 엽니다. */
  onOpen: (path: string) => void
  /** 경로 가운데 폴더를 눌렀을 때. 창을 걷고 그 폴더를 엽니다. */
  onOpenDir: (path: string) => void
}

/** 목록에 백 줄이 늘어서므로 시각은 짧게 적습니다. */
const when = (at: number) =>
  new Date(at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * 지난 동기화 회차들.
 *
 * 한 회차를 눌러야 파일 목록이 펴집니다. 백 건을 한꺼번에 펼쳐 두면
 * 정작 찾으려던 회차가 수천 줄 사이에 묻힙니다.
 */
export function SyncHistorySheet({
  runs, config, onClose, onOpen, onOpenDir,
}: SyncHistorySheetProps) {
  // 설정 창 위에 떠 있습니다. Esc 는 위에 있는 이쪽부터 닫습니다.
  useEscapeClose(onClose)

  const [opened, setOpened] = useState<number | null>(null)
  const [onlyChanged, setOnlyChanged] = useState(false)

  // 자동 동기화를 켜 두면 "변화 없음" 이 목록을 채웁니다. 걸러 볼 수 있게 둡니다.
  const shown = onlyChanged
    ? runs.filter((run) => run.log.length > 0 || run.error !== null)
    : runs
  const listUrl = commitsUrl(config)

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="지난 동기화 결과">
        <header className="sheet-head">
          <h2>지난 동기화 결과</h2>
          <button
            type="button"
            className="btn sheet-close"
            aria-label="닫기"
            data-tip="결과 창을 닫습니다"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="sheet-body">
          <p className="hint" style={{ marginTop: 0 }}>
            이 폴더에서 돈 동기화를 최근 {MAX_SYNC_HISTORY}건까지 남깁니다.
            자동 동기화도 함께 셉니다. 회차를 누르면 무엇이 오갔는지 펴 봅니다.
          </p>

          {runs.length > 0 && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={onlyChanged}
                onChange={(event) => setOnlyChanged(event.target.checked)}
              />
              무언가 오간 회차만 보기
            </label>
          )}

          {shown.length === 0 ? (
            <p className="panel-empty">
              {runs.length === 0
                ? '아직 남은 결과가 없습니다. 한 번 동기화하면 여기에 쌓입니다.'
                : '오간 것이 있는 회차가 없습니다.'}
            </p>
          ) : (
            <ul className="run-list">
              {shown.map((run) => {
                const open = opened === run.at
                const failures = run.log.filter((line) => line.status === 'error').length
                const href = commitUrl(config, run.commitSha)
                return (
                  <li key={run.at} className="run">
                    {/*
                      커밋 이름은 **머리줄 오른쪽 끝에 한 번만** 답니다. 한 회차의 줄은 모두
                      같은 커밋에서 나므로 줄마다 적으면 같은 일곱 글자가 수십 번 되풀이됩니다.
                      펴는 단추 안에 넣지 않은 까닭은, 링크를 누르면 회차가 함께 접혀서입니다.
                    */}
                    <div className="run-head">
                      <button
                        type="button"
                        className="run-open"
                        aria-expanded={open}
                        onClick={() => setOpened(open ? null : run.at)}
                      >
                        <span className="run-when">{when(run.at)}</span>
                        <span className="run-trigger">{run.trigger === 'auto' ? '자동' : '직접'}</span>
                        <span className={run.error || failures > 0 ? 'run-sum is-bad' : 'run-sum'}>
                          {run.error ?? summarizeLog(run.log)}
                        </span>
                      </button>
                      {run.commitSha && (
                        href ? (
                          <a
                            className="commit-link run-commit"
                            href={href}
                            target="_blank"
                            rel="noreferrer noopener"
                            data-tip={`${run.commitSha.slice(0, 7)} 커밋을 GitHub 에서 새 탭으로 엽니다`}
                          >
                            {run.commitSha.slice(0, 7)}
                          </a>
                        ) : (
                          <span className="run-commit">{run.commitSha.slice(0, 7)}</span>
                        )
                      )}
                    </div>

                    {open && (
                      run.log.length === 0 ? (
                        <p className="panel-empty">
                          {run.error ? (
                            <>
                              오간 것 없이 멈췄습니다.{' '}
                              <span className="stopped-why">{run.error}</span>
                              {failureFacts(run.failure) && (
                                <span className="stopped-facts"> {failureFacts(run.failure)}</span>
                              )}
                            </>
                          ) : '양쪽이 이미 같아 아무것도 하지 않았습니다.'}
                        </p>
                      ) : (
                        <>
                          <LogRows
                            lines={run.log}
                            commitSha={run.commitSha}
                            onOpen={onOpen}
                            onOpenDir={onOpenDir}
                          />
                          {run.cut > 0 && (
                            <p className="hint">그 밖에 {run.cut}건은 남기지 않았습니다.</p>
                          )}
                        </>
                      )
                    )}
                  </li>
                )
              })}
            </ul>
          )}

        </div>

        {/*
          저장소 쪽에서 본 자취. 위 목록은 이 브라우저가 돌린 회차만 알지만,
          저장소에는 다른 기기와 다른 사람이 올린 것까지 모두 있습니다.

          목록 아래가 아니라 창 발치에 붙여 둡니다. 백 줄이 쌓이면 목록 끝까지
          굴려 내려가야 닿는 단추가 되어 버립니다.
        */}
        <footer className="sheet-foot">
          {listUrl ? (
            <a
              className="btn"
              href={listUrl}
              target="_blank"
              rel="noreferrer noopener"
              data-tip="GitHub 의 커밋 목록을 새 탭으로 엽니다"
            >
              자세히 보기
            </a>
          ) : (
            <span className="hint" style={{ margin: 0 }}>
              저장소를 정하면 GitHub 의 커밋 목록으로 갈 수 있습니다.
            </span>
          )}
        </footer>
      </div>
    </div>
  )
}
