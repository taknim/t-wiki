import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'countdown'), { recursive: true })
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
  const second = Object.create(Object.getPrototypeOf(first))
  Object.assign(second, { kind: 'directory', name: '다른 폴더', _children: new Map() })
  window.__vaults = { first, second }
  window.__pick = 'first'
  window.showDirectoryPicker = async () => window.__vaults[window.__pick]
})

const seconds = (text) => text.trim().split(':').map(Number).reduce((t, p) => t * 60 + p, 0)
const countdown = () => page.textContent('.sync-countdown')
const openVault = async (which) => {
  await page.evaluate((w) => { window.__pick = w; window.__mockRoot = window.__vaults[w] }, which)
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(600)
}
const closeVault = async () => {
  if (await page.locator('.sheet-close').count()) { await page.click('.sheet-close'); await page.waitForTimeout(200) }
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const configure = async (minutes) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.click('.checkbox:has-text("정해진 간격마다") input')
  await page.fill('#gh-interval', String(minutes))
  await page.waitForTimeout(400)
  await page.click('.sheet-close')
  await page.waitForSelector('.sync-countdown', { timeout: 8000 })
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 켜면 정해진 간격에서 시작한다')
  await openVault('first')
  await configure(5)
  const first = await countdown()
  console.log('  처음 표시: ' + first)
  expect('mm:ss 꼴', /^\d{2}:\d{2}$/.test(first.trim()), first)
  expect('간격에서 시작', seconds(first) > 4 * 60 + 50, first)

  step('2. 1초마다 줄어든다')
  const samples = [first.trim()]
  for (let i = 0; i < 3; i += 1) {
    await page.waitForTimeout(1100)
    samples.push((await countdown()).trim())
  }
  console.log('  ' + JSON.stringify(samples))
  const ticks = samples.map(seconds)
  expect('값이 계속 줄어듦', ticks.every((v, i) => i === 0 || v < ticks[i - 1]), JSON.stringify(samples))

  step('3. 새로고침하면 다시 간격에서 시작한다')
  // 예전에는 새로고침하면 곧바로 도는 짧은 차례가 잡혀 00:05 부터 셌습니다.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault('first')
  await page.waitForSelector('.sync-countdown', { timeout: 8000 })
  await page.waitForTimeout(400)
  const afterReload = await countdown()
  console.log('  새로고침 뒤: ' + afterReload)
  expect('간격에서 다시 시작', seconds(afterReload) > 4 * 60 + 45, afterReload)

  step('4. 폴더를 다시 열어도 간격에서 시작한다')
  await page.waitForTimeout(2500)
  const beforeSwitch = await countdown()
  await closeVault()
  await openVault('first')
  await page.waitForSelector('.sync-countdown', { timeout: 8000 })
  await page.waitForTimeout(400)
  const afterSwitch = await countdown()
  console.log('  닫기 전 ' + beforeSwitch.trim() + ' → 다시 연 뒤 ' + afterSwitch.trim())
  expect('앞서 세던 시간을 이어 가지 않음', seconds(afterSwitch) > seconds(beforeSwitch),
    beforeSwitch + ' -> ' + afterSwitch)
  expect('간격에서 다시 시작', seconds(afterSwitch) > 4 * 60 + 45, afterSwitch)

  step('5. 다른 폴더로 옮기면 그 폴더 기준으로 새로 센다')
  await closeVault()
  await openVault('second')
  await page.waitForTimeout(500)
  expect('맞춰 두지 않은 폴더에는 표시가 없음',
    (await page.locator('.sync-countdown').count()) === 0)
  await configure(3)
  const other = await countdown()
  console.log('  둘째 폴더: ' + other)
  // 남은 시간은 올림해서 보여 주므로 시작 직후에는 03:01 로 보일 수 있습니다.
  expect('그 폴더의 간격에서 시작', seconds(other) > 2 * 60 + 50 && seconds(other) <= 3 * 60 + 2, other)

  step('6. 간격이 다른 두 폴더를 오가도 서로의 시간을 물려받지 않는다')
  /*
   * 첫 폴더는 5분, 둘째는 3분입니다. 오갈 때마다 그 폴더의 간격에서 새로 세야 합니다.
   * 앞 폴더에서 세던 값이 남아 있으면 여기서 걸립니다.
   */
  await page.waitForTimeout(2500)
  for (const trip of [
    { vault: 'first', minutes: 5 },
    { vault: 'second', minutes: 3 },
    { vault: 'first', minutes: 5 },
  ]) {
    await closeVault()
    await openVault(trip.vault)
    await page.waitForSelector('.sync-countdown', { timeout: 8000 })
    // 뜨자마자 재 봅니다. 잠깐이라도 앞 폴더 값이 비치면 안 됩니다.
    const shown = await countdown()
    const want = trip.minutes * 60
    console.log(`  ${trip.vault} (${trip.minutes}분): ${shown.trim()}`)
    expect(`${trip.vault} 는 ${trip.minutes}분에서 시작`,
      seconds(shown) > want - 10 && seconds(shown) <= want + 2, shown)
    await page.waitForTimeout(2200)
  }

  step('7. 간격을 바꾸면 그 자리에서 새로 센다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-interval', '9')
  await page.waitForTimeout(500)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)
  const changed = await countdown()
  console.log('  9분으로 바꾼 뒤: ' + changed.trim())
  expect('바꾼 간격에서 시작', seconds(changed) > 8 * 60 + 50, changed)

  step('8. 설정을 가져오면 자동 차례를 새로 잡는다')
  /*
   * 가져온 간격이 지금과 같아도 처음부터 다시 세야 합니다. 대상이 달라졌는데
   * 앞 설정으로 세던 시간이 이어지면, 남은 시간이 어느 저장소를 향한 것인지 알 수 없습니다.
   */
  const { writeFileSync, mkdirSync } = await import('node:fs')
  // 시험이 남기는 파일은 저장소에 올리지 않는 자리에 둡니다.
  mkdirSync(join(HERE, '..', 'downloads'), { recursive: true })
  const bundle = (minutes) => JSON.stringify({
    app: 't-WiKi', version: 1, exportedAt: '2026-09-02T10:00:00.000Z', vaultName: '다른 곳',
    appearance: { theme: 'default', mode: 'system', font: 'sans', size: 'medium', width: 'medium' },
    general: { rememberSession: true, sidebarOpen: true, includeToken: true, trimWhitespace: false, tidyFormat: false },
    github: { token: 'pat', owner: 'tester', repo: 'wiki', branch: 'main', basePath: '',
      conflictPolicy: 'keep-both', propagateDeletes: false, autoSync: true, autoSyncMinutes: minutes },
  })
  const bring = async (minutes) => {
    const file = join(HERE, '..', 'downloads', `bundle-${minutes}.json`)
    writeFileSync(file, bundle(minutes))
    await page.click('button[aria-label="설정"]')
    await page.waitForSelector('.settings-nav')
    await page.setInputFiles('#settings-bundle', file)
    await page.waitForSelector('.dialog', { timeout: 5000 })
    await page.click('.dialog button:has-text("적용")')
    await page.waitForTimeout(600)
    await page.click('.sheet-close')
    await page.waitForTimeout(300)
  }

  // 지금은 9분으로 세는 중입니다. 얼마간 흘려보내 중간값을 만듭니다.
  await page.waitForTimeout(2500)
  const midway = await countdown()
  await bring(9)   // 간격이 지금과 똑같은 파일
  const sameAgain = await countdown()
  console.log(`  같은 간격(9분)을 가져옴: ${midway.trim()} → ${sameAgain.trim()}`)
  expect('같은 간격이어도 처음부터 다시 셈', seconds(sameAgain) > seconds(midway),
    `${midway} -> ${sameAgain}`)
  expect('9분에서 시작', seconds(sameAgain) > 8 * 60 + 45, sameAgain)

  await page.waitForTimeout(2200)
  await bring(4)   // 간격이 다른 파일
  const changed2 = await countdown()
  console.log('  다른 간격(4분)을 가져옴: ' + changed2.trim())
  expect('가져온 간격에서 시작', seconds(changed2) > 3 * 60 + 45 && seconds(changed2) <= 4 * 60 + 2,
    changed2)

  /*
   * 저절로 도는 회차가 타자 도중에 돌면 반쯤 쓴 글이 커밋됩니다.
   * 손을 뗀 지 2초가 지나기를 기다렸다가 저장하고 돌아야 합니다.
   * 1분 간격으로 맞추고, 돌기 직전부터 천천히 쳐서 마지막 글자까지 올라가는지 봅니다.
   */
  step('8-2. 저절로 도는 회차는 타자가 멎기를 기다린다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-interval', '1')
  await page.waitForTimeout(400)
  await page.click('.sheet-close')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForSelector('.main .editor', { timeout: 8000 })
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(300)
  // 돌기 3초 전까지 기다립니다.
  await page.waitForFunction(() => {
    const text = document.querySelector('.sync-countdown')?.textContent ?? '99:99'
    const [m, s] = text.trim().split(':').map(Number)
    return m * 60 + s <= 3
  }, undefined, { timeout: 70000 })
  await page.click('.main .editor')
  await page.keyboard.press('End')
  const TYPED = ' 천천히 치는 글'
  await page.keyboard.type(TYPED, { delay: 350 })   // 6초 남짓, 돌 시각을 지나서까지 칩니다
  // 손을 뗀 뒤 회차가 끝나기를 기다립니다. 끝나면 남은 시간이 다시 1분 가까이로 돌아갑니다.
  await page.waitForFunction(() => {
    const text = document.querySelector('.sync-countdown')?.textContent ?? '00:00'
    const [m, s] = text.trim().split(':').map(Number)
    return m * 60 + s > 50 && !document.querySelector('.topbar button[disabled]')
  }, undefined, { timeout: 40000 })
  await page.waitForTimeout(500)
  const pushed = github.currentFiles()['개발 환경.md'] ?? ''
  console.log('  올라간 글 끝: …' + pushed.trim().slice(-24))
  expect('마지막 글자까지 올라감', pushed.includes(TYPED), pushed.slice(-80))
  // 결과 창이 떠 있으면 닫습니다.
  if (await page.locator('.sheet-close').count()) await page.click('.sheet-close')

  step('9. 콘솔 오류')
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
