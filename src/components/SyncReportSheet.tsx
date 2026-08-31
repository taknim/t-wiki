import type { SyncPlanItem } from '../types'
import type { SyncReport } from '../hooks/useGitHubSync'

const ACTION_LABEL: Record<SyncPlanItem['action'], string> = {
  'upload-new': '커밋(신규)',
  'upload-update': '커밋(갱신)',
  'download-new': '내려받기(신규)',
  'download-update': '내려받기(갱신)',
  'delete-local': '로컬 삭제',
  'delete-remote': '저장소 삭제',
  conflict: '충돌',
  skip: '변경 없음',
}

export function SyncReportSheet({ report, onClose }: { report: SyncReport; onClose: () => void }) {
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
          <h2>동기화 결과</h2>
          <button type="button" className="btn" data-tip="결과 창을 닫습니다" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="sheet-body">
          <p className="hint" style={{ marginTop: 0 }}>
            {new Date(report.at).toLocaleString('ko-KR')}
            {report.trigger === 'auto' ? ' · 자동 동기화' : ' · 직접 실행'}
            {report.commitSha && ` · 커밋 ${report.commitSha.slice(0, 7)}`}
          </p>

          {report.error && <p className="status status-error">{report.error}</p>}

          {!report.error && changed.length === 0 && (
            <p className="panel-empty">양쪽이 이미 같아 아무것도 하지 않았습니다.</p>
          )}

          {report.log.length > 0 && (
            <section className="field">
              <h3>
                {report.log.length}건 처리
                {failures.length > 0 && ` · 실패 ${failures.length}건`}
              </h3>
              <ul className="plan">
                {report.log.map((line, position) => (
                  <li
                    key={`${line.path}-${position}`}
                    className={line.status === 'error' ? 'plan-error' : `plan-${line.action}`}
                  >
                    <span className="plan-action">{ACTION_LABEL[line.action]}</span>
                    <span className="plan-path">{line.path}</span>
                    <span className="plan-reason">{line.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
