import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'synchistory'), { recursive: true })
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

const openVault = async (which) => {
  await page.evaluate((x) => { window.__pick = x; window.__mockRoot = window.__vaults[x] }, which)
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
const configure = async (repo) => {
  await openSync()
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', repo)
  await page.waitForTimeout(400)
}
const syncNow = async () => {
  await page.click('button:has-text("지금 동기화")')
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((n) => /지금 동기화|동기화 중/.test(n.textContent))
    return b && !b.disabled && b.textContent.includes('지금 동기화')
  }, { timeout: 25000 })
  await page.waitForTimeout(800)
}
const openHistory = async () => {
  await page.click('button:has-text("지난 결과 보기")')
  await page.waitForSelector('[aria-label="지난 동기화 결과"]', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const closeSheet = async () => {
  await page.click('[aria-label="지난 동기화 결과"] .sheet-close')
  await page.waitForTimeout(300)
}

/** 목록에 늘어선 회차들. */
const rows = () => page.evaluate(() => [...document.querySelectorAll('.run')].map((li) => ({
  when: li.querySelector('.run-when')?.textContent ?? '',
  trigger: li.querySelector('.run-trigger')?.textContent ?? '',
  sum: li.querySelector('.run-sum')?.textContent ?? '',
  sha: li.querySelector('.commit-link')?.textContent ?? null,
})))

const detailLink = () => page.evaluate(() => {
  const a = [...document.querySelectorAll('.sheet a.btn')].find((n) => n.textContent.includes('자세히 보기'))
  return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null
})

/*
 * 백 건 넘게 쌓인 상태를 진짜로 만들려면 백 번을 돌려야 합니다.
 * 대신 저장된 자리에 채워 넣고, 다음 한 회차가 넘치는 것을 버리는지 봅니다.
 */
const stuffHistory = (count) => page.evaluate(async (n) => {
  const db = await new Promise((res, rej) => {
    const request = indexedDB.open('keyval-store')
    request.onsuccess = () => res(request.result)
    request.onerror = () => rej(request.error)
  })
  const read = () => new Promise((res, rej) => {
    const request = db.transaction('keyval', 'readonly').objectStore('keyval').get('mdwiki:sync-history')
    request.onsuccess = () => res(request.result)
    request.onerror = () => rej(request.error)
  })
  const store = await read()
  const key = Object.keys(store)[0]
  const filler = Array.from({ length: n }, (_, i) => ({
    at: 1000 + i, trigger: 'auto', commitSha: null, error: null, log: [], cut: 0,
  }))
  store[key] = [...store[key], ...filler]
  const total = store[key].length
  await new Promise((res, rej) => {
    const tx = db.transaction('keyval', 'readwrite')
    tx.objectStore('keyval').put(store, 'mdwiki:sync-history')
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
  return total
}, count)

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 아직 돌린 적이 없으면 볼 것도 없다')
  await openVault('first')
  await configure('wiki')
  const idle = await page.locator('button:has-text("지난 결과 보기")').isDisabled()
  expect('단추가 잠겨 있음', idle, String(idle))

  step('2. 한 번 돌리면 그 회차가 남는다')
  await syncNow()
  await openHistory()
  const one = await rows()
  console.log('  ' + JSON.stringify(one))
  expect('한 줄이 생김', one.length === 1, JSON.stringify(one))
  expect('무엇이 올라갔는지 적힘', /올림 \d+/.test(one[0].sum), JSON.stringify(one[0]))
  expect('직접 돌린 것으로 셈', one[0].trigger === '직접', JSON.stringify(one[0]))
  expect('커밋 이름이 붙음', one[0].sha !== null && github.headSha.startsWith(one[0].sha),
    one[0].sha + ' vs ' + github.headSha)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '01-one.png') })

  step('3. 회차를 누르면 오간 파일이 펴진다')
  const closed = await page.locator('.run .plan li').count()
  await page.click('.run-open')
  await page.waitForTimeout(300)
  const openedRows = await page.locator('.run .plan li').count()
  expect('펴기 전에는 접혀 있음', closed === 0, String(closed))
  expect('펴면 파일이 보임', openedRows > 0, String(openedRows))
  const anyPath = await page.locator('.run .plan .plan-path').first().textContent()
  console.log('  첫 줄: ' + anyPath)
  expect('경로가 적혀 있음', (anyPath ?? '').includes('.md'), String(anyPath))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '02-open.png') })

  step('4. 자세히 보기는 그 저장소의 커밋 목록으로 간다')
  const link = await detailLink()
  console.log('  ' + JSON.stringify(link))
  expect('저장소와 브랜치가 주소에 들어감',
    link?.href === 'https://github.com/tester/wiki/commits/main/', JSON.stringify(link))
  expect('새 탭으로 열림', link?.target === '_blank', JSON.stringify(link))
  expect('opener 를 넘기지 않음', String(link?.rel).includes('noopener'), JSON.stringify(link))

  step('5. 오갈 것이 없던 회차도 남되, 걸러 볼 수 있다')
  await closeSheet()
  await syncNow()
  await openHistory()
  const two = await rows()
  console.log('  ' + JSON.stringify(two))
  expect('두 줄로 늘어남', two.length === 2, JSON.stringify(two))
  expect('새것이 위에 옴', two[0].sum === '변화 없음', JSON.stringify(two[0]))
  await page.click('.checkbox:has-text("오간 회차만") input')
  await page.waitForTimeout(300)
  const filtered = await rows()
  expect('거르면 한 줄만 남음', filtered.length === 1, JSON.stringify(filtered))
  expect('남은 것은 오간 회차', /올림 \d+/.test(filtered[0].sum), JSON.stringify(filtered[0]))
  await page.click('.checkbox:has-text("오간 회차만") input')
  await page.waitForTimeout(200)

  step('6. 하위 폴더를 정하면 그 아래 커밋만 보러 간다')
  await closeSheet()
  await page.fill('input[placeholder^="저장소 안 하위 폴더"]', '노트')
  await page.waitForTimeout(400)
  await openHistory()
  const under = await detailLink()
  console.log('  ' + JSON.stringify(under))
  expect('하위 폴더가 주소 끝에 붙음',
    under?.href === 'https://github.com/tester/wiki/commits/main/%EB%85%B8%ED%8A%B8/',
    JSON.stringify(under))
  await closeSheet()
  await page.fill('input[placeholder^="저장소 안 하위 폴더"]', '')
  await page.waitForTimeout(400)

  step('7. 새로고침해도 기록은 남는다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault('first')
  await openSync()
  await openHistory()
  const kept = await rows()
  console.log('  ' + kept.length + '줄')
  expect('두 줄이 그대로 있음', kept.length === 2, JSON.stringify(kept))

  step('8. 백 건을 넘으면 오래된 것부터 버린다')
  await closeSheet()
  const stuffed = await stuffHistory(150)
  console.log('  채워 넣은 뒤: ' + stuffed + '건')
  await syncNow()
  await openHistory()
  const capped = await rows()
  console.log('  돌린 뒤: ' + capped.length + '줄')
  expect('백 줄에서 멈춤', capped.length === 100, String(capped.length))
  expect('가장 새것이 맨 위', capped[0].when.includes('.'), JSON.stringify(capped[0]))

  /*
   * 목록 안에 두면 백 줄을 굴려 내려가야 닿습니다. 창 안에 있는지가 아니라
   * 창의 보이는 테두리 안에 있는지를 봅니다. 굴림 칸 밖으로 밀려난 것도 창 안입니다.
   */
  const reach = await page.evaluate(() => {
    const sheet = document.querySelector('[aria-label="지난 동기화 결과"]')
    const link = [...sheet.querySelectorAll('a.btn')].find((n) => n.textContent.includes('자세히 보기'))
    if (!link) return null
    const box = link.getBoundingClientRect()
    const outer = sheet.getBoundingClientRect()
    return { bottom: Math.round(box.bottom), edge: Math.round(outer.bottom) }
  })
  console.log('  ' + JSON.stringify(reach))
  expect('자세히 보기가 창 테두리 안에 있음',
    reach !== null && reach.bottom <= reach.edge, JSON.stringify(reach))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '03-capped.png') })

  step('9. 폴더가 다르면 기록도 남남이다')
  await closeSheet()
  await page.click('[aria-label="설정"] .sheet-close')
  await page.waitForTimeout(300)
  await closeVault()
  await openVault('other')
  await openSync()
  const alone = await page.locator('button:has-text("지난 결과 보기")').isDisabled()
  expect('처음 여는 폴더에는 기록이 없음', alone, String(alone))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
