import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []

/*
 * 기기 둘. 저장소 하나를 두 브라우저 자리가 나눠 씁니다. 저마다 제 폴더를 갖고,
 * 같은 문서를 담고 시작해 한쪽씩 즐겨찾기를 담습니다.
 */
const openDevice = async (label) => {
  const context = await browser.newContext({ viewport: { width: 1300, height: 860 } })
  await context.route('https://api.github.com/**', github.handler)
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`))
  await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
  await page.addInitScript(() => {
    window.__installMockFs()
    window.showDirectoryPicker = async () => window.__mockRoot
  })
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForTimeout(300)
  return page
}
const sync = async (page) => {
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), undefined, { timeout: 30000 })
  await page.waitForTimeout(500)
  if (await page.locator('.sheet-close').count()) await page.click('.sheet-close')
  await page.waitForTimeout(200)
}
const star = async (page, name) => {
  await page.click('.sidebar-tablist button:has-text("폴더")')
  // 회사 폴더 안의 것은 펴야 보입니다.
  if (!(await page.locator(`.tree-row:has-text("${name}")`).count())) {
    await page.click('.tree-row:has-text("회사") .tree-caret')
    await page.waitForTimeout(300)
  }
  await page.hover(`.tree-row:has-text("${name}")`)
  await page.click(`.tree-row:has-text("${name}") .tree-tools button[aria-label="즐겨찾기에 담기"]`)
  await page.waitForTimeout(400)
}
const favorites = async (page) => {
  await page.click('.sidebar-tablist button:has-text("즐겨찾기")')
  await page.waitForTimeout(300)
  return page.evaluate(() => [...document.querySelectorAll('.favorites-name')].map((one) => one.textContent))
}
const fileOn = (page) => page.evaluate(() => window.__vaultText('_t-wiki.favorites.json'))
const treeNames = (page) => page.evaluate(() => [...document.querySelectorAll('.tree-row .tree-name')].map((one) => one.textContent))

try {
  step('1. 두 기기가 저마다 다른 것을 담는다')
  const pc = await openDevice('PC')
  const phone = await openDevice('손전화')
  await star(pc, '개발 환경')
  await star(phone, '휴가 정책')
  console.log('  PC: ' + JSON.stringify(await favorites(pc)) + ', 손전화: ' + JSON.stringify(await favorites(phone)))

  step('2. PC 가 먼저 올리고, 손전화가 뒤이어 동기화하면 둘이 합쳐진다')
  await sync(pc)
  await sync(phone)
  const onPhone = await favorites(phone)
  console.log('  손전화: ' + JSON.stringify(onPhone))
  expect('손전화에 둘 다 있음', onPhone.includes('휴가 정책.md') && onPhone.includes('개발 환경.md'), JSON.stringify(onPhone))
  // 여느 파일처럼 부딪힘으로 다루면 사본이 생깁니다. 즐겨찾기 파일에는 사본이 있으면 안 됩니다.
  const stray = (await treeNames(phone)).filter((one) => one.includes('favorites'))
  expect('사본이 생기지 않음', stray.length === 0, JSON.stringify(stray))

  step('3. PC 가 다시 동기화하면 PC 에도 둘 다 있다')
  await sync(pc)
  const onPc = await favorites(pc)
  console.log('  PC: ' + JSON.stringify(onPc))
  expect('PC 에도 둘 다 있음', onPc.includes('개발 환경.md') && onPc.includes('휴가 정책.md'), JSON.stringify(onPc))
  const pcFile = await fileOn(pc)
  const phoneFile = await fileOn(phone)
  expect('파일도 같음', pcFile === phoneFile, `${pcFile} vs ${phoneFile}`)

  step('4. 한쪽에서 빼면 다음 동기화에서 저쪽도 빠진다 (부딪힘이 아닐 때는 그대로 따라감)')
  await pc.click('.sidebar-tablist button:has-text("즐겨찾기")')
  await pc.click('.favorites-drop[aria-label="즐겨찾기에서 빼기: 휴가 정책.md"]')
  await pc.waitForTimeout(400)
  await sync(pc)
  await sync(phone)
  const after = await favorites(phone)
  console.log('  손전화: ' + JSON.stringify(after))
  expect('저쪽도 빠짐', after.includes('개발 환경.md') && !after.includes('휴가 정책.md'), JSON.stringify(after))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  if (errors.length) fail('화면 오류', errors.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
