import { BIG_TEXT_BYTES, BIG_TEXT_LINES, countLines, isBigText } from '../../src/lib/bigText'
import { MAX_ATTACHMENT_BYTES } from '../../src/lib/attachments'

/*
 * 대용량으로 볼지 가리는 셈만 따로 잽니다.
 */

let problems = 0
const ok = (name: string) => console.log('  ok  ' + name)
const fail = (name: string, detail: string) => {
  problems++
  console.log('FAIL  ' + name + '\n      ' + detail)
}
const expect = (name: string, condition: boolean, detail = '') => (condition ? ok(name) : fail(name, detail))
const same = (name: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok(name) : fail(name, `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`))

console.log('\n>>> 1. 자는 올리기 상한과 같다')
same('5MB', BIG_TEXT_BYTES, MAX_ATTACHMENT_BYTES)
same('5MB 는 5 * 1024 * 1024', BIG_TEXT_BYTES, 5 * 1024 * 1024)
same('줄은 4000', BIG_TEXT_LINES, 4000)

console.log('\n>>> 2. 줄은 자를 넘으면 더 세지 않는다')
same('빈 글도 한 줄', countLines('', 10), 1)
same('줄바꿈이 없으면 한 줄', countLines('한 줄입니다', 10), 1)
same('줄바꿈 수 + 1', countLines('가\n나\n다', 10), 3)
// 자를 넘으면 거기서 멈춥니다. 40MB 를 끝까지 셀 까닭이 없습니다.
same('자를 넘으면 자 + 1 에서 멈춤', countLines('가\n'.repeat(100_000), 10), 11)

console.log('\n>>> 3. 크기나 줄 수 가운데 하나만 넘어도 대용량이다')
expect('작은 글은 아님', !isBigText(1000, '가\n나'))
expect('크기가 넘으면', isBigText(BIG_TEXT_BYTES + 1, '한 줄'))
same('자와 같으면 아직 아님', isBigText(BIG_TEXT_BYTES, '한 줄'), false)
expect('줄이 넘으면 크기가 작아도', isBigText(1000, '가\n'.repeat(BIG_TEXT_LINES + 1)))
same('줄이 자와 같으면 아직 아님', isBigText(1000, '가\n'.repeat(BIG_TEXT_LINES - 1)), false)

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
