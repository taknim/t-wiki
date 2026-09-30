import type { TrashPolicy } from './saveOptions'

/*
 * 휴지통에 든 것이 언제까지 남아 있을지를 한 마디로 적습니다.
 *
 * 옆에 적힌 날짜만으로는 "이게 오래된 건가" 를 머릿속에서 빼 봐야 알 수 있고,
 * 저절로 비우기를 켜 둔 사람은 **언제 사라지는지**를 알아야 복원할지 말지 정할 수 있습니다.
 */

const DAY = 86_400_000

/**
 * 줄마다 붙는 한 마디.
 *
 * 저절로 비우기가 **켜져 있으면 남은 날**을, **꺼져 있으면 지난 날**을 적습니다.
 * 켜져 있을 때 지난 날을 적으면 옆의 날짜에서 이미 어림할 수 있는 값을 되풀이하는 셈이고,
 * 꺼져 있을 때 남은 날을 적으면 오지 않을 날을 약속하는 것이 됩니다.
 *
 * 비우는 일은 **동기화가 돌 때** 일어나므로, 날이 지난 것은 며칠이 지났든
 * "다음 동기화 때" 라고 적습니다. 동기화를 쓰지 않는 사람에게는 영영 오지 않는 때이지만,
 * 그 사람은 저절로 비우기를 켤 까닭도 없습니다.
 */
export function trashNote(trashedAt: number, now: number, policy: TrashPolicy): string {
  if (!policy.autoPurge) {
    const passed = Math.floor((now - trashedAt) / DAY)
    return passed <= 0 ? '오늘 버림' : `버린 지 ${passed}일`
  }
  // 비우는 잣대와 같은 셈입니다(`purgeTrashOlderThan`): 옮긴 지 날수가 **지나면** 없앱니다.
  const dueAt = trashedAt + policy.days * DAY
  if (now >= dueAt) return '다음 동기화 때 삭제'
  // 올림으로 셉니다. 내림하면 오늘내일 사라질 것이 "0일 뒤" 로 적혀 뜻이 흐려집니다.
  return `${Math.ceil((dueAt - now) / DAY)}일 뒤 자동 삭제`
}
