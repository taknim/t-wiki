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

interface SyncReportSheetProps {
  report: SyncReport
  onClose: () => void
  onConfirm: () => void
}

export function SyncReportSheet({ report, onClose, onConfirm }: SyncReportSheetProps) {
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
          <h2>{report.needsConfirm ? '동기화 대상이 바뀌었습니다' : '동기화 결과'}</h2>
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

          {report.needsConfirm && (
            <div className="callout callout-warning" style={{ marginBottom: 16 }}>
              <p className="callout-title">진행하기 전에 확인해 주세요</p>
              <div className="callout-body">
                <p>
                  저장소·브랜치·하위 폴더가 이전과 달라, 문서가 올라갈 경로가 바뀌었습니다.
                  아래 목록이 의도한 것인지 보고 결정해 주세요.
                </p>
                <p>
                  <strong>커밋(신규)과 내려받기(신규)가 같은 문서에 대해 함께 나타난다면</strong>,
                  같은 내용이 옛 경로와 새 경로 양쪽에 생긴다는 뜻입니다.
                  그럴 때는 취소하고 하위 폴더 설정을 되돌리는 편이 낫습니다.
                </p>
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
                    <span className="plan-path">{item.path}</span>
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
