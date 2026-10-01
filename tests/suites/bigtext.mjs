import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'bigtext'), { recursive: true })
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
/*
 * 아주 큰 글 둘을 지어 둡니다. 하나는 **크기**로, 하나는 **줄 수**로 자를 넘깁니다.
 * 자를 넘지 않는 글도 하나 두어, 평소 길이 그대로인지 함께 봅니다.
 */
await page.addInitScript(() => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const put = (name, text) => root._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: new Blob([text]), _lastModified: Date.now() }))
  const line = '2026-09-30 12:00:00 INFO  [worker-12] 처리 완료 id=1234567 elapsed=42ms\n'
  put('큰 기록.txt', line.repeat(Math.ceil(6 * 1024 * 1024 / line.length)))
  // 크기는 작지만 줄이 많은 글. 줄마다 요소가 서는 자리에서는 이쪽이 먼저 무너집니다.
  put('잔줄.txt', '가\n'.repeat(5000))
  put('작은 기록.txt', line.repeat(50))
  put('작은 표.csv', 'id,name\n1,하나\n2,둘\n')
})

const open = async (name) => {
  await page.click(`.tree-row:has-text("${name}") .tree-name`)
  await page.waitForTimeout(600)
}
const shape = () => page.evaluate(() => ({
  큰모드: document.querySelector('.main .bigtext') !== null,
  글상자: document.querySelector('.main textarea') !== null,
  줄번호: document.querySelector('.main .editor-gutter') !== null,
  미리보기: document.querySelector('.main .text-preview') !== null,
  보기모드단추: document.querySelector('.doc-head .mode-switch') !== null,
  딱지: document.querySelector('.bigtext-badge')?.textContent ?? null,
}))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  // 줄 번호와 커서 위치를 켜 둡니다. 큰 글에서는 그래도 서지 않아야 합니다.
  await page.evaluate(() => {
    const look = JSON.parse(localStorage.getItem('mdwiki:theme') ?? '{}')
    localStorage.setItem('mdwiki:theme', JSON.stringify({ ...look, lineNumbers: true, caretPosition: true }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  step('1. 자를 넘지 않는 글은 하던 대로 고친다')
  await open('작은 기록.txt')
  const small = await shape()
  console.log('  ' + JSON.stringify(small))
  expect('글상자로 열림', small.글상자 && !small.큰모드, JSON.stringify(small))
  expect('줄 번호가 섬', small.줄번호, JSON.stringify(small))

  step('2. 크기가 자를 넘으면 보는 자리로 연다')
  await open('큰 기록.txt')
  const big = await shape()
  console.log('  ' + JSON.stringify(big))
  expect('대용량 모드로 열림', big.큰모드, JSON.stringify(big))
  expect('고칠 수 없음(글상자가 없음)', big.글상자 === false, JSON.stringify(big))
  expect('줄 번호를 세우지 않음', big.줄번호 === false, JSON.stringify(big))
  expect('미리보기를 그리지 않음', big.미리보기 === false, JSON.stringify(big))
  expect('딱지가 떠 있음', big.딱지 === '대용량 파일 모드', String(big.딱지))
  // 글은 자르지 않고 다 담습니다. 보려고 연 사람에게 "뒤는 없습니다" 라고 할 수 없습니다.
  const whole = await page.evaluate(() => document.querySelector('.bigtext-body').textContent.length)
  expect('글을 자르지 않음', whole > 5 * 1024 * 1024, String(whole))
  // 커서 위치 표시도 꺼져 있어야 합니다. 글상자가 없으니 적을 자리도 없습니다.
  const caret = await page.evaluate(() => document.body.textContent.includes('행 1 열 1'))
  expect('커서 위치를 적지 않음', caret === false, String(caret))

  step('3. 딱지를 누르면 무엇이 꺼졌는지 알려 준다')
  const dim = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.bigtext-badge')).opacity))
  expect('반쯤 비침', Math.abs(dim - 0.5) < 0.01, String(dim))
  await page.click('.bigtext-badge')
  await page.waitForTimeout(200)
  const told = await page.evaluate(() => {
    const box = document.querySelector('.bigtext-told')
    return box ? {
      글: box.textContent.replace(/\s+/g, ' '),
      또렷: Number(getComputedStyle(document.querySelector('.bigtext-badge')).opacity),
    } : null
  })
  console.log('  ' + JSON.stringify(told?.글.slice(0, 80)))
  expect('눌러서 폄', told !== null)
  expect('펴면 또렷해짐', told.또렷 === 1, String(told?.또렷))
  for (const word of ['고칠 수 없습니다', '미리보기', '줄 번호', '커서 위치']) {
    expect(`무엇이 꺼졌는지 적음 — ${word}`, told.글.includes(word), told.글.slice(0, 120))
  }
  expect('자가 적힘', told.글.includes('4,000줄'), told.글.slice(0, 120))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'bigtext', '01-mode.png'),
    clip: { x: 430, y: 40, width: 870, height: 420 } })
  await page.click('.bigtext-badge')
  await page.waitForTimeout(200)
  expect('다시 누르면 접힘', (await page.locator('.bigtext-told').count()) === 0)

  step('4. 크기가 작아도 줄이 많으면 대용량이다')
  await open('잔줄.txt')
  const many = await shape()
  console.log('  ' + JSON.stringify(many))
  expect('줄 수로도 걸림', many.큰모드 && many.글상자 === false, JSON.stringify(many))

  step('5. 작은 표는 그대로 그려 준다')
  await open('작은 표.csv')
  const table = await shape()
  console.log('  ' + JSON.stringify(table))
  expect('미리보기가 그대로', table.미리보기 && table.큰모드 === false, JSON.stringify(table))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
