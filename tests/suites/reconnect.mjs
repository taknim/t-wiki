import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'reconnect'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
/*
 * 새로 고침을 흉내 냅니다. 흉내 폴더는 새로 고침마다 새로 만들어지므로, 폴더 안에 있던
 * 즐겨찾기 파일은 sessionStorage 에 적어 두었다가 다시 심고, 권한은 안드로이드처럼
 * 'prompt' 로 시작하게 합니다.
 */
await page.addInitScript(() => {
  window.__restoreHandle = true
  window.__permission = sessionStorage.getItem('perm') ?? 'granted'
  window.__installMockFs()
  const favorites = sessionStorage.getItem('favorites')
  if (favorites) {
    const root = window.__mockRoot
    const sample = root._children.get('개발 환경.md')
    root._children.set('_t-wiki.favorites.json', Object.assign(Object.create(Object.getPrototypeOf(sample)),
      { kind: 'file', name: '_t-wiki.favorites.json', _data: favorites, _lastModified: Date.now() }))
  }
})

const favorites = async () => {
  await page.click('.sidebar-tablist button:has-text("즐겨찾기")')
  await page.waitForTimeout(300)
  return page.evaluate(() => [...document.querySelectorAll('.favorites-name')].map((one) => one.textContent))
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  step('1. 즐겨찾기를 담아 파일에 적어 둔다')
  await page.hover('.tree-row:has-text("개발 환경")')
  await page.click('.tree-row:has-text("개발 환경") .tree-tools button[aria-label="즐겨찾기에 담기"]')
  await page.waitForTimeout(500)
  const written = await page.evaluate(() => window.__vaultText('_t-wiki.favorites.json'))
  expect('파일에 적힘', (written ?? '').includes('개발 환경.md'), String(written))
  await page.evaluate((body) => {
    sessionStorage.setItem('favorites', body)
    sessionStorage.setItem('perm', 'prompt')
  }, written)

  /*
   * 안드로이드 크롬은 새로 고침 뒤 손잡이는 돌려주되 권한은 다시 묻습니다.
   * 손잡이가 붙자마자 즐겨찾기 파일을 읽으면 권한이 없어 실패하고, "다시 열기"를 누른 뒤에도
   * 다시 읽지 않아 즐겨찾기가 늘 비어 보였습니다.
   */
  step('2. 새로 고침하면 "다시 열기" 화면이 먼저 뜬다')
  await page.evaluate(() => location.reload())
  await page.waitForSelector('button:has-text("다시 열기")', { timeout: 10000 })
  const gate = await page.evaluate(() => ({
    tree: document.querySelector('.tree') !== null,
    permission: window.__permission,
  }))
  expect('권한이 없어 트리는 아직 없음', !gate.tree && gate.permission === 'prompt', JSON.stringify(gate))

  step('3. 다시 열기를 누르면 즐겨찾기가 파일에서 들어온다')
  await page.click('button:has-text("다시 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(600)
  const listed = await favorites()
  console.log('  ' + JSON.stringify(listed))
  expect('담아 둔 것이 보임', listed.includes('개발 환경.md'), JSON.stringify(listed))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'reconnect', '01-favorites.png'),
    clip: { x: 0, y: 0, width: 460, height: 400 } })
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
