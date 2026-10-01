import type { GitHubConfig } from '../types'
import type { SyncReport } from '../hooks/useGitHubSync'
import { displayPath } from '../lib/paths'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { FailureNote } from './FailureNote'
import { LogRows } from './LogRows'
import { ACTION_LABEL } from './syncLabels'

interface SyncReportSheetProps {
  report: SyncReport
  config: GitHubConfig
  onClose: () => void
  onConfirm: () => void
  /** 오간 파일을 눌렀을 때. 창을 걷고 그 파일을 엽니다. */
  onOpen: (path: string) => void
  /** 경로 가운데 폴더를 눌렀을 때. 창을 걷고 그 폴더를 엽니다. */
  onOpenDir: (path: string) => void
}

export function SyncReportSheet({
  report, config, onClose, onConfirm, onOpen, onOpenDir,
}: SyncReportSheetProps) {
  // 설정 창 위에 떠 있을 때가 많습니다. Esc 는 위에 있는 이쪽부터 닫습니다.
  useEscapeClose(onClose)

  const failures = report.log.filter((line) => line.status === 'error')
  const changed = report.plan.filter((item) => item.action !== 'skip')

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="동기화 결과">
        <header className="sheet-head">
          <h2>
            {!report.needsConfirm
              ? '동기화 결과'
              : report.confirmReason === 'wipe'
                ? '저장소에서 많이 지우려 합니다'
                : '동기화 대상이 바뀌었습니다'}
          </h2>
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
            {new Date(report.at).toLocaleString('ko-KR')}
            {report.trigger === 'auto' ? ' · 자동 동기화' : ' · 직접 실행'}
            {report.commitSha && ` · 커밋 ${report.commitSha.slice(0, 7)}`}
          </p>

          {report.error && <FailureNote failure={report.failure} message={report.error} />}

          {report.needsConfirm && (
            <div className="callout callout-warning" style={{ marginBottom: 16 }}>
              <p className="callout-title">진행하기 전에 확인해 주세요</p>
              <div className="callout-body">
                {report.confirmReason === 'wipe' ? (
                  <>
                    <p>
                      이 회차는 저장소에서 <strong>{report.removing}건</strong>을 지우려 합니다.
                      저장소에 있던 것의 절반이 넘습니다.
                    </p>
                    <p>
                      지금 폴더에 없는 문서를 <strong>지운 것으로 보고</strong> 저장소에서도
                      걷어내는 중입니다. 이 폴더가 그 저장소를 쓰던 폴더가 맞는지,
                      바깥에서 파일을 옮기거나 지운 적이 없는지 먼저 살펴 주세요.
                    </p>
                    <p>
                      되돌릴 생각이라면 취소하고, 설정에서 <strong>반대쪽에서도 지우기</strong> 를
                      꺼 두면 저장소의 문서는 그대로 두고 이쪽으로 내려받습니다.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      저장소·브랜치·하위 폴더가 이전과 달라, 문서가 올라갈 경로가 바뀌었습니다.
                      아래 목록이 의도한 것인지 보고 결정해 주세요.
                    </p>
                    <p>
                      <strong>커밋(신규)과 내려받기(신규)가 같은 문서에 대해 함께 나타난다면</strong>,
                      같은 내용이 옛 경로와 새 경로 양쪽에 생긴다는 뜻입니다.
                      그럴 때는 취소하고 하위 폴더 설정을 되돌리는 편이 낫습니다.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {!report.error && changed.length === 0 && (
            <p className="panel-empty">양쪽이 이미 같아 아무것도 하지 않았습니다.</p>
          )}

          {report.log.length === 0 && changed.length > 0 && (
            <section className="field">
              <h3>할 일 {changed.length}건</h3>
              <ul className="plan">
                {changed.map((item) => (
                  <li key={item.path} className={`plan-${item.action}`}>
                    <span className="plan-action">{ACTION_LABEL[item.action]}</span>
                    <span className="plan-path">{displayPath(item.path)}</span>
                    <span className="plan-reason">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.needsConfirm && (
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                data-tip="위 목록 그대로 실행합니다"
                onClick={onConfirm}
              >
                이대로 진행
              </button>
              <button type="button" className="btn" data-tip="아무것도 하지 않고 닫습니다" onClick={onClose}>
                취소
              </button>
            </div>
          )}

          {report.log.length > 0 && (
            <section className="field">
              <h3>
                {report.log.length}건 처리
                {failures.length > 0 && ` · 실패 ${failures.length}건`}
              </h3>
              <LogRows
                lines={report.log}
                commitSha={report.commitSha}
                config={config}
                onOpen={onOpen}
                onOpenDir={onOpenDir}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
