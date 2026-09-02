import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'vaultscope'), { recursive: true })
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

/*
 * 폴더 두 개를 두고 오갈 수 있는 목입니다.
 * 실제로도 "폴더 열기" 를 누를 때마다 다른 폴더를 고를 수 있습니다.
 */
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => {
  window.__installMockFs()
  const first = window.__mockRoot

  // 두 번째 폴더. 안이 전혀 다릅니다.
  const second = Object.create(Object.getPrototypeOf(first))
  Object.assign(second, { kind: 'directory', name: '다른 폴더', _children: new Map() })
  const memo = Object.create(Object.getPrototypeOf([...first._children.values()][0]))
  Object.assign(memo, { kind: 'file', name: '메모.md', _data: '# 메모\n', _lastModified: Date.now() })
  second._children.set('메모.md', memo)

  window.__vaults = { first, second }
  window.__pick = 'first'
  window.showDirectoryPicker = async () => window.__vaults[window.__pick]
  // isSameEntry 를 이름으로 견주므로 두 폴더가 서로 다른 것으로 잡힙니다.
})

const openVault = async (which) => {
  await page.evaluate((w) => { window.__pick = w; window.__mockRoot = window.__vaults[w] }, which)
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
}
/** 설정 창이 떠 있으면 닫습니다. 맞춰 두지 않은 폴더에서 동기화를 누르면 이 창이 뜹니다. */
const closeSheet = async () => {
  if (await page.locator('.sheet-close').count()) {
    await page.click('.sheet-close')
    await page.waitForTimeout(300)
  }
}
const closeVault = async () => {
  await closeSheet()
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const openSettings = async () => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(800)
}
const readRepoFields = () => page.evaluate(() => ({
  token: document.querySelector('#gh-token')?.value ?? '',
  owner: document.querySelector('#gh-owner')?.value ?? '',
  repo: document.querySelector('.row input[placeholder="저장소 이름"]')?.value ?? '',
}))
const idle = () =>
  page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), { timeout: 30000 })

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 첫 폴더를 저장소에 맞추고 올린다')
  await openVault('first')
  await openSettings()
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.click('.checkbox:has-text("반대쪽에서도 지우기") input')
  await page.click('.sheet-close')
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await idle()
  await page.waitForTimeout(600)
  const uploaded = Object.keys(github.currentFiles()).sort()
  console.log('  저장소: ' + JSON.stringify(uploaded))
  expect('첫 폴더 내용이 올라감', uploaded.length >= 5, JSON.stringify(uploaded))

  step('2. 다른 폴더를 열면 GitHub 설정이 비어 있다')
  await closeVault()
  await openVault('second')
  await openSettings()
  const fields = await readRepoFields()
  console.log('  ' + JSON.stringify(fields))
  expect('토큰이 비어 있음', fields.token === '', fields.token)
  expect('소유자가 비어 있음', fields.owner === '', fields.owner)
  expect('저장소 이름이 비어 있음', fields.repo === '', fields.repo)
  await page.screenshot({ path: join(HERE, 'shots-vaultscope', '01-new-vault.png'),
    clip: { x: 300, y: 90, width: 820, height: 560 } })
  await page.click('.sheet-close')

  step('3. 그 상태로 동기화를 눌러도 저장소가 지워지지 않는다')
  // 예전에는 여기서 첫 폴더 설정을 물려받아 저장소를 통째로 비웠습니다.
  const before = Object.keys(github.currentFiles()).sort()
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForTimeout(1500)
  const after = Object.keys(github.currentFiles()).sort()
  console.log('  누른 뒤 저장소: ' + JSON.stringify(after))
  expect('저장소가 그대로', JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify(before) + ' -> ' + JSON.stringify(after))
  // 맞춰 두지 않은 폴더에서는 동기화 대신 설정 창을 열어 줍니다.
  expect('설정 창으로 안내함', (await page.locator('.settings-nav').count()) === 1)

  step('4. 첫 폴더로 돌아오면 설정이 그대로 있다')
  await closeVault()
  await openVault('first')
  await openSettings()
  const back = await readRepoFields()
  console.log('  ' + JSON.stringify(back))
  expect('액세스 토큰이 그대로 들어와 있음', back.token === 'pat', back.token)
  expect('저장소 이름이 살아 있음', back.repo === 'wiki', back.repo)
  expect('소유자도 살아 있음', back.owner === 'tester', back.owner)
  // 지난 폴더에서 확인해 둔 계정·저장소 목록이 남아 있으면 안 됩니다.
  expect('지난 계정 표시가 남지 않음',
    !(await page.textContent('.settings-content')).includes('로 확인됨'),
    '이전 계정 표시가 보입니다')
  await page.click('.sheet-close')

  step('5. 첫 폴더는 여전히 "이미 같습니다" 로 끝난다')
  await page.waitForFunction(() => !document.querySelector('.toast'), { timeout: 15000 }).catch(() => {})
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await idle()
  await page.waitForTimeout(600)
  const same = await page.textContent('.toast').catch(() => '(알림 없음)')
  console.log('  알림: ' + same)
  expect('기준점이 남아 있음', same.includes('이미 저장소와 같습니다'), same)
  expect('저장소도 그대로', JSON.stringify(Object.keys(github.currentFiles()).sort()) === JSON.stringify(before),
    JSON.stringify(Object.keys(github.currentFiles()).sort()))

  step('6. 두 번째 폴더에 따로 맞춰도 서로 섞이지 않는다')
  await closeVault()
  await openVault('second')
  await openSettings()
  await page.fill('#gh-token', 'pat2')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.click('.sheet-close')
  await closeVault()
  await openVault('first')
  await openSettings()
  const firstAgain = await readRepoFields()
  console.log('  첫 폴더: ' + JSON.stringify(firstAgain))
  expect('첫 폴더 토큰이 바뀌지 않음', firstAgain.token === 'pat', firstAgain.token)
  await page.click('.sheet-close')

  step('7. 새로고침해도 폴더마다 제 설정을 찾아간다')
  // 다시 열 때도 핸들로 폴더를 가려내는지 봅니다.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault('second')
  await openSettings()
  const afterReload = await readRepoFields()
  console.log('  두 번째 폴더: ' + JSON.stringify(afterReload))
  expect('두 번째 폴더의 토큰', afterReload.token === 'pat2', afterReload.token)
  await page.click('.sheet-close')
  await closeVault()
  await openVault('first')
  await openSettings()
  const firstReload = await readRepoFields()
  console.log('  첫 폴더: ' + JSON.stringify(firstReload))
  expect('첫 폴더의 토큰', firstReload.token === 'pat', firstReload.token)
  await page.click('.sheet-close')

  step('8. 처음 보는 폴더는 여전히 비어 있다')
  await closeVault()
  await page.evaluate(() => {
    const third = Object.create(Object.getPrototypeOf(window.__vaults.first))
    Object.assign(third, { kind: 'directory', name: '세 번째 폴더', _children: new Map() })
    window.__vaults.third = third
  })
  await openVault('third')
  await openSettings()
  const third = await readRepoFields()
  console.log('  ' + JSON.stringify(third))
  expect('토큰이 비어 있음', third.token === '', third.token)
  expect('저장소도 비어 있음', third.repo === '' && third.owner === '', JSON.stringify(third))
  await page.click('.sheet-close')

  step('9. 이 폴더의 설정만 지울 수 있다')
  await closeVault()
  await openVault('first')
  await openSettings()
  await page.click('button:has-text("이 폴더의 설정 지우기")')
  await page.waitForSelector('button:has-text("정말 지울까요?")')
  await page.click('button:has-text("정말 지울까요?")')
  await page.waitForTimeout(600)
  const cleared = await readRepoFields()
  console.log('  지운 뒤 첫 폴더: ' + JSON.stringify(cleared))
  expect('토큰까지 지워짐', cleared.token === '' && cleared.repo === '', JSON.stringify(cleared))
  await page.click('.sheet-close')

  await closeVault()
  await openVault('second')
  await openSettings()
  const other = await readRepoFields()
  console.log('  둘째 폴더: ' + JSON.stringify(other))
  expect('다른 폴더는 그대로', other.token === 'pat2', other.token)
  await page.click('.sheet-close')

  step('10. 콘솔 오류')
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
