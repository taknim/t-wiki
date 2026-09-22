import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'gutter'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  // 둘째 줄은 접힐 만큼 깁니다. 빈 줄도 하나 둡니다.
  root._children.set('긴 줄.md', Object.assign(Object.create(Object.getPrototypeOf(sample)), {
    kind: 'file', name: '긴 줄.md',
    // 뒤에 줄을 많이 두어 글상자가 넘치게 합니다. 넘쳐야 글 높이를 잴 수 있습니다.
    _data: ['# 첫째 줄', '둘째 줄은 아주 깁니다. ' + '가나다라마바사 '.repeat(40), '', '넷째 줄', '다섯째 줄',
      ...Array.from({ length: 60 }, (_, at) => `줄 ${at + 6}`)].join('\n'),
    _lastModified: Date.now(),
  }))
})

const openSettings = async (item) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click(`.settings-nav .settings-nav-item:text-is("${item}")`)
  await page.waitForTimeout(400)
}
const gutter = () => page.evaluate(() => {
  const box = document.querySelector('.editor-gutter')
  const editor = document.querySelector('.main .editor')
  if (!box) return { shown: false }
  const lines = [...box.querySelectorAll('.editor-gutter-line')]
  const style = getComputedStyle(editor)
  const inner = editor.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
  return {
    shown: true,
    numbers: lines.map((one) => one.textContent),
    heights: lines.map((one) => Math.round(one.getBoundingClientRect().height)),
    total: Math.round(lines.reduce((sum, one) => sum + one.getBoundingClientRect().height, 0)),
    inner: Math.round(inner),
  }
})
const caret = () => page.evaluate(() => document.querySelector('.info-caret')?.textContent ?? null)

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click('.tree-row:has-text("긴 줄") .tree-name')
  await page.waitForSelector('.main .editor', { timeout: 8000 })
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(300)

  step('1. 기본으로는 줄 번호도 커서 위치도 없다')
  expect('줄 번호 없음', (await gutter()).shown === false)
  await page.click('.main .editor')
  await page.waitForTimeout(200)
  expect('커서 위치 없음', (await caret()) === null)

  step('2. 설정에서 켜면 줄 번호가 서고, 접힌 긴 줄에도 번호는 한 번만 선다')
  await openSettings('편집기')
  await page.click('.checkbox:has-text("줄 번호") input')
  await page.click('.checkbox:has-text("커서 위치") input')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const numbered = await gutter()
  console.log('  ' + JSON.stringify({ ...numbered, numbers: numbered.numbers.length, heights: numbered.heights.slice(0, 5) }))
  expect('줄 번호가 보임', numbered.shown && numbered.numbers.slice(0, 5).join() === '1,2,3,4,5' && numbered.numbers.length === 65, JSON.stringify(numbered.numbers.slice(0, 6)))
  // 둘째 줄은 접혀 다른 줄보다 몇 배 높고, 빈 셋째 줄도 한 줄 높이는 차지합니다.
  expect('접힌 줄은 그만큼 높음', numbered.heights[1] >= numbered.heights[0] * 2 && numbered.heights[2] >= numbered.heights[0] - 1, JSON.stringify(numbered.heights))
  // 번호 높이를 다 더하면 글상자의 글 높이와 같아야 나란히 섭니다.
  expect('번호가 글과 나란히 섬', Math.abs(numbered.total - numbered.inner) <= 4, `${numbered.total} vs ${numbered.inner}`)
  /*
   * 번호 수백 줄을 흐름에 두면 그 높이가 틀의 크기로 잡혀 본문 칸 전체가 굴러갔습니다.
   * 굴러가는 것은 글상자여야 하고, 본문 칸은 제자리여야 합니다.
   */
  await page.click('.main .editor')
  await page.keyboard.press('Control+End')
  await page.mouse.wheel(0, 3000)
  await page.waitForTimeout(400)
  const scrolled = await page.evaluate(() => ({
    main: document.querySelector('.main').scrollTop,
    editor: Math.round(document.querySelector('.main .editor').scrollTop),
    gutter: Math.round(document.querySelector('.editor-gutter').scrollTop),
    frameH: Math.round(document.querySelector('.editor-frame').getBoundingClientRect().height),
    bodyH: Math.round(document.querySelector('.doc-body').getBoundingClientRect().height),
  }))
  console.log('  ' + JSON.stringify(scrolled))
  expect('본문 칸은 제자리, 글상자만 굴러감', scrolled.main === 0 && scrolled.editor > 0, JSON.stringify(scrolled))
  /*
   * 거울이 아래로 삐져나오면 본문 칸의 굴림 범위에 들어가 굴림대가 하나 더 생기고 화면이
   * 넘어갑니다. 본문 칸에는 굴릴 것이 없어야 합니다.
   */
  const extra = await page.evaluate(() => {
    const main = document.querySelector('.main')
    return main.scrollHeight - main.clientHeight
  })
  expect('본문 칸에 굴릴 것이 없음(굴림대가 둘이 아님)', extra === 0, String(extra))
  expect('번호도 함께 굴러감', Math.abs(scrolled.gutter - scrolled.editor) <= 1, JSON.stringify(scrolled))
  expect('틀이 글상자보다 길어지지 않음', scrolled.frameH <= scrolled.bodyH + 1, JSON.stringify(scrolled))
  await page.mouse.wheel(0, -5000)
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'gutter', '01-gutter.png'), clip: { x: 430, y: 60, width: 670, height: 320 } })

  /*
   * 줄 간격은 CSS 변수로만 바뀝니다. 그 뒤 번호가 옛 높이로 남아 글과 어긋났습니다.
   * 번호 높이의 합이 글 높이와 다시 같아야 합니다.
   */
  step('3. 줄 간격을 바꿔도 번호가 글과 나란히 선다')
  const before = await gutter()
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(300)
  await page.click('[aria-label="줄 간격"] button:text-is("아주 넓게")')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const wider = await gutter()
  console.log('  ' + JSON.stringify({ before: before.heights.slice(0, 3), after: wider.heights.slice(0, 3), total: wider.total, inner: wider.inner }))
  expect('줄이 더 높아짐', wider.heights[0] > before.heights[0], `${before.heights[0]} → ${wider.heights[0]}`)
  expect('번호가 여전히 글과 나란히 섬', Math.abs(wider.total - wider.inner) <= 4, `${wider.total} vs ${wider.inner}`)
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(300)
  await page.click('[aria-label="줄 간격"] button:text-is("보통")')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  step('4. 커서 위치가 오른쪽 아래에 행·열로 적힌다')
  await page.click('.main .editor')
  // 스크립트로 옮긴 자리는 글쇠를 한 번 오가야 화면에 실립니다(사람은 늘 글쇠나 마우스로 옮깁니다).
  await page.evaluate(() => {
    const editor = document.querySelector('.main .editor')
    const at = editor.value.indexOf('넷째 줄') + 2
    editor.setSelectionRange(at, at)
  })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(200)
  const at = await caret()
  console.log('  ' + String(at))
  expect('넷째 줄 셋째 열, 라벨이 먼저', at === '행 4 열 3', String(at))
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  expect('한 칸 오른쪽', (await caret()) === '행 4 열 4', String(await caret()))
  // 크기·시각보다 앞에 섭니다.
  const order = await page.evaluate(() => [...document.querySelectorAll('.info-bar .info-meta')].map((one) => one.className.includes('info-caret') ? 'caret' : 'meta'))
  expect('크기 앞에 섬', order[0] === 'caret', JSON.stringify(order))

  /*
   * 긴 문서에서 몇백 번째 줄을 굴려 찾는 것은 더딥니다. 행·열 표시를 누르면 자리를 물어
   * 그리로 데려다 줍니다. 열은 줄 길이를 넘으면 줄 끝으로, 행은 줄 수를 넘으면 마지막 줄로.
   */
  step('5. 행·열 표시를 누르면 자리를 물어 그리로 뛰어간다')
  await page.click('.info-caret')
  await page.waitForSelector('.dialog input', { timeout: 3000 })
  const offered = await page.inputValue('.dialog input')
  expect('지금 자리가 미리 적혀 있음', offered === '4:4', offered)
  await page.fill('.dialog input', '40:3')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const landed = await page.evaluate(() => {
    const editor = document.querySelector('.main .editor')
    const before = editor.value.slice(0, editor.selectionStart)
    return { line: before.split('\n').length, column: editor.selectionStart - before.lastIndexOf('\n'),
      focused: document.activeElement === editor, scrolled: editor.scrollTop > 0,
      pill: document.querySelector('.pill')?.textContent }
  })
  console.log('  ' + JSON.stringify(landed))
  expect('40행 3열에 커서가 섬', landed.line === 40 && landed.column === 3, JSON.stringify(landed))
  expect('편집기에 초점이 있고 그 줄까지 굴러감', landed.focused && landed.scrolled, JSON.stringify(landed))
  // 물음 창을 닫은 Enter 가 편집기로 새어 들어 줄바꿈을 끼워 넣은 적이 있습니다.
  expect('글은 손대지 않음', landed.pill === '저장됨', String(landed.pill))
  expect('표시도 따라 바뀜', (await caret()) === '행 40 열 3', String(await caret()))
  // 행만 적으면 그 줄 첫 칸. 줄 수를 넘으면 마지막 줄.
  await page.click('.info-caret')
  await page.waitForSelector('.dialog input', { timeout: 3000 })
  await page.fill('.dialog input', '999')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  expect('넘치는 행은 마지막 줄 첫 칸', (await caret()) === '행 65 열 1', String(await caret()))
  // 취소하면 자리는 그대로.
  await page.click('.info-caret')
  await page.waitForSelector('.dialog input', { timeout: 3000 })
  await page.fill('.dialog input', '2')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  expect('취소하면 그대로', (await caret()) === '행 65 열 1', String(await caret()))

  step('6. 미리보기만 볼 때는 커서 위치가 사라지고, 끄면 줄 번호도 사라진다')
  await page.click('.mode-switch button[aria-label="미리보기"]')
  await page.waitForTimeout(300)
  expect('편집기가 없으면 자리도 없음', (await caret()) === null, String(await caret()))
  await page.click('.mode-switch button[aria-label="편집"]')
  await openSettings('편집기')
  await page.click('.checkbox:has-text("줄 번호") input')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  expect('끄면 줄 번호가 사라짐', (await gutter()).shown === false)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
