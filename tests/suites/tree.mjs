import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'tree'), { recursive: true })
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

/** 지금 트리와 화면이 어떤 꼴인지. */
const shape = () => page.evaluate(() => ({
  rows: [...document.querySelectorAll('.tree-row:not(.tree-root) .tree-name')]
    .map((one) => one.textContent),
  selected: [...document.querySelectorAll('.tree-row.is-selected .tree-name')]
    .map((one) => one.textContent),
  open: [...document.querySelectorAll('.tree-caret.is-open')].length,
  folderView: document.querySelectorAll('.folder-view').length,
  path: document.querySelector('.info-path')?.textContent ?? null,
}))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  /*
   * 아무것도 고른 적이 없는 브라우저입니다. 이 걸음만은 폴더를 열기 전에 봅니다.
   * 뒤 걸음이 탭을 옮겨 놓으면 그 값이 남아, 처음 온 사람의 화면을 다시 볼 수 없습니다.
   */
  step('1. 처음 오면 폴더 탭이, 그것도 앞자리에 있다')
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
  const tabs = await page.evaluate(() => ({
    order: [...document.querySelectorAll('.sidebar-tablist button')].map((one) => one.textContent),
    picked: document.querySelector('.sidebar-tablist button[aria-selected="true"]')?.textContent ?? null,
  }))
  console.log('  ' + JSON.stringify(tabs))
  expect('폴더가 앞에 섬', tabs.order.join() === '폴더,즐겨찾기', JSON.stringify(tabs))
  expect('폴더 탭이 펴져 있음', tabs.picked === '폴더', JSON.stringify(tabs))

  step('2. 폴더를 처음 누르면 고르기만 하고 펴지지 않는다')
  const before = await shape()
  await page.click('.tree-row:has-text("회사")')
  await page.waitForTimeout(400)
  const picked = await shape()
  console.log('  ' + JSON.stringify(picked))
  expect('안이 펴지지 않음', picked.rows.join() === before.rows.join(), JSON.stringify(picked.rows))
  expect('그 폴더가 골라짐', picked.selected.join() === '회사', JSON.stringify(picked))
  expect('오른쪽에 폴더 화면이 뜸', picked.folderView === 1, JSON.stringify(picked))
  expect('표시줄도 그 폴더', picked.path === '/회사', String(picked.path))

  step('3. 골라 둔 폴더를 다시 누르면 그때 펴진다')
  await page.click('.tree-row:has-text("회사")')
  await page.waitForTimeout(400)
  const opened = await shape()
  console.log('  ' + JSON.stringify(opened.rows))
  expect('안이 보임', opened.rows.includes('온보딩.md'), JSON.stringify(opened.rows))
  expect('고른 것은 그대로', opened.selected.join() === '회사', JSON.stringify(opened))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'tree', '01-open.png'),
    clip: { x: 0, y: 40, width: 440, height: 340 } })

  await page.click('.tree-row:has-text("회사")')
  await page.waitForTimeout(400)
  const closed = await shape()
  expect('한 번 더 누르면 접힘', !closed.rows.includes('온보딩.md'), JSON.stringify(closed.rows))

  step('4. 꺾쇠는 고르지 않고 펴고 접기만 한다')
  await page.click('.tree-row:has-text("개발 환경")')
  await page.waitForSelector('.editor', { timeout: 8000 })
  await page.waitForTimeout(400)
  await page.click('.tree-row:has-text("회고") .tree-caret')
  await page.waitForTimeout(400)
  const caret = await shape()
  console.log('  ' + JSON.stringify(caret))
  expect('폴더가 펴짐', caret.rows.includes('2026-08.md'), JSON.stringify(caret.rows))
  expect('고른 것은 그대로 문서', caret.selected.join() === '개발 환경.md', JSON.stringify(caret))
  expect('폴더 화면으로 바뀌지 않음', caret.folderView === 0, JSON.stringify(caret))
  await page.click('.tree-row:has-text("회고") .tree-caret')
  await page.waitForTimeout(400)
  const shut = await shape()
  expect('꺾쇠로 접기도 됨', !shut.rows.includes('2026-08.md'), JSON.stringify(shut.rows))
  expect('여전히 문서를 보고 있음', shut.selected.join() === '개발 환경.md', JSON.stringify(shut))

  step('5. 문서 줄은 한 번에 열린다')
  await page.click('.tree-row:has-text("회사") .tree-caret')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("온보딩")')
  await page.waitForTimeout(500)
  const doc = await shape()
  console.log('  ' + JSON.stringify(doc.path))
  expect('한 번 눌러 열림', doc.path === '/회사/온보딩.md', String(doc.path))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
