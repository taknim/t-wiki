import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'code'), { recursive: true })
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
await page.addInitScript(() => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const put = (name, data) => root._children.set(name, Object.assign(Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: data, _lastModified: Date.now() }))
  put('질의.sql', "SELECT id, name FROM users WHERE created_at > '2026-01-01' ORDER BY id;\n")
  put('도구.py', 'def hello(name):\n    return f"hi {name}"\n')
  put('설정.toml', '[server]\nport = 8080\n')
})

const drop = (name, text) => page.setInputFiles('#add-files', [
  { name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') },
])
const preview = () => page.evaluate(() => ({
  editor: document.querySelector('.main .editor') !== null,
  code: document.querySelector('.main .code-preview') !== null,
  keywords: document.querySelectorAll('.main .code-preview .hljs-keyword').length,
  strings: document.querySelectorAll('.main .code-preview .hljs-string').length,
  modes: document.querySelectorAll('.mode-switch button').length,
  text: document.querySelector('.main .code-preview')?.textContent ?? '',
}))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  /*
   * 코드는 본문 글줄 폭에 묶지 않고 칸 전체를 씁니다. 묶어 두었더니 마크다운 문서의
   * 한 문단처럼 보여, 파일을 보고 있다는 느낌이 들지 않았습니다.
   */
  step('0. 코드 칸은 쪽 전체를 쓴다')
  await page.click('.tree-row:has-text("질의.sql") .tree-name')
  await page.waitForSelector('.main .editor, .main .preview', { timeout: 8000 })
  await page.click('.mode-switch button[aria-label="미리보기"]')
  await page.waitForTimeout(900)
  const wide = await page.evaluate(() => {
    const pre = document.querySelector('.code-preview')
    const pane = document.querySelector('.main')
    const look = getComputedStyle(pre)
    return {
      코드: Math.round(pre.getBoundingClientRect().width),
      칸: Math.round(pane.getBoundingClientRect().width),
      테두리: look.borderTopWidth,
    }
  })
  console.log('  ' + JSON.stringify(wide))
  expect('칸 전체를 씀', wide.코드 === wide.칸, JSON.stringify(wide))
  expect('테두리로 가두지 않음', wide.테두리 === '0px', wide.테두리)
  // 아래 걸음들은 편집 화면에서 시작합니다. 보기 모드를 되돌려 놓습니다.
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(400)

  step('1. SQL 이 트리에 보이고, 편집기와 문법 강조 미리보기가 나란히 선다')
  expect('트리에 있음', (await page.locator('.tree-row:has-text("질의.sql")').count()) === 1)
  await page.click('.tree-row:has-text("질의.sql") .tree-name')
  await page.waitForSelector('.main .editor', { timeout: 8000 })
  await page.click('.mode-switch button[aria-label="나란히"]')
  await page.waitForTimeout(1500)
  const sql = await preview()
  console.log('  ' + JSON.stringify({ ...sql, text: sql.text.slice(0, 40) }))
  expect('편집기와 미리보기가 함께', sql.editor && sql.code && sql.modes === 3, JSON.stringify(sql))
  expect('SQL 예약어가 강조됨', sql.keywords >= 4 && sql.strings >= 1, JSON.stringify(sql))
  expect('실행하지 않고 글 그대로', sql.text.includes('SELECT id, name FROM users'), sql.text)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'code', '01-sql.png'), clip: { x: 440, y: 60, width: 860, height: 260 } })

  step('2. 고쳐 쓰면 저장되고 미리보기도 따라온다')
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' LIMIT 10;')
  await page.waitForTimeout(1500)
  const saved = await page.evaluate(() => window.__vaultText('질의.sql'))
  expect('파일에 저장됨', saved.includes('LIMIT 10'), saved)
  expect('미리보기도 바뀜', (await preview()).text.includes('LIMIT 10'))

  step('3. 다른 언어도 제 강조기로 읽는다')
  await page.click('.tree-row:has-text("도구.py") .tree-name')
  await page.waitForTimeout(1200)
  const py = await preview()
  expect('파이썬도 강조됨', py.code && py.keywords >= 2, JSON.stringify(py))
  await page.click('.tree-row:has-text("설정.toml") .tree-name')
  await page.waitForTimeout(1200)
  const toml = await preview()
  expect('toml 도 강조됨(ini 로)', toml.code && (await page.evaluate(() => document.querySelectorAll('.main .code-preview .hljs-section, .main .code-preview .hljs-attr').length)) >= 1, JSON.stringify(toml))

  step('4. 파일 추가로도 넣을 수 있다')
  const accept = await page.getAttribute('#add-files', 'accept')
  expect('.sql 이 고르기 목록에 있음', (accept ?? '').split(',').includes('.sql'), String(accept))
  await drop('새 질의.sql', 'SELECT 1;\n')
  await page.waitForTimeout(800)
  expect('트리에 줄이 생김', (await page.locator('.tree-row:has-text("새 질의.sql")').count()) === 1)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
