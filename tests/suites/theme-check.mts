import { THEMES, type Palette } from '../../src/lib/theme'

/*
 * 테마 색의 대비를 잽니다.
 *
 * 눈으로 보고 고르는 색이라 한 벌만 어긋나도 알아채기 어렵습니다. 특히 새 테마를
 * 더할 때 글자가 바탕에 묻히는 일이 잦습니다. 여기서 숫자로 걸러 둡니다.
 * 잣대는 WCAG 대비비이고, 본문 글자는 4.5:1, 흐린 글자와 강조색처럼 큰 글자나
 * 보조 표시에 쓰는 것은 3:1 을 최소로 봅니다.
 */

let problems = 0
const ok = (name: string) => console.log('  ok  ' + name)
const fail = (name: string, detail: string) => {
  problems++
  console.log('FAIL  ' + name + '\n      ' + detail)
}

function channel(value: number): number {
  const ratio = value / 255
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(one: string, other: string): number {
  const [a, b] = [luminance(one), luminance(other)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** 본문 글자 잣대. 읽는 데 쓰는 색은 여기를 넘어야 합니다. */
const BODY = 4.5
/** 보조 잣대. 흐린 글자·강조색·상태색처럼 굵거나 짧게 쓰는 것들입니다. */
const AUX = 3
/*
 * 코드 색 잣대. 여기만 조금 낮춥니다.
 *
 * 주석은 일부러 물러서 있어야 하는 색이고, 널리 쓰이는 배색(솔라라이즈드·노르드)이
 * 다들 이 언저리입니다. 그래도 바탕에 아주 묻히지는 않게 바닥을 둡니다.
 */
const SYNTAX = 2.5

const pairs: [keyof Palette, keyof Palette, number, string][] = [
  ['text', 'bg', BODY, '본문 글자'],
  ['text', 'bgRaised', BODY, '떠 있는 칸의 글자'],
  ['text', 'bgSunken', BODY, '가라앉은 칸의 글자'],
  ['textMuted', 'bg', AUX, '흐린 글자'],
  ['textMuted', 'bgSunken', AUX, '가라앉은 칸의 흐린 글자'],
  ['accent', 'bg', AUX, '강조색'],
  ['accent', 'bgRaised', AUX, '떠 있는 칸의 강조색'],
  ['danger', 'bg', AUX, '오류색'],
  ['ok', 'bg', AUX, '성공색'],
  ['warn', 'bg', AUX, '주의색'],
  ['hlKeyword', 'bg', SYNTAX, '코드 예약어'],
  ['hlString', 'bg', SYNTAX, '코드 문자열'],
  ['hlNumber', 'bg', SYNTAX, '코드 숫자'],
  ['hlComment', 'bg', SYNTAX, '코드 주석'],
  ['hlTitle', 'bg', SYNTAX, '코드 제목'],
  ['hlType', 'bg', SYNTAX, '코드 타입'],
  ['hlMeta', 'bg', SYNTAX, '코드 메타'],
  ['borderStrong', 'bg', 1.4, '진한 테두리'],
]

console.log('\n[테마 대비]')
for (const theme of THEMES) {
  for (const [modeName, palette] of [['밝게', theme.light], ['어둡게', theme.dark]] as const) {
    const bad: string[] = []

    for (const [front, back, least, label] of pairs) {
      const ratio = contrast(palette[front], palette[back])
      if (ratio < least) bad.push(`${label} ${ratio.toFixed(2)} < ${least}`)
    }

    // 찾은 자리 표시는 그 위에 본문 글자가 그대로 얹힙니다.
    const marked = contrast(palette.text, palette.mark)
    if (marked < BODY) bad.push(`강조 표시 위의 글자 ${marked.toFixed(2)} < ${BODY}`)

    // 밝은 벌과 어두운 벌이 실제로 갈리는지. 뒤바뀐 채 적어 넣기 쉽습니다.
    const light = luminance(palette.bg) > 0.5
    if (modeName === '밝게' && !light) bad.push('밝은 벌인데 바탕이 어둡습니다')
    if (modeName === '어둡게' && light) bad.push('어두운 벌인데 바탕이 밝습니다')

    if (bad.length === 0) ok(`${theme.name} · ${modeName}`)
    else fail(`${theme.name} · ${modeName}`, bad.join('\n      '))
  }
}

console.log('\n[테마 목록]')
const ids = new Set<string>()
const names = new Set<string>()
for (const theme of THEMES) {
  if (ids.has(theme.id)) fail('id 가 겹침', theme.id)
  if (names.has(theme.name)) fail('이름이 겹침', theme.name)
  ids.add(theme.id)
  names.add(theme.name)
}
if (problems === 0) ok(`${THEMES.length}벌, 겹치는 것 없음`)

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
