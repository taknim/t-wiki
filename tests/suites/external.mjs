import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'external'), { recursive: true })
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
await page.addInitScript(() => window.__installMockFs())

const DOC = '개발 환경.md'
const onDisk = () => page.evaluate((path) => window.__vaultText(path), DOC)
const inEditor = () => page.evaluate(() => document.querySelector('.main .editor').value)
const pill = () => page.evaluate(() => document.querySelector('.pill')?.textContent ?? null)
/*
 * 앱 밖에서 파일을 고친 것처럼 꾸밉니다. 내용과 함께 시각도 앞으로 밀어야 합니다.
 * 같은 밀리초 안에 쓴 것과 구별되지 않으면 바뀐 줄 모릅니다.
 */
const editOutside = (text) => page.evaluate(([path, body]) => {
  const file = window.__mockRoot._children.get(path)
  file._data = body
  file._lastModified += 1000
}, [DOC, text])
const dialog = () => page.evaluate(() => document.querySelector('.dialog')?.textContent ?? null)

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click(`.tree-row:has-text("${DOC}") .tree-name`)
  await page.waitForSelector('.main .editor', { timeout: 8000 })
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(400)

  step('1. 평소에는 묻지 않고 저장한다')
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 하나')
  await page.waitForTimeout(1500)
  const plain = await onDisk()
  expect('그냥 저장됨', plain.includes('하나') && (await dialog()) === null, plain)

  /*
   * 브라우저는 파일이 바뀌었다고 알려 주지 않습니다. 같은 문서를 다른 편집기로 고치는
   * 사이 여기서 한 글자만 쳐도 자동 저장이 그 수정을 지워 버렸습니다.
   */
  step('2. 밖에서 바뀐 파일에는 쓰기 전에 묻는다')
  await editOutside('# 밖에서 고침\n\n다른 편집기가 쓴 글입니다.\n')
  await page.keyboard.type(' 둘')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  const asked = await dialog()
  console.log('  ' + asked.replace(/\s+/g, ' ').slice(0, 120))
  expect('밖에서 바뀌었다고 알림', asked.includes('밖에서 바뀐 파일'), asked)
  expect('아직 덮어쓰지 않음', (await onDisk()).startsWith('# 밖에서 고침'), await onDisk())
  await page.screenshot({ path: join(HERE, '..', 'shots', 'external', '01-ask.png') })

  step('3. 다시 읽기를 고르면 밖의 내용이 편집기에 들어온다')
  await page.click('.dialog button:has-text("밖의 내용 다시 읽기")')
  await page.waitForTimeout(600)
  const reloaded = await inEditor()
  expect('편집기가 밖의 글로 바뀜', reloaded.startsWith('# 밖에서 고침'), reloaded)
  expect('저장됨 표시', (await pill()) === '저장됨', String(await pill()))
  // 그 뒤로는 다시 평소처럼 저장됩니다.
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 이어서')
  await page.waitForTimeout(1500)
  expect('다시 읽은 뒤에는 묻지 않고 저장', (await onDisk()).includes('이어서') && (await dialog()) === null,
    await onDisk())

  step('4. 덮어쓰기를 고르면 내 글이 파일에 들어간다')
  await editOutside('# 또 밖에서 고침\n')
  await page.keyboard.type(' 셋')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.click('.dialog button:has-text("내 것으로 덮어쓰기")')
  await page.waitForTimeout(800)
  const overwritten = await onDisk()
  expect('내 글이 파일에 있음', overwritten.includes('셋') && !overwritten.startsWith('# 또 밖에서'), overwritten)
  expect('저장됨 표시', (await pill()) === '저장됨', String(await pill()))

  step('5. 취소하면 쓰지 않고, 같은 글로는 다시 묻지 않는다')
  await editOutside('# 세 번째 밖의 글\n')
  await page.keyboard.type(' 넷')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  expect('파일은 밖의 글 그대로', (await onDisk()) === '# 세 번째 밖의 글\n', await onDisk())
  expect('편집기 글은 남아 있음', (await inEditor()).includes('넷'), await inEditor())
  expect('저장 중 표시', (await pill()) === '저장 중…', String(await pill()))
  // 자동 저장이 계속 돌아도 같은 글로는 다시 묻지 않습니다.
  expect('되풀이해 묻지 않음', (await dialog()) === null, String(await dialog()))
  // 더 치면 새 글이므로 다시 묻습니다.
  await page.keyboard.type(' 다섯')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  expect('글이 바뀌면 다시 물음', (await dialog())?.includes('밖에서 바뀐 파일') ?? false)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  step('6. 다른 문서로 떠날 때도 묻고, 덮어쓰면 남는다')
  await page.click('.tree-row:has-text("온보딩") .tree-name').catch(async () => {
    await page.click('.tree-row:has-text("회사") .tree-caret')
    await page.waitForTimeout(300)
    await page.click('.tree-row:has-text("온보딩") .tree-name')
  })
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.click('.dialog button:has-text("내 것으로 덮어쓰기")')
  await page.waitForTimeout(800)
  const left = await onDisk()
  expect('떠나면서 덮어씀', left.includes('다섯'), left)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
