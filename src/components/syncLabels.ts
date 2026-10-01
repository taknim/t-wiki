import type { SyncFailure } from '../lib/github/failure'
import type { SyncAction, SyncLogLine } from '../types'

/** 갈래마다 사람이 읽을 이름. 결과 창과 지난 기록이 같은 말을 씁니다. */
export const ACTION_LABEL: Record<SyncAction, string> = {
  'upload-new': '커밋(신규)',
  'upload-update': '커밋(갱신)',
  'download-new': '내려받기(신규)',
  'download-update': '내려받기(갱신)',
  'delete-local': '로컬 삭제',
  'delete-remote': '저장소 삭제',
  conflict: '충돌',
  skip: '변경 없음',
}

/**
 * 한 회차를 한 줄로 줄입니다. 목록에서는 파일 하나하나가 아니라
 * 무엇이 얼마나 오갔는지가 먼저 보여야 합니다.
 */
export function summarizeLog(log: SyncLogLine[]): string {
  const up = log.filter((line) => line.action.startsWith('upload')).length
  const down = log.filter((line) => line.action.startsWith('download')).length
  const gone = log.filter((line) => line.action.startsWith('delete')).length
  const clash = log.filter((line) => line.action === 'conflict').length
  const failed = log.filter((line) => line.status === 'error').length

  const parts: string[] = []
  if (up > 0) parts.push(`올림 ${up}`)
  if (down > 0) parts.push(`내려받음 ${down}`)
  if (gone > 0) parts.push(`지움 ${gone}`)
  if (clash > 0) parts.push(`충돌 ${clash}`)
  if (failed > 0) parts.push(`실패 ${failed}`)
  return parts.join(' · ') || '변화 없음'
}

/**
 * 자취 끝에 붙은 커밋 이름을 떼어 냅니다.
 *
 * 올린 줄에는 `로컬에서 수정 · a3841cc` 처럼 그 회차의 커밋 이름이 글자로 붙어
 * 있습니다(github/sync.ts). 링크로 바꾸려면 떼어 내야 하는데, 아무 여섯 자리나
 * 잘라 내면 까닭에 든 글자를 잘못 집습니다. 그래서 **이 회차의 커밋 이름과
 * 똑같을 때만** 뗍니다.
 */
export function splitCommitSha(
  detail: string | undefined,
  commitSha: string | null,
): { text: string; sha: string | null } {
  const text = detail ?? ''
  if (!commitSha) return { text, sha: null }
  const tail = ` · ${commitSha.slice(0, 7)}`
  return text.endsWith(tail)
    ? { text: text.slice(0, -tail.length), sha: commitSha }
    : { text, sha: null }
}

/**
 * 멈춘 까닭 옆에 덧붙일 사실들.
 *
 * 글만 적어 두면 "Failed to fetch" 처럼 짧은 말에서는 손쓸 데를 못 찾습니다. 받아 온 것이
 * 있으면(응답 코드·어떤 요청이었는지·GitHub 요청 번호) 괄호 안에 모아 적습니다.
 * 없는 것은 적지 않습니다 — 답이 아예 오지 않은 때까지 숫자를 지어내지는 않습니다.
 */
export function failureFacts(failure?: SyncFailure): string {
  if (!failure) return ''
  const facts = [
    failure.status === undefined ? '' : `${failure.status}${failure.statusText ? ` ${failure.statusText}` : ''}`,
    failure.request ?? '',
    failure.requestId ?? '',
  ].filter(Boolean)
  return facts.length > 0 ? `(${facts.join(' · ')})` : ''
}
