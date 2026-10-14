import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'plaintext'), { recursive: true })
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
 * 그릴 것이 따로 없는 글들. 읽으러 여는 파일이라 **읽는 자리**로 열려야 합니다.
 * 표(csv)와 코드(py)도 함께 두어, 이쪽은 나란히가 그대로 있는지 견줍니다.
 */
await page.addInitScript(() => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const put = (name, text) => root._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: new Blob([text]), _lastModified: Date.now() }))
  put('회의 메모.txt', '첫 줄입니다.\n둘째 줄입니다.\n셋째 줄입니다.\n')
  put('어제 기록.log', '2026-10-13 09:00:00 INFO  문을 열었습니다\n2026-10-13 09:00:01 WARN  느립니다\n')
  put('작은 표.csv', 'id,name\n1,하나\n2,둘\n')
  put('도구.py', 'def hello(name):\n    return f"hi {name}"\n')
})

const open = async (name) => {
  await page.click(`.tree-row:has-text("${name}") .tree-name`)
  await page.waitForTimeout(500)
}
/** 지금 열린 글이 어떤 자리로 서 있는지. */
const shape = () => page.evaluate(() => ({
  글상자: document.querySelector('.main textarea') !== null,
  보기: document.querySelector('.main .plain-preview') !== null,
  모드: [...document.querySelectorAll('.doc-head .mode-switch button')].map((one) => one.textContent),
  고른모드: document.querySelector('.doc-head .mode-switch button[aria-pressed="true"]')?.textContent ?? null,
  글: document.querySelector('.main .plain-preview')?.textContent
    ?? document.querySelector('.main textarea')?.value ?? '',
}))
const pick = async (name) => {
  await page.click(`.doc-head .mode-switch button:has-text("${name}")`)
  await page.waitForTimeout(400)
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  step('1. 그냥 글은 읽는 자리로 열린다')
  await open('회의 메모.txt')
  const first = await shape()
  console.log('  ' + JSON.stringify(first))
  expect('글상자가 먼저 뜨지 않음', first.글상자 === false, JSON.stringify(first))
  expect('글이 그대로 보임', first.글.includes('둘째 줄입니다.'), first.글.slice(0, 60))
  expect('보기로 열림', first.고른모드 === '미리보기', String(first.고른모드))
  /*
   * 나란히는 두지 않습니다. 양쪽에 같은 글이 서므로 나눌 뜻이 없고, 읽을 자리만 반으로 줄어듭니다.
   */
  expect('고를 수 있는 모드는 둘',
    JSON.stringify(first.모드) === JSON.stringify(['편집', '미리보기']), JSON.stringify(first.모드))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'plaintext', '01-read.png'),
    clip: { x: 430, y: 40, width: 870, height: 360 } })

  step('2. 읽는 자리에서는 글쇠를 쳐도 글이 바뀌지 않는다')
  // 사람이 겪은 그대로입니다. 읽다가 아무 데나 눌러 치면 내용이 달라져 있었습니다.
  await page.click('.main .plain-preview')
  await page.keyboard.type('지워 보기')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(400)
  const after = await shape()
  console.log('  ' + JSON.stringify(after))
  expect('글이 그대로', after.글 === first.글, after.글.slice(0, 80))
  const dirty = await page.evaluate(() => document.body.textContent.includes('저장 안 됨'))
  expect('고친 것으로 치지 않음', dirty === false, String(dirty))

  step('3. 편집을 고르면 그때부터 고칠 수 있다')
  await pick('편집')
  const editing = await shape()
  console.log('  ' + JSON.stringify(editing))
  expect('글상자가 섬', editing.글상자, JSON.stringify(editing))
  expect('보기는 접힘', editing.보기 === false, JSON.stringify(editing))
  await page.click('.main textarea')
  await page.keyboard.press('End')
  await page.keyboard.type('\n넷째 줄을 더했습니다.')
  await page.waitForTimeout(1500)
  const saved = await page.evaluate(async () => {
    const handle = await window.__mockRoot.getFileHandle('회의 메모.txt')
    return (await handle.getFile()).text()
  })
  expect('고친 글이 파일에 들어감', saved.includes('넷째 줄을 더했습니다.'), saved.slice(-60))

  step('4. 고른 모드는 다음 파일에도 따라온다')
  await open('어제 기록.log')
  const log = await shape()
  console.log('  ' + JSON.stringify(log))
  expect('편집인 채로 열림', log.글상자 && log.고른모드 === '편집', JSON.stringify(log))
  await pick('미리보기')
  const back = await shape()
  expect('다시 읽는 자리로', back.글상자 === false && back.보기, JSON.stringify(back))
  expect('기록도 글 그대로 보임', back.글.includes('WARN  느립니다'), back.글.slice(0, 80))

  step('5. 표와 코드는 나란히가 그대로다')
  await open('작은 표.csv')
  const table = await page.evaluate(() =>
    [...document.querySelectorAll('.doc-head .mode-switch button')].map((one) => one.textContent))
  expect('표에는 세 모드', JSON.stringify(table) === JSON.stringify(['편집', '나란히', '미리보기']),
    JSON.stringify(table))
  await open('도구.py')
  const code = await page.evaluate(() => ({
    모드: [...document.querySelectorAll('.doc-head .mode-switch button')].map((one) => one.textContent),
    강조: document.querySelector('.main .code-preview') !== null,
  }))
  expect('코드에도 세 모드', JSON.stringify(code.모드) === JSON.stringify(['편집', '나란히', '미리보기']),
    JSON.stringify(code))
  expect('코드는 문법 강조로 그림', code.강조, JSON.stringify(code))

  step('6. 글쇠로 돌릴 때도 나란히를 건너뛴다')
  await open('회의 메모.txt')
  const rounds = []
  for (let turn = 0; turn < 3; turn += 1) {
    await page.keyboard.press('Meta+Shift+E')
    await page.waitForTimeout(350)
    rounds.push((await shape()).고른모드)
  }
  console.log('  ' + JSON.stringify(rounds))
  // 보기 → 편집 → 보기 → 편집. 나란히가 끼어 같은 글이 두 번 보이면 글쇠가 먹지 않은 듯합니다.
  expect('두 모드만 오감',
    JSON.stringify(rounds) === JSON.stringify(['편집', '미리보기', '편집']), JSON.stringify(rounds))

  step('7. 마크다운 문서는 하던 대로다')
  await open('개발 환경.md')
  const doc = await page.evaluate(() => ({
    모드: [...document.querySelectorAll('.doc-head .mode-switch button')].map((one) => one.textContent),
    글상자: document.querySelector('.main textarea') !== null,
  }))
  console.log('  ' + JSON.stringify(doc))
  expect('문서에는 세 모드', JSON.stringify(doc.모드) === JSON.stringify(['편집', '나란히', '미리보기']),
    JSON.stringify(doc))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
