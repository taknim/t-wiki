import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'resize'), { recursive: true })
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
await page.addInitScript(() => window.__installMockFs())

const width = () => page.evaluate(() =>
  Math.round(document.querySelector('.sidebar').getBoundingClientRect().width))
const drag = async (by) => {
  const box = await page.locator('.sidebar-resizer').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + by, box.y + 200, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}
const saved = () => page.evaluate(() => localStorage.getItem('mdwiki:sidebar-width'))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree')

  step('1. 손잡이가 트리 오른쪽 모서리에 있다')
  const start = await width()
  console.log('  처음 너비: ' + start)
  const spot = await page.evaluate(() => {
    const side = document.querySelector('.sidebar').getBoundingClientRect()
    const bar = document.querySelector('.sidebar-resizer').getBoundingClientRect()
    return {
      onEdge: Math.abs(bar.left + bar.width / 2 - side.right) <= 4,
      full: Math.round(bar.height) >= Math.round(side.height) - 2,
      cursor: getComputedStyle(document.querySelector('.sidebar-resizer')).cursor,
    }
  })
  console.log('  ' + JSON.stringify(spot))
  expect('모서리에 걸쳐 있음', spot.onEdge, JSON.stringify(spot))
  expect('위아래로 길게', spot.full, JSON.stringify(spot))
  expect('끌 수 있는 손 모양', spot.cursor === 'col-resize', spot.cursor)

  step('2. 끌면 너비가 따라온다')
  await drag(160)
  const wider = await width()
  console.log(`  ${start} → ${wider}`)
  expect('넓어짐', wider > start + 120, `${start} -> ${wider}`)
  await drag(-260)
  const narrower = await width()
  console.log(`  ${wider} → ${narrower}`)
  expect('좁아짐', narrower < wider - 200, `${wider} -> ${narrower}`)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'resize', '01-narrow.png'),
    clip: { x: 0, y: 0, width: 700, height: 420 } })

  step('3. 너무 좁거나 넓게는 못 간다')
  await drag(-900)
  const min = await width()
  console.log('  한껏 좁혔을 때: ' + min)
  expect('바닥이 있음', min >= 240 && min <= 250, String(min))
  await drag(2000)
  const max = await width()
  console.log('  한껏 넓혔을 때: ' + max)
  expect('천장이 있음', max <= Math.round(1400 * 0.6) + 2, String(max))
  expect('본문이 남아 있음',
    (await page.evaluate(() => Math.round(document.querySelector('.main').getBoundingClientRect().width))) > 400)

  step('4. 새로고침해도 그 너비다')
  await drag(-300)
  const chosen = await width()
  console.log('  고른 너비: ' + chosen + ' · 저장된 값: ' + (await saved()))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree')
  await page.waitForTimeout(400)
  const after = await width()
  console.log('  새로고침 뒤: ' + after)
  expect('그대로 이어짐', Math.abs(after - chosen) <= 2, `${chosen} -> ${after}`)

  step('5. 접었다 펴도 고른 너비를 지킨다')
  await page.click('.sidebar-toggle')
  await page.waitForTimeout(400)
  const railed = await width()
  console.log('  접었을 때: ' + railed)
  expect('접히면 좁아짐', railed <= 80, String(railed))
  expect('접히면 손잡이도 사라짐', (await page.locator('.sidebar-resizer').count()) === 0)
  await page.click('.sidebar-toggle')
  await page.waitForTimeout(400)
  const reopened = await width()
  console.log('  다시 폈을 때: ' + reopened)
  expect('고른 너비로 돌아옴', Math.abs(reopened - chosen) <= 2, `${chosen} -> ${reopened}`)

  step('6. 두 번 누르면 처음 폭으로 돌아간다')
  await page.locator('.sidebar-resizer').dblclick()
  await page.waitForTimeout(400)
  const reset = await width()
  console.log('  두 번 누른 뒤: ' + reset)
  expect('처음 폭', reset === 432, String(reset))

  step('7. 자판으로도 옮길 수 있다')
  await page.locator('.sidebar-resizer').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  const keyed = await width()
  console.log('  화살표 두 번: ' + keyed)
  expect('한 걸음씩 좁아짐', keyed === 432 - 32, String(keyed))
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
  await page.waitForTimeout(300)
  console.log('  Shift + 화살표: ' + (await width()))
  expect('Shift 는 성큼', (await width()) === 432 - 32 + 48, String(await width()))
  const role = await page.evaluate(() => {
    const el = document.querySelector('.sidebar-resizer')
    return { role: el.getAttribute('role'), label: el.getAttribute('aria-label'),
      now: el.getAttribute('aria-valuenow') }
  })
  console.log('  ' + JSON.stringify(role))
  expect('나눔 막대로 알림', role.role === 'separator' && Boolean(role.label), JSON.stringify(role))

  step('8. 콘솔 오류')
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length > 0) fail('콘솔', real.join('\n      '))
  else ok('콘솔 오류 없음')
} catch (e) {
  fail('실행 중단', e.stack ?? e.message)
} finally {
  await browser.close()
}

console.log('\n' + '='.repeat(50))
if (problems.length === 0) console.log('전부 통과')
else { console.log('실패 ' + problems.length + '건'); problems.forEach((p) => console.log(' - ' + p)); process.exitCode = 1 }
