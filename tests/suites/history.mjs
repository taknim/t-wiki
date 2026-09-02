import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'history'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.route('https://api.github.com/**', github.handler)
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
const openSync = async () => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(400)
}
const configure = async () => {
  await openSync()
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
}
const sync = async () => {
  await page.waitForFunction(() => !document.querySelector('.toast'), { timeout: 15000 }).catch(() => {})
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), { timeout: 30000 })
  await page.waitForTimeout(800)
}
const rows = () => page.evaluate(() =>
  [...document.querySelectorAll('.sync-history li')].map((li) => ({
    when: li.querySelector('.sync-history-when')?.textContent,
    how: li.querySelector('.sync-history-how')?.textContent,
    what: li.querySelector('.sync-history-what')?.textContent,
    commit: li.querySelector('.sync-history-commit')?.textContent ?? null,
    href: li.querySelector('.sync-history-commit')?.getAttribute('href') ?? null,
  })))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 처음에는 기록도 마지막 시각도 없다')
  await openVault('first')
  await openSync()
  expect('마지막 시각이 비어 있음',
    (await page.textContent('.settings-section:last-of-type')).includes('마지막 동기화: 아직 없습니다'))
  expect('기록이 비어 있음', (await page.textContent('.settings-section:last-of-type')).includes('아직 기록이 없습니다'))
  await page.click('.sheet-close')

  step('2. 한 번 맞추면 기록과 시각이 남는다')
  await configure()
  await sync()
  await openSync()
  const first = await rows()
  console.log('  ' + JSON.stringify(first))
  expect('한 줄이 생김', first.length === 1, JSON.stringify(first))
  expect('직접 실행으로 적힘', first[0].how === '직접', String(first[0].how))
  expect('무엇이 오갔는지 적힘', /건/.test(first[0].what ?? ''), String(first[0].what))
  expect('커밋 이름이 붙음', /^[0-9a-f]{7}$/.test(first[0].commit ?? ''), String(first[0].commit))
  // 화면에는 앞 일곱 자만 보이고, 주소에는 온 이름이 들어갑니다.
  const shaInHref = (first[0].href ?? '').split('/').pop() ?? ''
  expect('커밋 주소가 그 커밋을 가리킴',
    (first[0].href ?? '').startsWith('https://github.com/tester/wiki/commit/')
      && shaInHref.startsWith(first[0].commit ?? 'x'),
    `${first[0].commit} / ${first[0].href}`)
  const lastAt = await page.textContent('.settings-section:last-of-type')
  expect('마지막 시각이 채워짐', !lastAt.includes('마지막 동기화: 아직 없습니다'))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'history', '01-history.png'),
    clip: { x: 300, y: 90, width: 820, height: 620 } })
  await page.click('.sheet-close')

  step('3. 아무것도 오가지 않은 회차는 남기지 않는다')
  await sync()
  await openSync()
  const again = await rows()
  console.log('  ' + JSON.stringify(again.map((r) => r.what)))
  expect('줄이 늘지 않음', again.length === 1, JSON.stringify(again))
  await page.click('.sheet-close')

  step('4. 저장소로 가는 단추가 있다')
  await openSync()
  const more = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a.btn')].find((a) => a.textContent.includes('저장소에서 더 보기'))
    return link ? { href: link.getAttribute('href'), target: link.getAttribute('target'), rel: link.getAttribute('rel') } : null
  })
  console.log('  ' + JSON.stringify(more))
  expect('커밋 목록을 가리킴', more?.href === 'https://github.com/tester/wiki/commits/main', String(more?.href))
  expect('새 창에서 열림', more?.target === '_blank', String(more?.target))
  expect('opener 를 넘기지 않음', (more?.rel ?? '').includes('noopener'), String(more?.rel))

  step('5. 하위 폴더를 정하면 그 아래만 가리킨다')
  await page.fill('input[placeholder^="저장소 안 하위 폴더"]', '위키')
  await page.waitForTimeout(400)
  const scoped = await page.evaluate(() =>
    [...document.querySelectorAll('a.btn')].find((a) => a.textContent.includes('저장소에서 더 보기'))?.getAttribute('href'))
  console.log('  ' + scoped)
  expect('하위 폴더가 붙음', scoped === 'https://github.com/tester/wiki/commits/main/%EC%9C%84%ED%82%A4', String(scoped))
  await page.fill('input[placeholder^="저장소 안 하위 폴더"]', '')
  await page.waitForTimeout(300)
  await page.click('.sheet-close')

  step('6. 기록은 폴더마다 따로다')
  await closeVault()
  await openVault('other')
  await openSync()
  expect('다른 폴더에는 기록이 없음',
    (await page.textContent('.settings-section:last-of-type')).includes('아직 기록이 없습니다'))
  await page.click('.sheet-close')
  await closeVault()
  await openVault('first')
  await openSync()
  expect('원래 폴더에는 그대로 있음', (await rows()).length === 1)

  step('7. 기록만 지울 수 있다')
  await page.click('button:has-text("기록 지우기")')
  await page.waitForTimeout(500)
  expect('기록이 비워짐', (await page.textContent('.settings-section:last-of-type')).includes('아직 기록이 없습니다'))
  expect('마지막 시각은 남음',
    !(await page.textContent('.settings-section:last-of-type')).includes('마지막 동기화: 아직 없습니다'))
  await page.click('.sheet-close')

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
