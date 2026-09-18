import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'syncprogress'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1300, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.route('https://api.github.com/**', github.handler)
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => {
  window.__installMockFs()
  // 올릴 것을 여럿 두어 진행이 여러 걸음이 되게 합니다.
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  for (let at = 1; at <= 6; at += 1) {
    root._children.set(`메모 ${at}.md`, Object.assign(Object.create(Object.getPrototypeOf(sample)),
      { kind: 'file', name: `메모 ${at}.md`, _data: `# 메모 ${at}\n`, _lastModified: Date.now() }))
  }
})

/** 진행 창을 읽습니다. 없으면 null. */
const peek = () => page.evaluate(() => {
  const box = document.querySelector('.sync-progress')
  if (!box) return null
  const r = box.getBoundingClientRect()
  const anchor = document.querySelector('[data-sync-anchor] button').getBoundingClientRect()
  return {
    title: box.querySelector('.sync-progress-title span')?.textContent ?? null,
    count: box.querySelector('.sync-progress-count')?.textContent ?? null,
    bar: box.querySelector('.sync-progress-bar > span')?.style.width ?? null,
    busy: box.querySelector('.sync-progress-bar')?.classList.contains('is-busy') ?? false,
    steps: [...box.querySelectorAll('.sync-progress-steps li')].map((one) => one.textContent),
    below: Math.round(r.top - anchor.bottom),
    inside: r.left >= 0 && r.right <= window.innerWidth,
    overlay: document.querySelector('.overlay') !== null,
  }
})

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(400)
  await page.click('.sheet-close')
  await page.waitForTimeout(300)

  step('1. 도는 동안 단추 아래에 진행 창이 뜨고, 무엇을 옮기는지 적힌다')
  // 요청마다 잠깐씩 멈추게 해 도중을 볼 수 있게 합니다.
  github.setSlow(120)
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForSelector('.sync-progress', { timeout: 5000 })
  const first = await peek()
  console.log('  처음: ' + JSON.stringify(first))
  expect('단추 바로 아래', first.below >= 0 && first.below <= 12 && first.inside, JSON.stringify(first))
  expect('덮개가 없음', !first.overlay, JSON.stringify(first))
  expect('무엇을 하는지 적힘', typeof first.title === 'string' && first.title.length > 0, JSON.stringify(first))
  // 올리는 걸음이 시작되면 파일 이름이 한 줄씩 붙습니다.
  await page.waitForFunction(() => document.querySelectorAll('.sync-progress-steps li').length > 0, undefined, { timeout: 10000 })
  const mid = await peek()
  console.log('  도중: ' + JSON.stringify(mid))
  expect('막대가 몇 할인지 보임', mid.count !== null && /^\d+\/\d+$/.test(mid.count) && !mid.busy, JSON.stringify(mid))
  expect('지금 옮기는 파일이 적힘', mid.steps.some((one) => one.includes('올리는 중') && one.includes('.md')), JSON.stringify(mid))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'syncprogress', '01-progress.png'),
    clip: { x: 700, y: 0, width: 600, height: 240 } })
  // 진행이 쌓이면 지난 줄이 아래로 밀리고 최근 것이 위입니다.
  await page.waitForFunction(() => document.querySelectorAll('.sync-progress-steps li').length >= 2, undefined, { timeout: 10000 })
  const later = await peek()
  console.log('  나중: ' + JSON.stringify(later))
  expect('지난 줄이 아래에 남음', later.steps.length >= 2 && later.steps.length <= 4, JSON.stringify(later))

  step('2. 끝나면 스스로 걷힌다')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), undefined, { timeout: 30000 })
  await page.waitForTimeout(400)
  expect('진행 창이 사라짐', (await peek()) === null)
  github.setSlow(0)
  if (await page.locator('.sheet-close').count()) await page.click('.sheet-close')

  step('3. 좁은 화면에서도 화면 안에 든다')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  // 새로 올릴 것을 하나 더 심어 다시 돌립니다.
  await page.evaluate(() => {
    const root = window.__mockRoot
    const sample = root._children.get('개발 환경.md')
    root._children.set('새 메모.md', Object.assign(Object.create(Object.getPrototypeOf(sample)),
      { kind: 'file', name: '새 메모.md', _data: '# 새 메모\n', _lastModified: Date.now() }))
  })
  await page.click('.tree-root button[aria-label="새로고침"]').catch(() => {})
  await page.waitForTimeout(400)
  // 좁아지면서 옆줄이 서랍이 되어 머리줄을 덮고 있습니다. 접고 누릅니다.
  if (await page.locator('.sidebar:not(.is-rail)').count()) await page.click('.sidebar-toggle')
  await page.waitForTimeout(300)
  github.setSlow(150)
  await page.click('[data-sync-anchor] button')
  await page.waitForSelector('.sync-progress', { timeout: 5000 })
  const narrow = await peek()
  console.log('  ' + JSON.stringify(narrow))
  expect('좁아도 화면 안', narrow.inside, JSON.stringify(narrow))
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), undefined, { timeout: 30000 })
  github.setSlow(0)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
