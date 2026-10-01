import type { SyncFailure } from '../lib/github/failure'

/**
 * 동기화가 멈춘 까닭.
 *
 * "오간 것 없이 멈췄습니다" 한 줄만 적어 두었더니 멈춘 것인지 할 일이 없었던 것인지
 * 가릴 수 없었고, 글자도 흐린 색이라 문제로 읽히지 않았습니다. 멈춘 회차에서는
 * **왜 멈췄는지를 위험한 낯으로** 적고, 받아 온 것(상태 코드·요청한 자리·요청 번호)을
 * 함께 보입니다. 그것들이 있어야 토큰 문제인지 이름이 틀린 것인지 가릴 수 있습니다.
 */
export function FailureNote({ failure, message }: { failure?: SyncFailure; message: string }) {
  const detail = failure ?? { message }
  return (
    <div className="failure">
      <p className="failure-head">멈춘 까닭</p>
      <p className="failure-why">{detail.message}</p>
      {detail.hint && <p className="failure-hint">{detail.hint}</p>}
      {(detail.status !== undefined || detail.request || detail.requestId) && (
        <dl className="failure-facts">
          {detail.status !== undefined && (
            <>
              <dt>응답 코드</dt>
              <dd>{detail.status}{detail.statusText ? ` ${detail.statusText}` : ''}</dd>
            </>
          )}
          {detail.request && (
            <>
              <dt>요청</dt>
              <dd className="failure-mono">{detail.request}</dd>
            </>
          )}
          {detail.requestId && (
            <>
              <dt>요청 번호</dt>
              {/* GitHub 에 물을 때 이 번호 하나면 그 요청을 찾아 줍니다. */}
              <dd className="failure-mono">{detail.requestId}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  )
}
