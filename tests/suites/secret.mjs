import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'secret'), { recursive: true })
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
await page.addInitScript(readFileSync(join(HERE, '..', 'peek.js'), 'utf8'))
await page.addInitScript(() => window.__installMockFs())

const TOKEN = 'github_pat_SECRET_1234567890abcdef'

const openSettings = async () => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(600)
}
const tokenField = () => page.evaluate(() => ({
  input: document.querySelector('#gh-token') !== null,
  value: document.querySelector('#gh-token')?.value ?? null,
  mask: document.querySelector('.token-mask')?.textContent.trim() ?? null,
  change: [...document.querySelectorAll('#set-token button')].some((one) => one.textContent.trim() === '변경'),
  cancel: [...document.querySelectorAll('#set-token button')].some((one) => one.textContent.trim() === '취소'),
}))
/** 저장이 끝나기를 기다립니다. 글자를 칠 때마다 저장하므로 잠깐 뒤에 봐야 합니다. */
const stored = async () => {
  await page.waitForTimeout(500)
  return page.evaluate(() => window.__githubConfigs())
}
const onlyVault = (configs) => Object.values(configs)[0]
/*
 * 새로 고침. 가짜 폴더 손잡이는 새로 고침을 넘기지 못하므로 폴더를 다시 엽니다.
 * 설정은 폴더 이름으로 찾으므로 같은 폴더를 열면 같은 설정이 나옵니다.
 */
const reload = async () => {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  if (await page.locator('button:has-text("폴더 열기")').count()) await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(600)
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. 값이 없을 때는 입력란이 보인다')
  await openSettings()
  const empty = await tokenField()
  console.log('  ' + JSON.stringify(empty))
  expect('입력란이 있음', empty.input && empty.value === '', JSON.stringify(empty))
  expect('별표도 변경 단추도 없음', empty.mask === null && !empty.change, JSON.stringify(empty))

  step('2. 저장소에는 봉한 꼴로만 남는다')
  await page.fill('#gh-token', TOKEN)
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  const saved = onlyVault(await stored())
  console.log('  ' + JSON.stringify({ sealed: saved.sealed, token: saved.token }))
  expect('봉해져 있음', saved.sealed === true, JSON.stringify(saved))
  expect('풀면 제 값', saved.token === TOKEN, saved.token)
  // 봉한 바이트 어디에도 글자 그대로는 없어야 합니다.
  const rawText = await page.evaluate(async () => JSON.stringify(await window.__peekIdb('mdwiki:github-config')))
  expect('글자 그대로는 어디에도 없음', !rawText.includes(TOKEN) && !rawText.includes('SECRET'), rawText.slice(0, 200))
  const key = await page.evaluate(() => window.__secretKey())
  console.log('  열쇠: ' + JSON.stringify(key))
  expect('열쇠는 꺼낼 수 없는 AES-GCM 256', key && key.algorithm === 'AES-GCM'
    && key.length === 256 && key.extractable === false, JSON.stringify(key))

  step('3. 입력란을 치우면 별표와 변경 단추만 남는다')
  await page.click('.sheet-close')
  await page.waitForTimeout(200)
  await openSettings()
  const masked = await tokenField()
  console.log('  ' + JSON.stringify(masked))
  expect('입력란이 사라짐', !masked.input, JSON.stringify(masked))
  expect('별표가 섬', masked.mask === '**********', JSON.stringify(masked))
  expect('변경 단추가 있음', masked.change, JSON.stringify(masked))
  await page.locator('#set-token').screenshot({ path: join(HERE, '..', 'shots', 'secret', '01-masked.png') })

  step('4. 다시 열어도(새로 고침) 풀어서 쓴다')
  await reload()
  await openSettings()
  const after = await tokenField()
  expect('여전히 별표', after.mask === '**********' && !after.input, JSON.stringify(after))
  // 동기화가 돌아가려면 풀린 토큰이 요청에 실려야 합니다. 가짜 GitHub 이 받은 것을 봅니다.
  await page.click('.sheet-close')
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), { timeout: 30000 })
  await page.waitForTimeout(600)
  const seen = github.lastAuth()
  console.log('  가짜 GitHub 이 받은 인증: ' + String(seen))
  expect('풀린 토큰으로 요청함', seen === `Bearer ${TOKEN}` || seen === `token ${TOKEN}`, String(seen))
  // 결과 창이 떠 있으면 닫습니다.
  if (await page.locator('.sheet-close').count()) await page.click('.sheet-close')
  await page.waitForTimeout(300)

  step('5. 변경을 누르면 빈 입력란과 취소가 나온다')
  await openSettings()
  await page.click('#set-token button:has-text("변경")')
  await page.waitForTimeout(200)
  const editing = await tokenField()
  console.log('  ' + JSON.stringify(editing))
  expect('빈 입력란', editing.input && editing.value === '', JSON.stringify(editing))
  expect('취소 단추가 있음', editing.cancel, JSON.stringify(editing))
  // 아직 아무것도 치지 않았으니 저장된 토큰은 그대로여야 합니다.
  expect('저장된 것은 그대로', onlyVault(await stored()).token === TOKEN)

  step('6. 치다가 물러서면 쓰던 토큰으로 돌아간다')
  await page.fill('#gh-token', '반쯤 친 것')
  expect('치는 동안은 그것이 저장됨', onlyVault(await stored()).token === '반쯤 친 것')
  await page.click('#set-token button:has-text("취소")')
  await page.waitForTimeout(200)
  const restored = await tokenField()
  expect('별표로 돌아옴', restored.mask === '**********' && !restored.input, JSON.stringify(restored))
  expect('쓰던 토큰이 되살아남', onlyVault(await stored()).token === TOKEN)

  step('7. 새 토큰을 넣고 확인하면 별표로 돌아간다')
  await page.click('#set-token button:has-text("변경")')
  await page.fill('#gh-token', 'pat')
  await page.click('#set-token button:has-text("확인")')
  await page.waitForTimeout(800)
  const swapped = await tokenField()
  expect('확인 뒤 별표', swapped.mask === '**********' && !swapped.input, JSON.stringify(swapped))
  const now = onlyVault(await stored())
  expect('새 토큰이 봉해져 저장됨', now.token === 'pat' && now.sealed, JSON.stringify(now))

  /*
   * 잘못된 토큰으로 확인을 누르면, 앞서 띄워 둔 계정과 저장소 목록이 그대로 남아
   * 이번 토큰이 통한 것으로 읽혔습니다. 그 목록에서 저장소를 고르게 되는 것입니다.
   */
  step('7-2. 잘못된 토큰이면 알리고, 값과 저장소 목록을 거둔다')
  const before = await page.evaluate(() => ({
    repos: document.querySelectorAll('.repo-list li').length,
    viewer: document.querySelector('#set-token .pill-ok')?.textContent ?? null,
  }))
  console.log('  확인 전: ' + JSON.stringify(before))
  expect('앞서 확인한 목록이 떠 있음', before.repos > 0 && before.viewer !== null, JSON.stringify(before))
  await page.click('#set-token button:has-text("변경")')
  await page.fill('#gh-token', 'wrong-token')
  github.failOnce(401, 'Bad credentials')
  await page.click('#set-token button:has-text("확인")')
  await page.waitForTimeout(800)
  const rejected = await page.evaluate(() => ({
    error: document.querySelector('#set-token .status-error')?.textContent ?? null,
    input: document.querySelector('#gh-token')?.value ?? null,
    mask: document.querySelector('.token-mask') !== null,
    repos: document.querySelectorAll('.repo-list li').length,
    viewer: document.querySelector('#set-token .pill-ok')?.textContent ?? null,
  }))
  console.log('  ' + JSON.stringify(rejected))
  expect('토큰 칸 아래에 잘못됐다고 알림',
    (rejected.error ?? '').includes('토큰이 유효하지 않습니다'), JSON.stringify(rejected))
  expect('입력란이 비워짐', rejected.input === '' && !rejected.mask, JSON.stringify(rejected))
  expect('저장소 목록과 계정 표시가 거둬짐', rejected.repos === 0 && rejected.viewer === null, JSON.stringify(rejected))
  expect('저장된 토큰도 비워짐', onlyVault(await stored()).token === '')
  // 저장소·브랜치 같은 나머지 설정은 손대지 않습니다.
  const kept = await page.evaluate(() => document.querySelector('#gh-owner')?.value ?? null)
  expect('저장소 설정은 그대로', kept === 'tester', String(kept))
  // 다시 치기 시작하면 알림은 걷힙니다.
  await page.fill('#gh-token', 'pat')
  await page.waitForTimeout(200)
  expect('치기 시작하면 알림이 걷힘',
    (await page.evaluate(() => document.querySelector('#set-token .status-error'))) === null)

  step('8. 글자 그대로 적혀 있던 옛 토큰은 읽는 김에 봉한다')
  await page.click('.sheet-close')
  await page.evaluate(async () => {
    // 옛 저장분 흉내. 폴더별로는 갈라져 있지만 토큰이 글자 그대로입니다.
    const configs = await window.__peekIdb('mdwiki:github-config')
    for (const one of Object.values(configs)) one.token = '옛날식'
    const db = await new Promise((resolve) => {
      const request = indexedDB.open('keyval-store')
      request.onsuccess = () => resolve(request.result)
    })
    await new Promise((resolve) => {
      const tx = db.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(configs, 'mdwiki:github-config')
      tx.oncomplete = resolve
    })
    db.close()
  })
  await reload()
  const migrated = onlyVault(await stored())
  console.log('  ' + JSON.stringify({ sealed: migrated.sealed, token: migrated.token }))
  expect('봉해졌고 값은 그대로', migrated.sealed && migrated.token === '옛날식', JSON.stringify(migrated))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
