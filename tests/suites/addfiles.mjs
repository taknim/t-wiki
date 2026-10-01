import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'addfiles'), { recursive: true })
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

const BODY = '# 밖에서 온 문서\n\n다른 곳에서 써 온 마크다운입니다.\n'

/** 파일 고르기 창은 자동화로 못 여니 칸에 곧바로 얹습니다. */
const drop = (name, text) => page.setInputFiles('#add-files', [
  { name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') },
])

const toast = async () => {
  const line = page.locator('.toast')
  await line.waitFor({ timeout: 3000 })
  return (await line.textContent()) ?? ''
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. 고르기 창이 마크다운을 걸러내지 않는다')
  const accept = await page.getAttribute('#add-files', 'accept')
  console.log('  accept: ' + accept)
  expect('.md 가 목록에 있음', (accept ?? '').split(',').includes('.md'), String(accept))

  step('2. 마크다운을 넣으면 트리에 나타난다')
  await drop('밖에서 온 문서.md', BODY)
  const first = await toast()
  console.log('  안내: ' + first)
  expect('추가했다고 알림', first.includes('1개 추가'), first)
  expect('거절하지 않음', !first.includes('지원하지 않는'), first)
  await page.waitForTimeout(400)
  const inTree = await page.locator('.tree-row:has-text("밖에서 온 문서")').count()
  expect('트리에 줄이 생김', inTree === 1, String(inTree))

  step('3. 넣은 문서가 내용을 그대로 지닌 채 열린다')
  const seen = await page.evaluate(() => document.querySelector('.doc-body')?.innerText ?? '')
  expect('본문이 화면에 있음', seen.includes('다른 곳에서 써 온 마크다운'), seen.slice(0, 120))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'addfiles', '01-added.png') })

  /*
   * 화면만 보면 색인이 채워졌다는 것까지만 압니다. 자동 저장이 지날 만큼 기다린 뒤
   * 파일 쪽을 한 번 더 열어, 넣는 길에서 내용이 새지 않았는지 봅니다.
   */
  step('4. 파일에도 내용이 그대로 들어간다')
  await page.waitForTimeout(1600)
  const onDisk = await page.evaluate(() => window.__vaultText('밖에서 온 문서.md'))
  console.log('  파일: ' + JSON.stringify(onDisk))
  expect('파일에 본문이 남음', (onDisk ?? '').includes('다른 곳에서 써 온 마크다운'), String(onDisk))

  step('5. 같은 이름을 또 넣으면 덮지 않고 옆에 둔다')
  await drop('밖에서 온 문서.md', BODY)
  await toast()
  await page.waitForTimeout(500)
  const twice = await page.locator('.tree-row:has-text("밖에서 온 문서")').count()
  expect('줄이 둘로 늘어남', twice === 2, String(twice))

  /*
   * zip 은 받지만 7z·rar 는 받지 않습니다 — 목차를 읽는 데 라이브러리가 따로 필요합니다.
   * (받는 형식의 보기로 zip 을 쓰고 있었는데, zip 을 받게 되면서 이 걸음이 무너졌습니다.)
   */
  step('6. 모르는 형식은 여전히 물리친다')
  await drop('꾸러미.7z', '7z\xbc\xaf')
  const third = await toast()
  console.log('  안내: ' + third)
  expect('지원하지 않는다고 알림', third.includes('지원하지 않는 형식'), third)
  await page.waitForTimeout(400)
  const other = await page.locator('.tree-row:has-text("꾸러미")').count()
  expect('트리에 들이지 않음', other === 0, String(other))

  step('6-1. 압축(zip)은 받는다')
  await drop('자료 묶음.zip', 'PK\x05\x06')
  await toast()
  await page.waitForTimeout(500)
  const zip = await page.locator('.tree-row:has-text("자료 묶음")').count()
  expect('트리에 들어옴', zip === 1, String(zip))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
