import { trashNote } from '../../src/lib/trashAge'
import type { TrashPolicy } from '../../src/lib/saveOptions'

/*
 * 휴지통 줄에 붙는 한 마디만 따로 잽니다.
 *
 * 저절로 비우기를 켜 두었느냐에 따라 **적는 것이 달라집니다** — 켜져 있으면 남은 날,
 * 꺼져 있으면 지난 날. 화면을 띄우지 않고도 가장자리 값들을 촘촘히 훑을 수 있습니다.
 */

let problems = 0
const ok = (name: string) => console.log('  ok  ' + name)
const fail = (name: string, detail: string) => {
  problems++
  console.log('FAIL  ' + name + '\n      ' + detail)
}
const same = (name: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok(name) : fail(name, `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`))

const DAY = 86_400_000
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)
const off: TrashPolicy = { autoPurge: false, days: 30 }
const on: TrashPolicy = { autoPurge: true, days: 30 }

console.log('\n>>> 1. 저절로 비우지 않으면 지난 날을 적는다')
same('오늘 버린 것', trashNote(NOW - 3600_000, NOW, off), '오늘 버림')
same('하루가 지나면', trashNote(NOW - DAY, NOW, off), '버린 지 1일')
same('아흐레가 지나면', trashNote(NOW - 9 * DAY, NOW, off), '버린 지 9일')
// 하루에서 한 시간 모자라면 아직 하루가 아닙니다. 내림으로 셉니다.
same('하루에서 모자라면 오늘', trashNote(NOW - (DAY - 3600_000), NOW, off), '오늘 버림')

console.log('\n>>> 2. 저절로 비우면 남은 날을 적는다')
same('방금 버린 것은 서른 날 뒤', trashNote(NOW, NOW, on), '30일 뒤 자동 삭제')
same('아흐레 지났으면 스물한 날 뒤', trashNote(NOW - 9 * DAY, NOW, on), '21일 뒤 자동 삭제')
/*
 * 올림으로 셉니다. 내림하면 오늘내일 사라질 것이 "0일 뒤" 로 적혀 뜻이 흐려집니다.
 */
same('반나절 남았어도 하루 뒤', trashNote(NOW - (30 * DAY - DAY / 2), NOW, on), '1일 뒤 자동 삭제')

console.log('\n>>> 3. 날이 지난 것은 다음 동기화 때 없어진다')
// 비우는 잣대와 같은 셈입니다(purgeTrashOlderThan): 옮긴 지 날수가 지나면 없앱니다.
same('꼭 그날이 되면', trashNote(NOW - 30 * DAY, NOW, on), '다음 동기화 때 삭제')
same('하루 더 지나도 같은 말', trashNote(NOW - 31 * DAY, NOW, on), '다음 동기화 때 삭제')
// 날수를 바꿔 두면 그 잣대를 따릅니다.
same('이레로 정해 두었으면', trashNote(NOW - 3 * DAY, NOW, { autoPurge: true, days: 7 }), '4일 뒤 자동 삭제')

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
