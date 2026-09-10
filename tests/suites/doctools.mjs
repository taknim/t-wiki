import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'doctools'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const make = (name, data) => root._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: data, _lastModified: Date.now() },
  ))
  // 굴릴 것이 있는 긴 글과, 한 화면에 들어오는 짧은 글을 함께 둡니다.
  make('긴 문서.md', ['# 긴 문서', '', ...Array.from({ length: 40 },
    (_, at) => `## 제목 ${at + 1}\n\n본문 줄입니다.\n`)].join('\n'))
  make('짧은 문서.md', '# 짧은 문서\n\n한 줄뿐입니다.\n')
  make('긴 자료.csv', ['가,나,다', ...Array.from({ length: 200 },
    (_, at) => `${at},값,값`)].join('\n'))
})

const openDoc = async (label) => {
  await page.click(`.tree-row:has-text("${label}") .tree-name`)
  await page.waitForTimeout(700)
}
const tools = () => page.evaluate(() =>
  [...document.querySelectorAll('.doc-tool')].map((one) => one.textContent.trim()))
const pane = () => page.evaluate(() => {
  const one = document.querySelector('.main .preview, .main .editor, .main .asset-view')
  return { top: Math.round(one.scrollTop), max: Math.round(one.scrollHeight - one.clientHeight) }
})
/*
 * 부드럽게 굴러가므로 누르자마자 재면 가는 도중입니다.
 * 멈출 때까지 기다렸다가 잽니다. 긴 글은 몇 초씩 걸립니다.
 */
const settled = async () => {
  let last = -1
  for (let tries = 0; tries < 40; tries += 1) {
    const now = await pane()
    if (now.top === last) return now
    last = now.top
    await page.waitForTimeout(150)
  }
  return pane()
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. 목차와 백링크가 글 옆에 뜬다')
  await openDoc('긴 문서')
  await page.click('.mode-switch button[aria-label="미리보기"]')
  await page.waitForTimeout(700)
  const shown = await tools()
  console.log('  ' + JSON.stringify(shown))
  expect('목차가 셈과 함께 뜸', shown.some((one) => /^목차\d+$/.test(one)), JSON.stringify(shown))
  expect('백링크도 뜸', shown.some((one) => one.startsWith('백링크')), JSON.stringify(shown))
  // 아래 표시줄에서는 빠졌습니다. 두 자리에 겹쳐 두면 어느 쪽을 눌러야 할지 헷갈립니다.
  const inBar = await page.evaluate(() => document.querySelectorAll('.info-bar .info-toggle').length)
  expect('표시줄에는 남지 않음', inBar === 0, String(inBar))

  // 오른쪽 아래 구석에 떠 있어야 합니다.
  const spot = await page.evaluate(() => {
    const box = document.querySelector('.doc-tools').getBoundingClientRect()
    const main = document.querySelector('.main').getBoundingClientRect()
    return { right: Math.round(main.right - box.right), bottom: Math.round(main.bottom - box.bottom) }
  })
  console.log('  ' + JSON.stringify(spot))
  expect('오른쪽 아래에 뜸', spot.right < 40 && spot.bottom < 90, JSON.stringify(spot))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'doctools', '01-tools.png'),
    clip: { x: 700, y: 250, width: 500, height: 440 } })

  step('2. 눌러서 목차를 폈다 접는다')
  await page.click('.doc-tool:has-text("목차")')
  await page.waitForTimeout(400)
  const opened = await page.evaluate(() => ({
    panel: document.querySelectorAll('.info-panel .toc').length,
    pressed: document.querySelector('.doc-tool.is-open')?.textContent.trim() ?? null,
  }))
  console.log('  ' + JSON.stringify(opened))
  expect('목차가 펴짐', opened.panel === 1, JSON.stringify(opened))
  expect('누른 단추가 짙어짐', (opened.pressed ?? '').startsWith('목차'), JSON.stringify(opened))
  await page.click('.doc-tool:has-text("목차")')
  await page.waitForTimeout(400)
  expect('다시 누르면 접힘',
    (await page.evaluate(() => document.querySelectorAll('.info-panel').length)) === 0)

  step('3. 맨 위·맨 아래로 한 번에 간다')
  const before = await pane()
  await page.click('.doc-tool:has-text("맨 아래")')
  const bottom = await settled()
  console.log('  ' + JSON.stringify(before) + ' → ' + JSON.stringify(bottom))
  expect('맨 아래까지 내려감', bottom.top >= bottom.max - 12, JSON.stringify(bottom))
  await page.click('.doc-tool:has-text("맨 위")')
  const top = await settled()
  console.log('  ' + JSON.stringify(top))
  expect('맨 위까지 올라옴', top.top <= 2, JSON.stringify(top))

  step('4. 굴릴 것이 없으면 위아래 단추도 없다')
  await openDoc('짧은 문서')
  await page.waitForTimeout(600)
  const short = await tools()
  console.log('  ' + JSON.stringify(short))
  expect('맨 위·맨 아래가 없음', !short.some((one) => one.includes('맨')), JSON.stringify(short))
  expect('목차·백링크는 그대로', short.some((one) => one.startsWith('백링크')), JSON.stringify(short))

  step('5. 마크다운이 아닌 글에서도 위아래로 간다')
  await openDoc('긴 자료.csv')
  await page.waitForTimeout(800)
  const csv = await tools()
  console.log('  ' + JSON.stringify(csv))
  expect('맨 위·맨 아래가 뜸', csv.some((one) => one.includes('맨 아래')), JSON.stringify(csv))
  expect('백링크는 없음', !csv.some((one) => one.startsWith('백링크')), JSON.stringify(csv))
  await page.click('.doc-tool:has-text("맨 아래")')
  const csvBottom = await settled()
  console.log('  ' + JSON.stringify(csvBottom))
  expect('표도 맨 아래로 감', csvBottom.top >= csvBottom.max - 12, JSON.stringify(csvBottom))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
