import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'typography'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => {
  window.__installMockFs()
  // 표와 코드가 든 문서. 씨앗에는 둘 다 없어 너비를 견줄 수 없습니다.
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const seed = (name, data) => root._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: data, _lastModified: Date.now() },
  ))
  // 큰 그림. 줄여 보여 주는지 보려면 본문 너비보다 넓어야 합니다.
  root._children.get('첨부')._children.set('큰그림.svg', Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    {
      kind: 'file',
      name: '큰그림.svg',
      _lastModified: Date.now(),
      _data: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300">'
        + '<rect width="1200" height="300" fill="#2f6feb"/></svg>',
    },
  ))
  seed('그림 문서.md', '# 그림\n\n앞 글줄입니다.\n\n![큰그림](첨부/큰그림.svg)\n')
  seed('자료.csv', '가,나,다\n하나,둘,셋\n넷,다섯,여섯\n')
  seed('쪽지.json', '{\n  "이름": "값",\n  "수": 12\n}\n')
  root._children.set('너비.md', Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    {
      kind: 'file',
      name: '너비.md',
      _lastModified: Date.now(),
      _data: '# 너비\n\n글줄입니다. 이 문단과 아래 표·코드가 같은 폭에 서야 합니다.\n\n'
        + '| 가 | 나 | 다 | 라 | 마 | 바 | 사 | 아 |\n'
        + '| --- | --- | --- | --- | --- | --- | --- | --- |\n'
        + '| 하나 | 둘 | 셋 | 넷 | 다섯 | 여섯 | 일곱 | 여덟 |\n\n'
        + '```js\nconst 아주긴줄 = "' + 'x'.repeat(200) + '"\n```\n',
    },
  ))
})

const openVault = async () => {
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)
}
const openDoc = async (label) => {
  await page.click(`.tree-row:has-text("${label}")`)
  await page.waitForSelector('.editor', { timeout: 8000 })
  await page.waitForTimeout(400)
}
/** 보기 모드는 폴더마다 기억되므로, 편집기가 없는 화면에서는 볼 것을 따로 짚습니다. */
const openAs = async (label, selector) => {
  await page.click(`.tree-row:has-text("${label}")`)
  await page.waitForSelector(selector, { timeout: 8000 })
  await page.waitForTimeout(400)
}
/** 모양 묶음을 펴고 그 안의 단추를 누릅니다. 이름이 서로 겹쳐 통째로 같은 것만 짚습니다. */
const pick = async (group, name) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(300)
  await page.click(`[aria-label="${group}"] button:text-is("${name}")`)
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)
}
/**
 * 미리보기 안에서 한글 한 줄이 차지하는 폭.
 *
 * 글꼴 이름만 봐서는 실제로 바뀌었는지 알 수 없습니다. 이름은 걸려 있어도 그 벌에
 * 한글이 없으면 다른 글꼴로 그려집니다. 그려진 폭을 재야 정말 바뀐 것을 압니다.
 */
const koreanWidth = () => page.evaluate(() => {
  const host = document.querySelector('.preview')
  if (!host) return null
  const probe = document.createElement('span')
  probe.textContent = '한글명조체시험문장입니다'
  Object.assign(probe.style, { whiteSpace: 'nowrap', position: 'absolute', visibility: 'hidden' })
  host.appendChild(probe)
  const width = probe.getBoundingClientRect().width
  probe.remove()
  return Math.round(width * 100) / 100
})
const setLeading = async (name) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(300)
  await page.click(`[aria-label="줄 간격"] button:text-is("${name}")`)
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)
}
/** 화면이 실제로 쓰는 줄 높이. 재 보는 것은 글자 크기가 아니라 줄 높이입니다. */
const measured = () => page.evaluate(() => {
  const of = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const style = getComputedStyle(el)
    return Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) / 100
  }
  return {
    preview: of('.preview'),
    editor: of('.editor'),
    variable: getComputedStyle(document.documentElement).getPropertyValue('--doc-leading').trim(),
    pressed: document.querySelector('[aria-label="줄 간격"] button[aria-pressed="true"]')?.textContent ?? null,
  }
})

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await openVault()
  await openDoc('개발 환경')

  step('1. 기본은 보통이다')
  const first = await measured()
  console.log('  ' + JSON.stringify(first))
  expect('변수가 1.7', first.variable === '1.7', first.variable)
  expect('미리보기가 따름', first.preview === 1.7, String(first.preview))
  expect('편집기도 따름', first.editor === 1.7, String(first.editor))

  step('2. 다섯 단계가 차례대로 벌어진다')
  const steps = [
    ['아주 좁게', '1.3'],
    ['좁게', '1.5'],
    ['보통', '1.7'],
    ['넓게', '1.9'],
    ['아주 넓게', '2.2'],
  ]
  const seen = []
  for (const [name, want] of steps) {
    await setLeading(name)
    const now = await measured()
    console.log(`  ${name}: ` + JSON.stringify(now))
    expect(`${name} 변수가 ${want}`, now.variable === want, now.variable)
    expect(`${name} 미리보기가 따름`, now.preview === Number(want), String(now.preview))
    expect(`${name} 편집기도 따름`, now.editor === Number(want), String(now.editor))
    seen.push(now.preview)
  }
  expect('갈수록 벌어짐', seen.every((v, at) => at === 0 || v > seen[at - 1]), JSON.stringify(seen))

  step('3. 마지막으로 고른 아주 넓게가 걸려 있다')
  const loose = await measured()
  console.log('  ' + JSON.stringify(loose))
  expect('변수가 2.2', loose.variable === '2.2', loose.variable)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'typography', '01-loose.png'),
    clip: { x: 430, y: 60, width: 970, height: 420 } })

  step('4. 글자 크기를 바꿔도 비율은 그대로다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(300)
  await page.click('[aria-label="글자 크기"] button:text-is("크게")')
  await page.waitForTimeout(300)
  const bigger = await page.evaluate(() => {
    const el = document.querySelector('.preview')
    const style = getComputedStyle(el)
    return {
      size: parseFloat(style.fontSize),
      ratio: Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) / 100,
      pressed: document.querySelector('[aria-label="줄 간격"] button[aria-pressed="true"]')?.textContent ?? null,
    }
  })
  console.log('  ' + JSON.stringify(bigger))
  expect('글자가 커짐', bigger.size === 17, String(bigger.size))
  expect('비율은 그대로', bigger.ratio === 2.2, String(bigger.ratio))
  expect('고른 칸이 눌려 있음', bigger.pressed === '아주 넓게', String(bigger.pressed))
  await page.click('.sheet-close')
  await page.waitForTimeout(300)

  step('5. 새로고침해도 그대로다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault()
  await openDoc('개발 환경')
  const kept = await measured()
  console.log('  ' + JSON.stringify(kept))
  expect('변수가 그대로', kept.variable === '2.2', kept.variable)
  expect('미리보기도 그대로', kept.preview === 2.2, String(kept.preview))

  step('6. 첨부 미리보기에도 걸린다')
  await page.click('.tree-row:has-text("첨부")')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("도표")')
  await page.waitForTimeout(600)
  const svgPane = await page.evaluate(() => {
    const el = document.querySelector('.code-preview') ?? document.querySelector('.asset-text')
    if (!el) return null
    const style = getComputedStyle(el)
    return Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) / 100
  })
  console.log('  첨부 미리보기: ' + String(svgPane))
  expect('첨부 글도 따름', svgPane === null || svgPane === 2.2, String(svgPane))

  step('7. 글자 크기는 다섯 단계가 차례대로 커진다')
  await openDoc('개발 환경')
  const sizes = [['아주 작게', 13], ['작게', 14], ['보통', 15], ['크게', 17], ['아주 크게', 19]]
  const grew = []
  for (const [name, want] of sizes) {
    await pick('글자 크기', name)
    const size = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.preview')).fontSize))
    console.log(`  ${name}: ${size}px`)
    expect(`${name} 가 ${want}px`, size === want, String(size))
    grew.push(size)
  }
  expect('갈수록 커짐', grew.every((v, at) => at === 0 || v > grew[at - 1]), JSON.stringify(grew))
  await pick('글자 크기', '보통')

  step('8. 세리프를 고르면 한글도 명조로 바뀐다')
  /*
   * 앞서는 세리프 벌 안에 고딕 한글이 먼저 서 있어, 글꼴을 바꿔도 한글은 그대로였습니다.
   * 이름만 보지 않고 그려진 폭을 재서 정말 다른 글꼴로 그려지는지 봅니다.
   */
  await pick('본문 글꼴', '산세리프')
  const sans = { family: await page.evaluate(() =>
    getComputedStyle(document.querySelector('.preview')).fontFamily), width: await koreanWidth() }
  await pick('본문 글꼴', '세리프')
  const serif = { family: await page.evaluate(() =>
    getComputedStyle(document.querySelector('.preview')).fontFamily), width: await koreanWidth() }
  console.log('  산세리프: ' + sans.width + 'px')
  console.log('  세리프:   ' + serif.width + 'px')

  const gothicFirst = /Gothic|Pretendard|system-ui/i.test(serif.family.split(',').slice(0, 3).join(','))
  expect('세리프 벌 앞머리에 고딕이 없음', !gothicFirst, serif.family)

  /*
   * 어떤 명조가 깔려 있는지.
   *
   * document.fonts.check 는 없는 이름에도 참을 내놓아 믿을 수 없습니다.
   * 없는 이름 하나로 잰 폭과 견주어, 달라지는 것만 실제로 깔린 것으로 봅니다.
   */
  const installed = await page.evaluate(() => {
    const measure = (family) => {
      const probe = document.createElement('span')
      probe.textContent = '한글명조체시험문장입니다'
      Object.assign(probe.style, {
        position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap',
        fontSize: '16px', fontFamily: family,
      })
      document.body.appendChild(probe)
      const width = probe.getBoundingClientRect().width
      probe.remove()
      return width
    }
    const none = measure('없는글꼴-xyz')
    return ['AppleMyungjo', 'Apple SD Myungjo', 'Noto Serif KR', 'Nanum Myeongjo', 'Batang']
      .filter((name) => measure(`"${name}", 없는글꼴-xyz`) !== none)
  })
  console.log('  깔려 있는 명조: ' + JSON.stringify(installed))
  if (installed.length === 0) {
    ok('이 기계에 한글 명조가 없어 폭은 견주지 않음')
  } else {
    expect('한글이 다른 글꼴로 그려짐', sans.width !== serif.width,
      `${sans.width} vs ${serif.width} — 이름만 바뀌고 글자는 그대로입니다`)
  }
  await page.screenshot({ path: join(HERE, '..', 'shots', 'typography', '02-serif.png'),
    clip: { x: 430, y: 60, width: 970, height: 300 } })
  await pick('본문 글꼴', '산세리프')

  /*
   * 표와 코드는 예전에 창 끝까지 늘어져 있었습니다. 그러면 글줄과 왼쪽만 맞고
   * 오른쪽이 어긋나 글이 들쭉날쭉해 보입니다.
   */
  step('9. 표와 코드도 본문 너비를 따른다')
  // 보통(1000px)이 걸리는지 보려면 미리보기 칸이 그보다 넓어야 합니다.
  await page.setViewportSize({ width: 1720, height: 920 })
  await page.waitForTimeout(300)
  await openDoc('너비')
  // 나란히 보기에서는 칸이 반쪽이라 너비 설정이 걸리지 않습니다. 결과만 봅니다.
  await page.click('.mode-switch button[aria-label="미리보기"]')
  await page.waitForTimeout(500)
  const widths = () => page.evaluate(() => {
    const at = (selector) => {
      const node = document.querySelector(selector)
      return node ? Math.round(node.getBoundingClientRect().width) : null
    }
    const left = (selector) => {
      const node = document.querySelector(selector)
      return node ? Math.round(node.getBoundingClientRect().left) : null
    }
    return {
      pane: at('.preview'),
      text: at('.preview > p'),
      code: at('.preview > pre'),
      table: at('.preview > table'),
      // 왼쪽 끝이 어긋나면 표와 코드만 가운데로 밀려난 것입니다.
      edges: [left('.preview > p'), left('.preview > pre'), left('.preview > table')],
    }
  })

  await pick('본문 너비', '보통')
  const medium = await widths()
  console.log('  보통: ' + JSON.stringify(medium))
  expect('보통은 1000', medium.text === 1000, JSON.stringify(medium))
  expect('코드도 같은 폭', medium.code === medium.text, JSON.stringify(medium))
  expect('표도 같은 폭', medium.table === medium.text, JSON.stringify(medium))
  expect('창은 그보다 넓음', medium.pane > medium.text, JSON.stringify(medium))
  expect('셋 다 왼쪽 끝이 같음', new Set(medium.edges).size === 1, JSON.stringify(medium.edges))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'typography', '03-width.png') })

  await pick('본문 너비', '좁게')
  const narrow = await widths()
  console.log('  좁게: ' + JSON.stringify(narrow))
  expect('좁게는 680', narrow.text === 680, JSON.stringify(narrow))
  expect('코드와 표도 함께 좁아짐',
    narrow.code === 680 && narrow.table === 680, JSON.stringify(narrow))
  expect('좁혀도 왼쪽 끝은 그대로', new Set(narrow.edges).size === 1, JSON.stringify(narrow.edges))

  await pick('본문 너비', '넓게')
  const wide = await widths()
  console.log('  넓게: ' + JSON.stringify(wide))
  expect('넓게는 창을 다 씀', wide.text > medium.text, JSON.stringify(wide))
  expect('코드와 표도 함께 넓어짐',
    wide.code === wide.text && wide.table === wide.text, JSON.stringify(wide))

  // 넘치는 것은 잘리지 않고 제 칸 안에서 굴러가야 합니다.
  await pick('본문 너비', '좁게')
  const scrolls = await page.evaluate(() => {
    const code = document.querySelector('.preview > pre')
    const table = document.querySelector('.preview > table')
    return {
      code: code.scrollWidth > code.clientWidth + 4,
      table: table.scrollWidth > table.clientWidth + 4 || table.scrollWidth <= table.clientWidth,
    }
  })
  console.log('  ' + JSON.stringify(scrolls))
  expect('긴 코드는 옆으로 굴러감', scrolls.code === true, JSON.stringify(scrolls))
  await pick('본문 너비', '보통')

  step('10. 마크다운이 아닌 글도 같은 너비와 글자 크기를 따른다')
  await openAs('자료.csv', '.text-preview')
  const csv = await page.evaluate(() => {
    const wrap = document.querySelector('.text-preview .table-wrap')
    const table = document.querySelector('.data-table')
    return {
      width: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
      pane: Math.round(document.querySelector('.preview').getBoundingClientRect().width),
      size: table ? getComputedStyle(table).fontSize : null,
    }
  })
  console.log('  표: ' + JSON.stringify(csv))
  expect('표도 본문 너비에 섬', csv.width === 1000, JSON.stringify(csv))
  expect('창은 그보다 넓음', csv.pane > csv.width, JSON.stringify(csv))
  expect('글자 크기도 본문을 따름', csv.size === '13.5px', String(csv.size))

  await openAs('쪽지.json', '.code-preview')
  const json = await page.evaluate(() => {
    const code = document.querySelector('.code-preview')
    return {
      width: Math.round(code.getBoundingClientRect().width),
      size: getComputedStyle(code).fontSize,
      leading: getComputedStyle(code).lineHeight,
    }
  })
  console.log('  코드: ' + JSON.stringify(json))
  expect('코드도 본문 너비에 섬', json.width === 1000, JSON.stringify(json))
  expect('글자 크기도 본문을 따름', json.size === '13.5px', String(json.size))

  // 크기를 키우면 첨부 미리보기의 글씨도 함께 커져야 합니다.
  await pick('글자 크기', '아주 크게')
  const grown = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.code-preview')).fontSize)
  console.log('  키운 뒤: ' + grown)
  expect('키우면 함께 커짐', parseFloat(grown) > parseFloat(json.size), `${json.size} -> ${grown}`)
  await pick('글자 크기', '보통')

  step('11. 큰 그림만 줄이고 고른 자리에 세운다')
  await openAs('그림 문서', '.preview img')
  const shot = () => page.evaluate(() => {
    const image = document.querySelector('.preview img')
    const line = document.querySelector('.preview > p')
    const box = image.getBoundingClientRect()
    const column = line.getBoundingClientRect()
    return {
      natural: image.naturalWidth,
      width: Math.round(box.width),
      // 글줄을 잣대로 어느 쪽에 붙었는지 봅니다.
      left: Math.round(box.left - column.left),
      right: Math.round(column.right - box.right),
    }
  })

  await pick('이미지 최대 너비', '제한 없음')
  const full = await shot()
  console.log('  제한 없음: ' + JSON.stringify(full))
  expect('본문 너비까지만 커짐', full.natural === 1200 && full.width === 1000, JSON.stringify(full))

  await pick('이미지 최대 너비', '보통')
  const half = await shot()
  console.log('  보통: ' + JSON.stringify(half))
  expect('520 으로 줄어듦', half.width === 520, JSON.stringify(half))
  expect('왼쪽에 붙어 있음', half.left === 0, JSON.stringify(half))

  await pick('이미지 정렬', '가운데')
  const middle = await shot()
  console.log('  가운데: ' + JSON.stringify(middle))
  expect('양옆이 같음', Math.abs(middle.left - middle.right) <= 1, JSON.stringify(middle))

  await pick('이미지 정렬', '오른쪽')
  const right = await shot()
  console.log('  오른쪽: ' + JSON.stringify(right))
  expect('오른쪽에 붙음', right.right === 0 && right.left > 0, JSON.stringify(right))

  // 작은 그림은 늘리지 않습니다.
  await pick('이미지 최대 너비', '크게')
  await openAs('도표.svg', '.asset-canvas')
  const small = await page.evaluate(() => {
    const image = document.querySelector('.asset-image')
    const canvas = document.querySelector('.asset-canvas')
    return {
      width: Math.round(image.getBoundingClientRect().width),
      natural: image.naturalWidth,
      justify: getComputedStyle(canvas).justifyContent,
    }
  })
  console.log('  작은 그림: ' + JSON.stringify(small))
  expect('작은 그림은 그대로', small.width === small.natural, JSON.stringify(small))
  expect('그림 파일 미리보기도 같은 자리를 따름', small.justify === 'right' || small.justify === 'end',
    String(small.justify))
  await pick('이미지 정렬', '왼쪽')
  await pick('이미지 최대 너비', '제한 없음')
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
