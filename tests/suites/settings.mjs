import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'settings'), { recursive: true })
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

const open = async () => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.waitForTimeout(400)
}
const isOpen = () => page.locator('.settings-nav').count().then((n) => n === 1)
const sheetBox = () => page.locator('.sheet').boundingBox()
/** 머리줄을 잡고 끕니다. */
const drag = async (dx, dy) => {
  const head = await page.locator('.sheet-head').boundingBox()
  // 창이 화면 끝으로 밀려 있으면 머리줄 가운데가 화면 밖일 수 있습니다. 보이는 자리를 잡습니다.
  const x = Math.min(Math.max(head.x + 24, 8), 1392)
  const y = Math.min(Math.max(head.y + head.height / 2, 8), 912)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click('.tree-row:has-text("개발 환경")')
  await page.waitForSelector('.editor', { timeout: 8000 })
  await page.waitForTimeout(400)

  step('1. 열어도 뒷 화면이 어두워지지 않는다')
  /*
   * 색이나 글꼴을 바꾸면서 화면이 어떻게 바뀌는지 바로 보여야 합니다.
   * 어둡게 덮으면 고르는 동안에는 결과를 알 수 없습니다.
   */
  await open()
  const backdrop = await page.evaluate(() => {
    const overlay = document.querySelector('.overlay')
    return {
      background: getComputedStyle(overlay).backgroundColor,
      covers: Math.round(overlay.getBoundingClientRect().width),
      shadowed: getComputedStyle(document.querySelector('.sheet')).boxShadow !== 'none',
    }
  })
  console.log('  ' + JSON.stringify(backdrop))
  expect('덮개가 투명함', /rgba\(0, 0, 0, 0\)|transparent/.test(backdrop.background),
    backdrop.background)
  expect('그래도 화면을 덮고 있음', backdrop.covers === 1400, String(backdrop.covers))
  expect('떠 있는 것은 그림자로 알림', backdrop.shadowed, '그림자가 없습니다')
  await page.screenshot({ path: join(HERE, '..', 'shots', 'settings', '01-clear.png'),
    clip: { x: 0, y: 0, width: 1400, height: 560 } })

  step('2. 뒤쪽은 눌리지 않는다')
  const before = await page.textContent('.info-path')
  const covered = await page.evaluate(() => {
    // 트리의 다른 줄이 있던 자리를 짚어, 지금 그 자리에 무엇이 있는지 물어봅니다.
    const row = [...document.querySelectorAll('.tree-row')].find((n) => n.textContent.includes('회고'))
    const box = row.getBoundingClientRect()
    const at = document.elementFromPoint(box.x + 40, box.y + box.height / 2)
    return { tag: at?.className ?? null, inTree: Boolean(at?.closest('.tree')) }
  })
  console.log('  ' + JSON.stringify(covered))
  expect('그 자리는 덮개가 차지함', !covered.inTree, JSON.stringify(covered))
  const after = await page.textContent('.info-path')
  expect('고른 문서도 그대로', after === before, `${before} -> ${after}`)

  step('3. 머리줄을 끌면 창이 옮겨진다')
  const start = await sheetBox()
  await drag(-180, 90)
  const moved = await sheetBox()
  console.log(`  ${Math.round(start.x)},${Math.round(start.y)} → ${Math.round(moved.x)},${Math.round(moved.y)}`)
  expect('왼쪽으로 옮겨짐', Math.round(moved.x - start.x) === -180, String(moved.x - start.x))
  expect('아래로 옮겨짐', Math.round(moved.y - start.y) === 90, String(moved.y - start.y))
  expect('끄는 동안에도 열려 있음', await isOpen(), '창이 닫혔습니다')
  await page.screenshot({ path: join(HERE, '..', 'shots', 'settings', '02-moved.png'),
    clip: { x: 0, y: 0, width: 1400, height: 760 } })

  step('4. 화면 밖으로는 달아나지 않는다')
  await drag(-3000, -3000)
  const far = await sheetBox()
  console.log(`  ${Math.round(far.x)},${Math.round(far.y)}`)
  expect('머리줄이 위로 사라지지 않음', far.y >= -1, String(far.y))
  expect('왼쪽으로도 조금은 남음', far.x + far.width >= 79, String(far.x + far.width))
  await drag(3000, 3000)
  const back = await sheetBox()
  console.log(`  ${Math.round(back.x)},${Math.round(back.y)}`)
  expect('아래로도 조금은 남음', back.y <= 920 - 79, String(back.y))
  expect('오른쪽으로도 조금은 남음', back.x <= 1400 - 79, String(back.x))

  step('5. Esc 로 닫힌다')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect('닫힘', !(await isOpen()), '아직 열려 있습니다')

  step('6. 다시 열면 가운데에서 시작한다')
  await open()
  const fresh = await sheetBox()
  console.log(`  ${Math.round(fresh.x)},${Math.round(fresh.y)}`)
  expect('가운데로 돌아옴', Math.abs(fresh.x + fresh.width / 2 - 700) < 2,
    String(fresh.x + fresh.width / 2))

  step('7. 바깥을 누르면 닫힌다')
  await page.mouse.click(40, 800)
  await page.waitForTimeout(400)
  expect('닫힘', !(await isOpen()), '아직 열려 있습니다')

  step('8. 확인 창이 떠 있으면 Esc 가 설정을 닫지 않는다')
  /*
   * 뒤에 있는 설정 창이 먼저 닫히면 무엇에 답하는 물음인지 알 수 없게 됩니다.
   */
  await open()
  await page.click('button:has-text("설정 내보내기")')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const both = await page.evaluate(() => ({
    dialog: document.querySelectorAll('.dialog').length,
    settings: document.querySelectorAll('.settings-nav').length,
  }))
  console.log('  ' + JSON.stringify(both))
  expect('설정 창은 그대로', both.settings === 1, JSON.stringify(both))
  await page.click('.dialog button:has-text("취소")')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect('확인 창을 치운 뒤에는 닫힘', !(await isOpen()), '아직 열려 있습니다')

  step('9. 닫기 단추는 끌기에 잡히지 않는다')
  await open()
  await page.click('.sheet-close')
  await page.waitForTimeout(400)
  expect('단추로도 닫힘', !(await isOpen()), '아직 열려 있습니다')
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
