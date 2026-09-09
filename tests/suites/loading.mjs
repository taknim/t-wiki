import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'loading'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => {
  window.__installMockFs()

  /*
   * 크고 느린 폴더를 흉내 냅니다. 파일마다 살짝 뜸을 들여야 읽는 동안의 화면을
   * 붙잡을 수 있습니다. 목 폴더는 눈 깜짝할 새에 읽혀서 그냥은 볼 수 없습니다.
   */
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  for (let at = 1; at <= 300; at += 1) {
    const name = `쪽지 ${String(at).padStart(3, '0')}.md`
    root._children.set(name, Object.assign(
      Object.create(Object.getPrototypeOf(sample)),
      { kind: 'file', name, _data: `# 쪽지 ${at}\n`, _lastModified: Date.now() },
    ))
  }
  const plain = Object.getPrototypeOf(sample).getFile
  Object.getPrototypeOf(sample).getFile = async function () {
    await new Promise((done) => setTimeout(done, 6))
    return plain.call(this)
  }
})

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 읽는 동안 무엇을 하고 있는지 보여 준다')
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree-loading', { timeout: 8000 })
  await page.waitForTimeout(500)
  const busy = await page.evaluate(() => {
    const read = (host) => document.querySelector(`${host} .tree-loading`)?.textContent
      .replace(/\s+/g, ' ').trim() ?? null
    return {
      side: read('.sidebar-scroll'),
      main: read('.main'),
      spinners: [...document.querySelectorAll('.spinner')]
        .map((one) => Math.round(one.getBoundingClientRect().width)),
      tree: document.querySelectorAll('.tree').length,
    }
  })
  console.log('  ' + JSON.stringify(busy))
  expect('옆줄에 읽는 중이라고 나옴', (busy.side ?? '').includes('폴더를 읽는 중'), String(busy.side))
  expect('본문에도 나옴', (busy.main ?? '').includes('폴더를 읽는 중'), String(busy.main))
  // 몇 개까지 왔는지 세어 줍니다. 멈춘 것인지 나아가는 것인지는 숫자라야 압니다.
  expect('어디까지 왔는지 셈이 붙음', /\d+개/.test(busy.side ?? ''), String(busy.side))
  expect('도는 고리가 그려짐', busy.spinners.every((one) => one > 4), JSON.stringify(busy.spinners))
  expect('아직 트리는 없음', busy.tree === 0, String(busy.tree))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'loading', '01-busy.png'),
    clip: { x: 0, y: 40, width: 1200, height: 300 } })

  step('2. 셈이 늘어난다')
  const first = Number(/(\d+)개/.exec(busy.side ?? '0개')[1])
  await page.waitForTimeout(700)
  const later = await page.evaluate(() =>
    document.querySelector('.sidebar-scroll .tree-loading')?.textContent ?? '')
  const second = Number(/(\d+)개/.exec(later)?.[1] ?? '0')
  console.log(`  ${first}개 → ${second}개`)
  expect('숫자가 나아감', second > first, `${first} → ${second}`)

  step('3. 다 읽으면 트리로 바뀐다')
  await page.waitForSelector('.tree', { timeout: 30000 })
  await page.waitForTimeout(400)
  const done = await page.evaluate(() => ({
    loading: document.querySelectorAll('.tree-loading').length,
    rows: document.querySelectorAll('.tree-row').length,
  }))
  console.log('  ' + JSON.stringify(done))
  expect('읽는 중 표시가 사라짐', done.loading === 0, JSON.stringify(done))
  expect('트리가 나옴', done.rows > 300, JSON.stringify(done))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
