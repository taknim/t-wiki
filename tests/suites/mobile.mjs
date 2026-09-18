import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'mobile'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
// 손전화 크기. 손을 얹을 수 없는 기기라는 것도 함께 흉내 냅니다(hover: none).
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => window.__installMockFs())

const layout = () => page.evaluate(() => {
  const aside = document.querySelector('.sidebar')
  const rect = aside?.getBoundingClientRect()
  const style = aside ? getComputedStyle(aside) : null
  return {
    rail: aside?.classList.contains('is-rail') ?? null,
    shown: aside ? style.display !== 'none' : false,
    fixed: style?.position ?? null,
    width: rect ? Math.round(rect.width) : null,
    backdrop: document.querySelector('.sidebar-backdrop') !== null,
    mainLeft: Math.round(document.querySelector('.main').getBoundingClientRect().left),
    mainWidth: Math.round(document.querySelector('.main').getBoundingClientRect().width),
    menu: (() => { const b = document.querySelector('.menu-toggle'); return b ? getComputedStyle(b).display !== 'none' : false })(),
  }
})

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree-row, .main', { timeout: 10000 })
  await page.waitForTimeout(600)

  step('1. 좁은 화면에서는 옆줄이 닫힌 채 시작하고 본문이 화면을 다 쓴다')
  const closed = await layout()
  console.log('  ' + JSON.stringify(closed))
  expect('옆줄이 그려지지 않음', closed.rail === true && closed.shown === false, JSON.stringify(closed))
  expect('본문이 왼쪽 끝부터', closed.mainLeft === 0 && closed.mainWidth >= 380, JSON.stringify(closed))
  expect('머리줄에 메뉴 단추', closed.menu, JSON.stringify(closed))
  // 머리줄 단추들이 두 줄로 접히지 않습니다.
  const topbar = await page.evaluate(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height))
  expect('머리줄이 한 줄', topbar < 60, String(topbar))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '01-closed.png') })

  step('2. 메뉴 단추를 누르면 옆줄이 본문 위에 서랍처럼 뜬다')
  await page.click('.menu-toggle')
  await page.waitForTimeout(400)
  const opened = await layout()
  console.log('  ' + JSON.stringify(opened))
  expect('서랍이 떠 있음', opened.shown && opened.fixed === 'fixed', JSON.stringify(opened))
  expect('본문을 밀지 않고 덮음', opened.mainLeft === 0, JSON.stringify(opened))
  expect('화면보다 좁아 본문이 비침', opened.width < 390 && opened.width >= 300, JSON.stringify(opened))
  expect('덮개가 깔림', opened.backdrop, JSON.stringify(opened))
  // 손을 얹을 수 없는 기기에서 안내 말풍선은 손가락에 가려 방해만 됩니다.
  await page.hover('.sidebar-toggle')
  await page.waitForTimeout(700)
  const tip = await page.evaluate(() => {
    const one = document.querySelector('.tooltip')
    return one ? getComputedStyle(one).display : 'none'
  })
  expect('안내 말풍선이 뜨지 않음', tip === 'none', tip)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '02-open.png') })

  step('3. 문서를 고르면 서랍이 닫히고 문서가 보인다')
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(500)
  const picked = await layout()
  expect('서랍이 닫힘', picked.shown === false && !picked.backdrop, JSON.stringify(picked))
  const title = await page.evaluate(() => document.querySelector('.doc-head h1')?.textContent ?? null)
  expect('문서가 열림', title === '개발 환경.md', String(title))

  step('4. 폴더를 고르면 서랍은 그대로 열려 있다')
  await page.click('.menu-toggle')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("회사")')
  await page.waitForTimeout(400)
  expect('폴더를 골라도 열린 채', (await layout()).shown === true)

  step('5. 덮개를 누르거나 옆줄 접기 단추로 닫는다')
  await page.mouse.click(385, 700)     // 서랍 밖(덮개)
  await page.waitForTimeout(300)
  expect('덮개를 누르면 닫힘', (await layout()).shown === false)
  await page.click('.menu-toggle')
  await page.waitForTimeout(300)
  await page.click('.sidebar-toggle')
  await page.waitForTimeout(300)
  expect('접기 단추로도 닫힘', (await layout()).shown === false)

  step('6. 손을 얹을 수 없어도 고른 줄의 단추는 보인다')
  await page.click('.menu-toggle')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("회고")')
  await page.waitForTimeout(300)
  const tools = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.tree-row')].find((one) => one.textContent.includes('회고'))
    const shown = [...row.querySelectorAll('.tree-tools button')].filter((one) => one.offsetParent !== null)
    // 뿌리 줄의 단추는 늘 보이는 것이라 셈에서 뺍니다.
    const other = [...document.querySelectorAll('.tree-row:not(.is-selected):not(.tree-root) .tree-tools button')]
      .filter((one) => one.offsetParent !== null && !one.classList.contains('tree-fav'))
    return { shown: shown.map((one) => one.getAttribute('aria-label')), othersShown: other.length }
  })
  console.log('  ' + JSON.stringify(tools))
  expect('고른 줄의 단추가 보임', tools.shown.includes('삭제') && tools.shown.includes('즐겨찾기에 담기'), JSON.stringify(tools))
  expect('다른 줄은 그대로 감춤', tools.othersShown === 0, JSON.stringify(tools))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '03-tools.png') })

  step('7. 넓게 펴면 예전처럼 본문 옆에 선다')
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(400)
  const wide = await layout()
  console.log('  ' + JSON.stringify(wide))
  expect('본문 옆에 서고 덮개는 없음', wide.fixed !== 'fixed' && !wide.backdrop && wide.mainLeft > 200, JSON.stringify(wide))
  expect('메뉴 단추는 감춰짐', wide.menu === false, JSON.stringify(wide))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
