import { chromium } from 'playwright'
import { readFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOWN = join(HERE, '..', 'downloads')
rmSync(DOWN, { recursive: true, force: true })
mkdirSync(DOWN, { recursive: true })
mkdirSync(join(HERE, '..', 'shots', 'transfer'), { recursive: true })

const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1400, height: 920 }, acceptDownloads: true })
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
const openSettings = async () => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.waitForTimeout(500)
}
const exportTo = async (withToken) => {
  const box = page.locator('.checkbox:has-text("액세스 토큰도 함께") input')
  if ((await box.isChecked()) !== withToken) await box.click()
  await page.click('button:has-text("설정 내보내기")')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('.dialog button:has-text("내보내기")'),
  ])
  const to = join(DOWN, download.suggestedFilename())
  await download.saveAs(to)
  return { path: to, name: download.suggestedFilename() }
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 설정을 갖춰 둔다')
  await openVault('first')
  await openSettings()
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', '비밀토큰')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.click('.checkbox:has-text("정해진 간격마다") input')
  await page.fill('#gh-interval', '7')
  await page.click('.settings-nav button:has-text("모양")')
  await page.click('.theme-card:has-text("노르드")')
  await page.click('.settings-nav button:has-text("일반")')
  await page.click('.checkbox:has-text("줄 끝 공백") input')
  await page.waitForTimeout(500)
  ok('테마·저장 방식·저장소 설정을 넣었습니다')

  step('2. 토큰 없이 내보내면 파일에 토큰이 없다')
  const plain = await exportTo(false)
  console.log('  파일 이름: ' + plain.name)
  const plainBody = JSON.parse(readFileSync(plain.path, 'utf8'))
  console.log('  ' + JSON.stringify({ vaultName: plainBody.vaultName, github: plainBody.github }))
  expect('파일 이름에 폴더와 날짜', /^t-WiKi 내 위키 \d{4}-\d{2}-\d{2}\.json$/.test(plain.name), plain.name)
  expect('토큰이 비어 있음', plainBody.github.token === '', plainBody.github.token)
  expect('저장소는 담김', plainBody.github.repo === 'wiki' && plainBody.github.owner === 'tester',
    JSON.stringify(plainBody.github))
  expect('간격도 담김', plainBody.github.autoSyncMinutes === 7, String(plainBody.github.autoSyncMinutes))
  expect('테마가 담김', plainBody.appearance.theme === 'nord', plainBody.appearance.theme)
  expect('저장 방식이 담김', plainBody.general.trimWhitespace === true, JSON.stringify(plainBody.general))
  expect('기준점은 담지 않음', !JSON.stringify(plainBody).includes('sync-state')
    && plainBody.baselines === undefined, JSON.stringify(Object.keys(plainBody)))

  step('3. 토큰을 포함해 내보내면 들어 있다')
  const full = await exportTo(true)
  const fullBody = JSON.parse(readFileSync(full.path, 'utf8'))
  expect('토큰이 담김', fullBody.github.token === '비밀토큰', fullBody.github.token)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'transfer', '01-settings.png'),
    clip: { x: 300, y: 90, width: 820, height: 620 } })
  await page.click('.sheet-close')

  step('3-2. 토큰 포함 여부를 기억한다')
  // 설정 창을 열 때마다 다시 켜야 하면 성가십니다.
  await openSettings()
  const remembered = await page.locator('.checkbox:has-text("액세스 토큰도 함께") input').isChecked()
  expect('창을 다시 열어도 켜져 있음', remembered, String(remembered))
  await page.click('.sheet-close')

  step('4. 다른 폴더에서 가져오면 그 폴더에 들어간다')
  await closeVault()
  await openVault('second')
  await openSettings()
  await page.setInputFiles('#settings-bundle', full.path)
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.click('.dialog button:has-text("적용")')
  await page.waitForTimeout(700)
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(400)
  const landed = await page.evaluate(() => ({
    token: document.querySelector('#gh-token').value,
    owner: document.querySelector('#gh-owner').value,
    repo: document.querySelector('.row input[placeholder="저장소 이름"]').value,
    minutes: document.querySelector('#gh-interval')?.value,
    theme: document.documentElement.dataset.theme,
  }))
  console.log('  ' + JSON.stringify(landed))
  expect('토큰이 들어옴', landed.token === '비밀토큰', landed.token)
  expect('저장소가 들어옴', landed.repo === 'wiki' && landed.owner === 'tester', JSON.stringify(landed))
  expect('간격도 들어옴', landed.minutes === '7', String(landed.minutes))
  expect('테마도 따라옴', landed.theme === 'nord', String(landed.theme))
  await page.click('.sheet-close')

  step('5. 첫 폴더 설정은 그대로다')
  await closeVault()
  await openVault('first')
  await openSettings()
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(400)
  const origin = await page.inputValue('#gh-token')
  expect('원래 폴더도 제 값을 지킴', origin === '비밀토큰', origin)
  await page.click('.sheet-close')

  step('6. 엉뚱한 파일은 받지 않는다')
  await openSettings()
  const junk = join(DOWN, 'junk.json')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(junk, JSON.stringify({ hello: 'world' }))
  await page.setInputFiles('#settings-bundle', junk)
  await page.waitForTimeout(600)
  const notice = await page.textContent('.settings-section')
  expect('설정 파일이 아니라고 알림', notice.includes('t-WiKi 설정 파일이 아닙니다'),
    '안내가 보이지 않습니다')
  await page.click('.sheet-close')

  step('6-2. 확인 창에서 물러서면 아무것도 하지 않는다')
  await openSettings()
  await page.click('button:has-text("설정 내보내기")')
  await page.waitForSelector('.dialog')
  const warn = await page.textContent('.dialog')
  console.log('  안내: ' + warn.replace(/\s+/g, ' ').slice(0, 90))
  expect('토큰을 담을 때는 조심하라고 알림',
    warn.includes('액세스 토큰') && warn.includes('주고받지 마'), warn.slice(0, 120))
  expect('무엇이 담기는지 밝힘', warn.includes('기준점은 담기지 않습니다'), warn.slice(0, 200))
  // 물러섭니다. 파일이 내려오면 안 됩니다.
  const cancelled = await Promise.race([
    page.waitForEvent('download', { timeout: 2500 }).then(() => 'download'),
    page.click('.dialog button:has-text("취소")').then(() => 'cancel'),
  ])
  expect('물러서면 파일이 내려오지 않음', cancelled === 'cancel', String(cancelled))
  await page.waitForTimeout(300)

  const beforeCancel = await page.inputValue('#gh-token').catch(() => null)
  await page.setInputFiles('#settings-bundle', plain.path)
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("취소")')
  await page.waitForTimeout(500)
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(300)
  expect('물러서면 설정도 그대로',
    (await page.inputValue('#gh-token')) === beforeCancel,
    `${beforeCancel} -> ${await page.inputValue('#gh-token')}`)
  await page.click('.sheet-close')

  step('7. 브라우저에 남는 취향이 하나도 빠지지 않는다')
  /*
   * 앱이 localStorage 에 적어 두는 값을 통째로 견줍니다.
   * 새 설정을 더하면서 꾸러미에 넣는 것을 잊으면 여기서 걸립니다.
   * 폴더에 딸린 값(기준점·손잡이)은 일부러 담지 않으므로 여기서 보지 않습니다.
   */
  await closeVault()
  await openVault('first')
  await openSettings()
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', '토큰2')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.click('.settings-nav button:has-text("모양")')
  await page.click('.theme-card:has-text("세피아")')
  await page.click('.settings-nav button:has-text("일반")')
  // 이 화면에서 켜고 끌 수 있는 것을 모두 뒤집어 둡니다.
  for (const label of ['마지막 상태로', '줄 끝 공백', '들여쓰기 다시 잡기']) {
    await page.click(`.checkbox:has-text("${label}") input`)
  }
  await page.waitForTimeout(400)
  await page.click('.sheet-close')

  // 즐겨찾기 칸도 접어 둡니다. 이것도 기억되는 취향입니다.
  await page.hover('.tree-row:has-text("개발 환경")')
  await page.click('.tree-row:has-text("개발 환경") .tree-tools button[aria-label="즐겨찾기에 담기"]')
  await page.waitForTimeout(300)
  await page.click('.favorites-head')
  await page.waitForTimeout(300)

  // 트리 너비도 바꿔 둡니다. 이것도 기억되는 취향입니다.
  const handle = await page.locator('.sidebar-resizer').boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200)
  await page.mouse.down()
  await page.mouse.move(handle.x - 90, handle.y + 200, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)

  // 트리도 접어 둡니다. 이것도 취향입니다.
  await page.click('.sidebar-toggle')
  await page.waitForTimeout(400)

  await openSettings()
  const both = await exportTo(true)
  await page.click('.sheet-close')
  await page.waitForTimeout(300)

  // 내보내기 갈래도 기억되는 값이므로, 내보낸 뒤에 적어 둡니다.
  const before = await page.evaluate(() =>
    Object.fromEntries(Object.keys(localStorage)
      .filter((key) => key.startsWith('mdwiki:'))
      .sort()
      .map((key) => [key, localStorage.getItem(key)])))
  console.log('  내보내기 전: ' + JSON.stringify(before))

  // 전부 되돌려 놓고, 들여와서 제자리로 돌아오는지 봅니다.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('mdwiki:')) localStorage.removeItem(key)
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault('first')
  await openSettings()
  await page.setInputFiles('#settings-bundle', both.path)
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.click('.dialog button:has-text("적용")')
  await page.waitForTimeout(700)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)

  const after = await page.evaluate(() =>
    Object.fromEntries(Object.keys(localStorage)
      .filter((key) => key.startsWith('mdwiki:'))
      .sort()
      .map((key) => [key, localStorage.getItem(key)])))
  console.log('  들여온 뒤:   ' + JSON.stringify(after))

  const missing = Object.keys(before).filter((key) => before[key] !== after[key])
  expect('빠진 취향이 없음', missing.length === 0,
    '되돌아오지 않은 값: ' + JSON.stringify(missing.map((k) => [k, before[k], after[k]])))

  step('8. 콘솔 오류')
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
