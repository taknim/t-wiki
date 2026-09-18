import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'loading'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.route('https://api.github.com/**', github.handler)
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

  /*
   * 파일을 하나 넣거나 이름을 바꿀 때마다 폴더를 다시 훑는데, 그때 본문 300개를 도로
   * 읽으면 손전화에서는 목록이 한참 뒤에야 바뀝니다. 크기와 시각이 그대로인 문서는
   * 본문을 다시 읽지 않아야 합니다. 본문을 읽은 횟수(File.text)를 셉니다.
   */
  step('4. 다시 훑을 때 안 바뀐 문서의 본문은 도로 읽지 않는다')
  await page.evaluate(() => {
    window.__reads = 0
    const text = File.prototype.text
    File.prototype.text = function () {
      window.__reads += 1
      return text.call(this)
    }
  })
  // 다시 훑는 동안은 트리가 그대로 보여 끝난 때를 화면으로 알 수 없습니다. 넉넉히 기다립니다(300개 × 6ms).
  await page.click('.tree-root button[aria-label="새로고침"]')
  await page.waitForTimeout(3500)
  const rescan = await page.evaluate(() => window.__reads)
  console.log(`  다시 훑기: 본문 읽기 ${rescan}번`)
  expect('본문을 하나도 다시 읽지 않음', rescan === 0, String(rescan))

  // 하나를 밖에서 고치면 그것만 다시 읽어야 합니다. 시각을 앞으로 밀어 바뀐 것으로 만듭니다.
  await page.evaluate(() => {
    window.__reads = 0
    const file = window.__mockRoot._children.get('쪽지 007.md')
    file._data = '# 쪽지 7 (고침)\n'
    file._lastModified += 1000
  })
  await page.click('.tree-root button[aria-label="새로고침"]')
  await page.waitForTimeout(3500)
  const changed = await page.evaluate(() => window.__reads)
  console.log('  하나 고친 뒤: 본문 읽기 ' + changed + '번')
  expect('바뀐 것만 다시 읽음', changed === 1, String(changed))
  await page.click('.tree-row:has-text("쪽지 007") .tree-name')
  await page.waitForTimeout(500)
  const shown = await page.evaluate(() => document.querySelector('.main .editor')?.value ?? null)
  expect('고친 내용이 들어옴', (shown ?? '').includes('고침'), String(shown))

  /*
   * 반쯤 읽힌 색인으로 동기화가 돌면 아직 안 읽은 파일이 "로컬에서 사라짐"으로 잡힙니다.
   * 손전화처럼 느린 기기에서는 읽는 데 한참 걸려 그 틈이 넓습니다. 읽는 동안은 막아야 합니다.
   */
  step('5. 폴더를 읽는 동안에는 동기화가 돌지 않는다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForTimeout(300)
  // 다시 읽기를 걸어 두고(2초 남짓) 그 틈에 동기화를 누릅니다.
  await page.click('.tree-root button[aria-label="새로고침"]')
  await page.waitForTimeout(200)
  const during = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.topbar button')].find((one) => one.textContent.includes('GitHub 동기화'))
    return { disabled: button?.disabled ?? null, tip: button?.getAttribute('data-tip') ?? null }
  })
  console.log('  읽는 동안 단추: ' + JSON.stringify(during))
  expect('단추가 잠김', during.disabled === true && (during.tip ?? '').includes('읽는 중'), JSON.stringify(during))
  // 단축키로도 돌지 않습니다.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+g' : 'Control+Shift+g')
  await page.waitForTimeout(700)
  const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? null)
  console.log('  알림: ' + String(toast))
  expect('읽는 중이라고 알림', (toast ?? '').includes('읽는 중'), String(toast))
  expect('저장소에 아무 요청도 가지 않음', github.lastAuth() === null && github.commitCount === 0, `${github.lastAuth()} / ${github.commitCount}`)
  // 다 읽으면 돕니다.
  await page.waitForTimeout(3500)
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), undefined, { timeout: 60000 })
  await page.waitForTimeout(500)
  expect('다 읽은 뒤에는 돎', github.commitCount === 1, String(github.commitCount))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
