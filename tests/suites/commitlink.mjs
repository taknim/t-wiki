import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'commitlink'), { recursive: true })
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
  const other = Object.create(Object.getPrototypeOf(first))
  Object.assign(other, { kind: 'directory', name: '다른 폴더', _children: new Map() })
  window.__vaults = { first, other }
  window.__pick = 'first'
  window.showDirectoryPicker = async () => window.__vaults[window.__pick]
})

const openVault = async (w) => {
  await page.evaluate((x) => { window.__pick = x; window.__mockRoot = window.__vaults[x] }, w)
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
}
const closeVault = async () => {
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const openSync = async () => {
  if (!(await page.locator('.settings-nav').count())) {
    await page.click('button[aria-label="설정"]')
    await page.waitForSelector('.settings-nav')
  }
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(300)
}
const closeSheet = async () => {
  if (await page.locator('.sheet-close').count()) {
    await page.click('.sheet-close')
    await page.waitForTimeout(300)
  }
}
const configure = async (repo) => {
  await openSync()
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', repo)
  await page.waitForTimeout(400)
}
const syncNow = async () => {
  await page.click('button:has-text("지금 동기화")')
  // 끝났는지는 단추가 다시 눌리는 것으로 가립니다. 글귀는 남아 있을 수 있습니다.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((n) => /지금 동기화|동기화 중/.test(n.textContent))
    return b && !b.disabled && b.textContent.includes('지금 동기화')
  }, { timeout: 25000 })
  await page.waitForTimeout(800)
}

/** 마지막 동기화 줄에 무엇이 적혀 있는지. */
const line = () => page.evaluate(() => {
  const hints = [...document.querySelectorAll('.hint')]
  const p = hints.find((n) => n.textContent.includes('마지막 동기화'))
  const a = p ? p.querySelector('.commit-link') : null
  return {
    text: p ? p.textContent.trim() : null,
    sha: a ? a.textContent : null,
    href: a ? a.getAttribute('href') : null,
    target: a ? a.getAttribute('target') : null,
    rel: a ? a.getAttribute('rel') : null,
  }
})

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 동기화하기 전에는 커밋 이름이 없다')
  await openVault('first')
  await configure('wiki')
  const before = await line()
  console.log('  ' + JSON.stringify(before))
  expect('시각은 아직 없음', before.text.includes('아직 없습니다'), JSON.stringify(before))
  expect('링크도 없음', before.sha === null, JSON.stringify(before))

  step('2. 동기화하면 그 커밋 이름이 나온다')
  await syncNow()
  const after = await line()
  console.log('  ' + JSON.stringify(after))
  console.log('  저장소 head: ' + github.headSha)
  expect('커밋 이름이 보임', typeof after.sha === 'string' && after.sha.length === 7,
    JSON.stringify(after))
  expect('저장소에 올라간 그 커밋', github.headSha.startsWith(after.sha),
    after.sha + ' vs ' + github.headSha)
  expect('시각 옆에 붙음',
    after.text.includes('마지막 동기화') && after.text.includes(after.sha),
    JSON.stringify(after))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'commitlink', '01-link.png') })

  step('3. 그 커밋으로 가는 새 탭 링크다')
  console.log('  href: ' + after.href)
  expect('저장소와 커밋이 주소에 들어감',
    after.href === 'https://github.com/tester/wiki/commit/' + github.headSha, String(after.href))
  expect('새 탭으로 열림', after.target === '_blank', String(after.target))
  expect('opener 를 넘기지 않음', String(after.rel).includes('noopener'), String(after.rel))

  step('4. 새로고침해도 남는다')
  const kept = after.sha
  const href = after.href
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault('first')
  await openSync()
  const reloaded = await line()
  console.log('  ' + JSON.stringify(reloaded))
  expect('같은 커밋 이름', reloaded.sha === kept, reloaded.sha + ' vs ' + kept)
  expect('주소도 그대로', reloaded.href === href, String(reloaded.href))

  step('5. 올릴 것이 없는 동기화는 커밋 이름을 지우지 않는다')
  await syncNow()
  const idle = await line()
  console.log('  ' + JSON.stringify(idle))
  expect('커밋 이름이 그대로', idle.sha === kept, idle.sha + ' vs ' + kept)

  step('6. 폴더마다 따로다')
  await closeSheet()
  await closeVault()
  await openVault('other')
  await openSync()
  const fresh = await line()
  console.log('  다른 폴더: ' + JSON.stringify(fresh))
  expect('처음 보는 폴더에는 없음', fresh.sha === null, JSON.stringify(fresh))
  expect('시각도 없음', fresh.text.includes('아직 없습니다'), JSON.stringify(fresh))

  await closeSheet()
  await closeVault()
  await openVault('first')
  await openSync()
  const back = await line()
  console.log('  원래 폴더: ' + JSON.stringify(back))
  expect('원래 폴더에는 그대로', back.sha === kept, back.sha + ' vs ' + kept)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? cause.message : String(cause))
} finally {
  if (errors.length) fail('화면 오류', errors.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
