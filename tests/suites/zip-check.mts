import { makeZip } from '../zip-fixture.mjs'
import { decodeName, dosTime, findTail, isZip64, readEntries } from '../../src/lib/zipList'

/*
 * 압축 목차를 읽는 셈만 따로 잽니다.
 *
 * 압축 파일을 손으로 지어 넣으면 한글 이름·UTF-8 깃발 없음·빈 폴더처럼 **가려야 하는
 * 상황을 마음대로 만들 수 있습니다.** 화면을 띄우는 묶음(archive)은 실제로 목록이 그려지는지를 봅니다.
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

/** 지은 압축에서 목차 자리를 찾아 항목을 읽습니다(실제로 쓰는 길과 같은 차례). */
const listOf = (bytes: Uint8Array, limit?: number) => {
  const found = findTail(bytes.subarray(Math.max(0, bytes.length - 66 * 1024)))
  if (!found) throw new Error('목차를 못 찾음')
  return readEntries(bytes.subarray(found.offset, found.offset + found.size), found.count, limit)
}

console.log('\n>>> 1. 목차를 찾아 이름과 크기를 읽는다')
const plain = makeZip([
  { name: '읽어보기.txt', text: '안녕하세요' },
  { name: '자료/', text: '' },
  { name: '자료/표.csv', text: 'id,name\n1,하나\n' },
])
const listed = listOf(plain)
same('항목 수', listed.total, 3)
same('이름 차례', listed.entries.map((one) => one.path), ['읽어보기.txt', '자료/', '자료/표.csv'])
// 한글은 UTF-8 로 담으면 한 자가 세 바이트입니다. 글자 수가 아니라 바이트로 적힙니다.
same('푼 크기', listed.entries[0].bytes, 15)
same('폴더는 빗금으로 가린다', listed.entries.map((one) => one.dir), [false, true, false])
expect('적어 둔 때를 읽음', listed.entries[0].at !== null, String(listed.entries[0].at))
same('자르지 않음', listed.cut, false)

console.log('\n>>> 2. 이름의 글자 꼴을 가린다')
// 깃발이 서 있으면 UTF-8.
same('UTF-8 깃발', decodeName(new TextEncoder().encode('한글.txt'), true), '한글.txt')
// 깃발이 없고 ASCII 뿐이면 그대로.
same('ASCII 는 그대로', decodeName(new TextEncoder().encode('readme.txt'), false), 'readme.txt')
/*
 * 깃발이 없는데 ASCII 를 벗어났으면 우리나라에서 만든 압축으로 보고 EUC-KR 로 읽습니다.
 * 규격의 CP437 로 읽으면 한글 이름이 모두 깨집니다.
 */
same('깃발이 없으면 EUC-KR', decodeName(new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]), false), '한글')
const cp949 = makeZip([{ name: new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb, 0x2e, 0x74, 0x78, 0x74]), utf8: false, text: 'x' }])
same('지은 압축에서도 그대로', listOf(cp949).entries[0].path, '한글.txt')

console.log('\n>>> 3. 적어 둔 때는 MS-DOS 꼴로 들어 있다')
// 1980년을 기준으로 하고 2초 단위입니다. 0 은 "적지 않음" 입니다.
same('비어 있으면 없음', dosTime(0, 0), null)
same('1980년 1월 1일', dosTime((0 << 9) | (1 << 5) | 1, 0), new Date(1980, 0, 1).getTime())
same('2026년 9월 30일 12:30', dosTime(((2026 - 1980) << 9) | (9 << 5) | 30, (12 << 11) | (30 << 5)),
  new Date(2026, 8, 30, 12, 30, 0).getTime())

console.log('\n>>> 3-1. 윈도가 덧붙인 칸에서 지은 때까지 읽는다')
/*
 * 기본 기록에는 지은 때가 없습니다. 윈도에서 만든 압축만 NTFS 칸에 덧붙이므로,
 * 있으면 읽고 없으면 없는 대로 둡니다 — 없는 때를 지어내지 않습니다.
 */
const madeAt = new Date(2026, 0, 2, 3, 4, 5)
const changedAt = new Date(2026, 5, 6, 7, 8, 9)
const stamped = listOf(makeZip([{ name: 'a.txt', text: 'x', ntfs: { modified: changedAt, created: madeAt } }]))
same('지은 때를 읽음', stamped.entries[0].created, madeAt.getTime())
// 덧붙은 칸이 더 촘촘합니다(MS-DOS 꼴은 2초 단위라 홀수 초가 깎입니다).
same('고친 때도 덧붙은 칸에서', stamped.entries[0].at, changedAt.getTime())
same('없는 압축은 비워 둠', listOf(plain).entries[0].created, null)

console.log('\n>>> 4. 너무 많으면 앞부분만 읽고 몇 개인지는 알린다')
const many = makeZip(Array.from({ length: 50 }, (_, i) => ({ name: `파일-${i}.txt`, text: 'x' })))
const trimmed = listOf(many, 10)
same('앞 열 개만', trimmed.entries.length, 10)
same('전체 수는 그대로', trimmed.total, 50)
same('잘랐다고 알림', trimmed.cut, true)

console.log('\n>>> 5. 읽을 수 없는 꼴은 못 읽는다고 말한다')
// 목차가 없으면(조각난 파일·zip 이 아닌 것) 자리를 찾지 못합니다.
same('목차가 없으면 없음', findTail(new TextEncoder().encode('이건 압축이 아닙니다')), null)
// zip64 자리 지킴이가 있으면 우리가 읽을 수 있는 꼴이 아닙니다.
const locator = new Uint8Array(20)
new DataView(locator.buffer).setUint32(0, 0x07064b50, true)
expect('zip64 를 가림', isZip64(locator))
expect('보통 압축은 zip64 가 아님', !isZip64(plain))

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
