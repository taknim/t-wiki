import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'favorites'), { recursive: true })
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
  const first = window.__mockRoot
  const other = Object.create(Object.getPrototypeOf(first))
  Object.assign(other, { kind: 'directory', name: '다른 폴더', _children: new Map() })
  window.__vaults = { first, other }
  window.__pick = 'first'
  window.showDirectoryPicker = async () => window.__vaults[window.__pick]
})

const openVault = async (w) => {
  await page.evaluate((x) => { window.__pick = x; window.__mockRoot = window.__vaults[x] }, w)
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
}
const closeVault = async () => {
  if (await page.locator('.sheet-close').count()) { await page.click('.sheet-close'); await page.waitForTimeout(200) }
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const star = async (label) => {
  await page.hover(`.tree-row:has-text("${label}")`)
  await page.click(`.tree-row:has-text("${label}") .tree-tools button[aria-label^="즐겨찾기"]`)
  await page.waitForTimeout(400)
}
const listed = () => page.evaluate(() =>
  [...document.querySelectorAll('.favorites-name')].map((n) => n.textContent))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await openVault('first')

  step('1. 담아 둔 것이 없으면 아무것도 그리지 않는다')
  expect('빈 칸이 없음', (await page.locator('.favorites').count()) === 0)

  step('2. 문서를 담으면 위쪽에 나온다')
  await star('개발 환경')
  const one = await listed()
  console.log('  ' + JSON.stringify(one))
  expect('목록에 나옴', JSON.stringify(one) === '["개발 환경.md"]', JSON.stringify(one))
  expect('트리 줄에도 별이 붙음',
    (await page.locator('.tree-row:has-text("개발 환경") .tree-star').count()) === 1)

  step('3. 폴더도 담긴다')
  await star('회사')
  const two = await listed()
  console.log('  ' + JSON.stringify(two))
  expect('둘이 됨', two.length === 2, JSON.stringify(two))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'favorites', '01-list.png'),
    clip: { x: 0, y: 40, width: 460, height: 320 } })

  step('4. 눌러서 바로 연다')
  await page.click('.favorites-item:has-text("개발 환경.md")')
  await page.waitForSelector('.editor', { timeout: 8000 })
  expect('그 문서가 열림', (await page.textContent('.info-path')).trim() === '/개발 환경.md',
    await page.textContent('.info-path'))
  await page.click('.favorites-item:has-text("회사")')
  await page.waitForFunction(() => document.querySelector('.info-kind')?.textContent === '폴더',
    { timeout: 8000 })
  expect('폴더도 열림', (await page.textContent('.info-path')).trim() === '/회사',
    await page.textContent('.info-path'))

  step('5. 새로고침해도 남는다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault('first')
  const kept = await listed()
  console.log('  ' + JSON.stringify(kept))
  expect('그대로 있음', kept.length === 2, JSON.stringify(kept))

  step('6. 폴더마다 따로다')
  await closeVault()
  await openVault('other')
  expect('다른 폴더에는 없음', (await page.locator('.favorites').count()) === 0)
  await closeVault()
  await openVault('first')
  expect('원래 폴더에는 그대로', (await listed()).length === 2)

  step('7. 이름을 바꾸면 따라간다')
  await page.hover('.tree-row:has-text("개발 환경")')
  await page.click('.tree-row:has-text("개발 환경") .tree-tools button[aria-label="이름 바꾸기"]')
  await page.waitForSelector('.dialog-input')
  await page.fill('.dialog-input', '개발 안내.md')
  await page.click('.dialog button:has-text("바꾸기")')
  await page.waitForTimeout(800)
  const renamed = await listed()
  console.log('  ' + JSON.stringify(renamed))
  expect('바뀐 이름으로 남음', renamed.includes('개발 안내.md'), JSON.stringify(renamed))
  expect('옛 이름은 사라짐', !renamed.includes('개발 환경.md'), JSON.stringify(renamed))

  step('8. 지우면 함께 빠진다')
  await page.hover('.tree-row:has-text("개발 안내")')
  await page.click('.tree-row:has-text("개발 안내") .tree-tools button[aria-label="삭제"]')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("삭제")')
  await page.waitForTimeout(800)
  const afterDelete = await listed()
  console.log('  ' + JSON.stringify(afterDelete))
  expect('목록에서 빠짐', !afterDelete.includes('개발 안내.md'), JSON.stringify(afterDelete))

  step('9. 목록에서 바로 뺄 수 있다')
  await page.click('.favorites-drop')
  await page.waitForTimeout(400)
  expect('마지막 하나를 빼면 칸이 사라짐', (await page.locator('.favorites').count()) === 0)
  expect('트리의 별도 꺼짐', (await page.locator('.tree-star').count()) === 0)

  step('10. 콘솔 오류')
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
