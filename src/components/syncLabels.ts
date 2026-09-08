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
