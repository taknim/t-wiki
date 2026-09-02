import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'freshvault'), { recursive: true })
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
  // 텅 빈 새 폴더입니다. 안에 아무것도 없습니다.
  const empty = Object.create(Object.getPrototypeOf(first))
  Object.assign(empty, { kind: 'directory', name: '빈 폴더', _children: new Map() })
  window.__vaults = { first, empty }
  window.__pick = 'first'
  window.showDirectoryPicker = async () => window.__vaults[window.__pick]
})

const openVault = async (which) => {
  await page.evaluate((w) => { window.__pick = w; window.__mockRoot = window.__vaults[w] }, which)
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
const configure = async ({ propagate }) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  const box = page.locator('.checkbox:has-text("반대쪽에서도 지우기") input')
  if ((await box.isChecked()) !== propagate) await box.click()
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
}
const idle = () =>
  page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), { timeout: 30000 })
const sync = async () => {
  await page.waitForFunction(() => !document.querySelector('.toast'), { timeout: 15000 }).catch(() => {})
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await idle()
  await page.waitForTimeout(700)
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 원래 폴더로 저장소를 채워 둔다')
  await openVault('first')
  await configure({ propagate: true })
  await sync()
  const stocked = Object.keys(github.currentFiles()).sort()
  console.log('  저장소: ' + JSON.stringify(stocked))
  expect('저장소에 파일이 쌓임', stocked.length >= 5, JSON.stringify(stocked))

  step('2. 텅 빈 새 폴더를 같은 저장소에 맞춘다')
  await closeVault()
  await openVault('empty')
  await configure({ propagate: true })   // 삭제 전파를 켠 채로 — 가장 위험한 설정
  const before = Object.keys(github.currentFiles()).sort()
  await sync()
  const after = Object.keys(github.currentFiles()).sort()
  console.log('  동기화 뒤 저장소: ' + JSON.stringify(after))
  expect('저장소 파일이 하나도 지워지지 않음',
    JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify(before) + ' -> ' + JSON.stringify(after))

  step('3. 오히려 저장소 내용이 새 폴더로 내려온다')
  const local = await page.evaluate(() => {
    const walk = (dir, prefix, out) => {
      for (const [name, child] of dir._children) {
        const path = prefix ? `${prefix}/${name}` : name
        if (child.kind === 'directory') walk(child, path, out)
        else out.push(path)
      }
      return out
    }
    return walk(window.__mockRoot, '', []).sort()
  })
  console.log('  새 폴더: ' + JSON.stringify(local))
  expect('저장소에 있던 것이 내려옴',
    JSON.stringify(local) === JSON.stringify(before), JSON.stringify(local))

  step('4. 원래 폴더도 그대로다')
  await closeVault()
  await openVault('first')
  await sync()
  expect('저장소가 여전히 온전함',
    JSON.stringify(Object.keys(github.currentFiles()).sort()) === JSON.stringify(before),
    JSON.stringify(Object.keys(github.currentFiles()).sort()))

  step('5. 콘솔 오류')
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
