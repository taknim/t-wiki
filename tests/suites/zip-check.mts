import { makeZip } from '../zip-fixture.mjs'
import {
  dosTime, findTail, guessEncoding, isZip64, joinParts, listZip, nameScore, readEntries, unicodePath,
} from '../../src/lib/zipList'
import { archivePart, isArchivePart } from '../../src/lib/attachments'

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
/*
 * 규격은 "깃발이 서 있으면 UTF-8, 아니면 CP437" 이라지만 실제로는 깃발 없이 UTF-8 로
 * 적는 압축기가 흔합니다(맥). 깃발만 믿었더니 맥에서 만든 압축의 한글 이름이 모두
 * 깨졌습니다 — UTF-8 바이트를 EUC-KR 로 읽은 꼴이었습니다.
 */
const utf8 = (text: string) => new TextEncoder().encode(text)
/** CP949(EUC-KR) 로 적은 "한글.txt". 윈도 압축기가 이렇게 적습니다. */
const cp949 = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb, 0x2e, 0x74, 0x78, 0x74])
/** Shift_JIS 로 적은 "日本.txt". */
const sjis = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x2e, 0x74, 0x78, 0x74])

same('깃발이 없어도 UTF-8 이면 UTF-8', guessEncoding([utf8('보고서 모음.txt'), utf8('자료/표.csv')]), 'utf-8')
same('CP949 로 적힌 것은 EUC-KR', guessEncoding([cp949]), 'euc-kr')
same('일본어는 Shift_JIS', guessEncoding([sjis]), 'shift_jis')

/*
 * 점수는 **같은 바이트를 두 꼴로 읽어** 견줍니다. 바르게 읽으면 한글과 ASCII 가 고르게
 * 나오고, 잘못 읽으면 쓰이지 않는 기호가 섞여 점수가 깎입니다.
 */
const sample = utf8('보고서 모음 자료.txt')
const right = nameScore(new TextDecoder('utf-8').decode(sample))
const wrong = nameScore(new TextDecoder('euc-kr').decode(sample))
expect('바르게 읽은 쪽이 높은 점수', right > wrong, `${right} vs ${wrong}`)
// 제어 문자가 섞이면 이름일 수 없습니다.
same('제어 문자가 섞이면 탈락', nameScore('a\u0001b'), Number.NEGATIVE_INFINITY)

console.log('\n>>> 2-1. 압축 하나에는 한 꼴로 읽는다')
// 맥에서 만든 꼴: 깃발 없이 UTF-8.
const mac = makeZip([
  { name: utf8('보고서 모음.txt'), utf8: false, text: 'x' },
  { name: utf8('자료/표.csv'), utf8: false, text: 'y' },
])
same('맥 압축의 한글 이름', listOf(mac).entries.map((one) => one.path), ['보고서 모음.txt', '자료/표.csv'])
// 윈도에서 만든 꼴: 깃발 없이 CP949.
const win = makeZip([{ name: cp949, utf8: false, text: 'x' }])
same('윈도 압축의 한글 이름', listOf(win).entries[0].path, '한글.txt')
// 깃발이 선 것은 그대로 UTF-8 입니다.
same('깃발이 선 것은 그대로', listOf(makeZip([{ name: '한글.txt', text: 'x' }])).entries[0].path, '한글.txt')

console.log('\n>>> 2-2. 압축기가 적어 둔 이름이 있으면 추측하지 않는다')
/*
 * 제 나라 글자 꼴로 적으면서 원래 이름을 UTF-8 로 한 번 더 적어 두는 압축기가 있습니다
 * (Info-ZIP Unicode Path). 적어 둔 것이 가장 미덥습니다.
 */
const both = makeZip([{ name: cp949, utf8: false, unicodePath: '한글 이름.txt', text: 'x' }])
same('적어 둔 이름을 씀', listOf(both).entries[0].path, '한글 이름.txt')
same('칸만 따로 읽어도 같음',
  unicodePath(new Uint8Array([0x75, 0x70, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0xea, 0xb0, 0x80])), '가')

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

console.log('\n>>> 6. 나눠 담은 조각은 바탕 이름과 차례로 모은다')
same('세 자리 숫자', archivePart('자료.zip.001'), { base: '자료.zip', order: 1 })
same('rar 의 옛 조각', archivePart('자료.r01'), { base: '자료', order: 1 })
same('alz 의 조각', archivePart('자료.a02'), { base: '자료', order: 2 })
same('zip 의 조각', archivePart('자료.z09'), { base: '자료', order: 9 })
same('조각이 아니면 없음', archivePart('자료.zip'), null)
expect('조각으로 가림', isArchivePart('자료.zip.002'))
expect('압축 자체는 조각이 아님', !isArchivePart('자료.7z'))

console.log('\n>>> 7. 이어 붙인 것도 하나처럼 읽는다')
/*
 * 조각 하나만 읽으면 목차가 마지막 조각에만 있어 늘 실패합니다. 이어 붙여야 읽힙니다.
 * `new Blob` 은 바이트를 모아 두지 않고 가리키기만 하므로 읽는 양은 그대로입니다.
 */
const whole = makeZip([{ name: '가.txt', text: '하나' }, { name: '나.txt', text: '둘' }])
const half = Math.floor(whole.length / 2)
const joined = joinParts([new Blob([whole.slice(0, half)]), new Blob([whole.slice(half)])])
const fromParts = await listZip(joined)
same('이어 붙이면 그대로', fromParts.entries.map((one) => one.path), ['가.txt', '나.txt'])
same('크기도 그대로', fromParts.total, 2)

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
