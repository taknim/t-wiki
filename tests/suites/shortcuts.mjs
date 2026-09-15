import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'shortcuts'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1300, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => window.__installMockFs())

// 맥은 ⌘, 그 밖은 Ctrl. 시험대가 어디서 돌든 같은 뜻의 글쇠를 누릅니다.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const press = (combo) => page.keyboard.press(combo.replace('Mod', MOD))
const focused = () => page.evaluate(() => {
  const el = document.activeElement
  return el ? `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}` : null
})
const mode = () => page.evaluate(() =>
  document.querySelector('.mode-switch button.is-active')?.getAttribute('aria-label') ?? null)

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. ⌘/ 와 단추로 단축키 목록이 뜨고, Esc 로 닫힌다')
  await press('Mod+/')
  await page.waitForSelector('.sheet[aria-label="단축키"]', { timeout: 3000 })
  const listed = await page.evaluate(() =>
    [...document.querySelectorAll('.shortcut-row')].map((one) => ({
      label: one.querySelector('.shortcut-label').textContent,
      keys: one.querySelector('.shortcut-keys').textContent,
    })))
  console.log('  ' + listed.length + '줄: ' + listed.slice(0, 5).map((one) => one.keys).join(', ') + ' …')
  for (const want of ['검색으로 가기', '새 문서', '보기 모드 바꾸기', '설정 열기', '이 단축키 목록', '굵게', '지금 바로 저장', '맨 위에 뜬 창 닫기']) {
    expect(`목록에 "${want}"`, listed.some((one) => one.label.includes(want)), JSON.stringify(listed.map((one) => one.label)))
  }
  // ⌘N 은 브라우저가 가로채므로 사연이 적혀 있어야 합니다.
  const newDocRow = listed.find((one) => one.label.startsWith('새 문서'))
  expect('⌘N 사연이 적힘', newDocRow?.label.includes('가로채') ?? false, JSON.stringify(newDocRow))
  await page.locator('.sheet[aria-label="단축키"]').screenshot({ path: join(HERE, '..', 'shots', 'shortcuts', '01-list.png') })
  await press('Escape')
  await page.waitForTimeout(300)
  expect('Esc 로 닫힘', (await page.locator('.sheet[aria-label="단축키"]').count()) === 0)
  await page.click('.topbar button[aria-label="단축키"]')
  await page.waitForSelector('.sheet[aria-label="단축키"]', { timeout: 3000 })
  ok('단추로도 뜸')
  // 같은 글쇠를 다시 누르면 닫힙니다.
  await press('Mod+/')
  await page.waitForTimeout(300)
  expect('⌘/ 를 다시 누르면 닫힘', (await page.locator('.sheet[aria-label="단축키"]').count()) === 0)
  // 단추는 설정 단추 바로 앞에 있습니다.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('.topbar button')].map((one) => one.getAttribute('aria-label') ?? one.textContent.trim()))
  console.log('  머리줄: ' + JSON.stringify(order))
  expect('설정 바로 앞', order.indexOf('단축키') === order.indexOf('설정') - 1, JSON.stringify(order))

  step('2. ⌘P 는 검색 칸으로 간다 — 옆줄이 접혀 있어도')
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForSelector('.main .editor', { timeout: 8000 })
  await page.click('.main .editor')
  expect('편집기에 있음', (await focused()) === 'textarea.editor', String(await focused()))
  await press('Mod+p')
  await page.waitForTimeout(200)
  expect('검색 칸으로 감', (await focused()) === 'input.search-input', String(await focused()))
  // 옆줄을 접고 다시 누릅니다.
  await page.click('.sidebar button[aria-label="사이드바 접기"], .sidebar button[data-tip*="접"]').catch(() => {})
  const railed = await page.evaluate(() => document.querySelector('.sidebar.is-rail') !== null)
  if (railed) {
    await press('Mod+p')
    await page.waitForTimeout(300)
    expect('접힌 옆줄이 펴지고 검색 칸으로 감',
      (await focused()) === 'input.search-input' && !(await page.evaluate(() => document.querySelector('.sidebar.is-rail') !== null)),
      String(await focused()))
  } else {
    ok('(옆줄 접기 단추를 찾지 못해 이 걸음은 건너뜀)')
  }

  step('3. ⌥⌘N 은 새 문서 창을 연다')
  await press('Escape')
  await press('Mod+Alt+n')
  await page.waitForSelector('.dialog', { timeout: 3000 })
  const asked = await page.textContent('.dialog')
  expect('새 문서를 묻는 창', asked.includes('새 문서'), asked.slice(0, 80))
  await press('Escape')
  await page.waitForTimeout(200)

  step('4. ⌘⇧E 는 보기 모드를 돌린다')
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(200)
  const seen = [await mode()]
  for (let at = 0; at < 3; at += 1) {
    await press('Mod+Shift+e')
    await page.waitForTimeout(250)
    seen.push(await mode())
  }
  console.log('  ' + JSON.stringify(seen))
  expect('편집 → 나란히 → 미리보기 → 편집', JSON.stringify(seen) === JSON.stringify(['편집', '나란히', '미리보기', '편집']), JSON.stringify(seen))

  step('5. ⌘, 는 설정을 열고, 편집기의 ⌘B 는 그대로 서식이다')
  await press('Mod+,')
  await page.waitForSelector('.settings-nav', { timeout: 3000 })
  ok('설정이 열림')
  await press('Escape')
  await page.waitForTimeout(300)
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 굵은말')
  await page.keyboard.down('Shift')
  for (let at = 0; at < 3; at += 1) await page.keyboard.press('ArrowLeft')
  await page.keyboard.up('Shift')
  await press('Mod+b')
  await page.waitForTimeout(200)
  const text = await page.evaluate(() => document.querySelector('.main .editor').value)
  expect('⌘B 는 굵게', text.includes('**굵은말**'), text.slice(-40))
  expect('설정이 열리지 않음', (await page.locator('.settings-nav').count()) === 0)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
