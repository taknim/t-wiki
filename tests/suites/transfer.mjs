import { chromium } from 'playwright'
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.route('https://api.github.com/**', github.handler)
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(readFileSync(join(HERE, '..', 'peek.js'), 'utf8'))
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
/*
 * 지금 폴더의 토큰. 화면에는 별표로만 나오므로 저장소에서 풀어 봅니다.
 * 입력란이 서 있으면(값이 없을 때) 그 값입니다.
 */
const currentToken = () => page.evaluate(async () => {
  if (!document.querySelector('.token-mask')) return document.querySelector('#gh-token')?.value ?? ''
  const stored = await window.__githubConfigFor(window.__vaults[window.__pick].name)
  return stored?.token ?? '(별표만 있고 저장된 값은 없음)'
})
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
/*
 * 내보내기는 내려받지 않고 고른 자리에 곧바로 씁니다.
 * 목이 그 자리를 들고 있으므로, 거기서 꺼내 진짜 파일로 옮겨 두었다가
 * 가져오기 시험에 다시 씁니다.
 */
const PASSPHRASE = '열쇠 말 1234'
/** 토큰을 담는 회차에 뜨는 암호 창을 채웁니다. 뜨지 않으면 그냥 지나갑니다. */
const passLock = async () => {
  const box = page.locator('.dialog input[type="password"]')
  if (await box.count()) {
    await box.fill(PASSPHRASE)
    await page.click('.dialog button:has-text("잠그고 내보내기")')
  }
}
const exportTo = async (withToken) => {
  const box = page.locator('.checkbox:has-text("액세스 토큰도 함께") input')
  if ((await box.isChecked()) !== withToken) await box.click()
  await page.click('button:has-text("설정 내보내기")')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.click('.dialog button:has-text("내보내기")')
  if (withToken) {
    // 토큰을 담는 회차는 잠글 암호를 묻습니다.
    await page.waitForSelector('.dialog input[type="password"]', { timeout: 5000 })
    await page.fill('.dialog input[type="password"]', PASSPHRASE)
    await page.click('.dialog button:has-text("잠그고 내보내기")')
  }
  await page.waitForTimeout(700)
  const saved = await page.evaluate(async () => {
    const names = window.__savedNames()
    const name = names[names.length - 1]
    return { name, body: name ? await window.__savedText(name) : null }
  })
  if (!saved.name) throw new Error('저장된 파일이 없습니다')
  const to = join(DOWN, saved.name)
  writeFileSync(to, saved.body)
  return { path: to, name: saved.name }
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

  step('3. 토큰을 포함해 내보내면 암호로 잠근 꼴로 들어 있다')
  const full = await exportTo(true)
  const fullText = readFileSync(full.path, 'utf8')
  const fullBody = JSON.parse(fullText)
  console.log('  ' + JSON.stringify(fullBody.github.token).slice(0, 120))
  expect('토큰이 잠근 꼴로 담김',
    fullBody.github.token?.kdf === 'PBKDF2-SHA-256' && typeof fullBody.github.token.data === 'string',
    JSON.stringify(fullBody.github.token))
  expect('글자 그대로는 어디에도 없음', !fullText.includes('비밀토큰'), fullText.slice(0, 200))
  expect('저장소는 담김', fullBody.github.repo === 'wiki', JSON.stringify(fullBody.github))
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
  // 잠근 토큰을 풀 암호를 묻습니다. 틀리면 다시 묻고, 맞으면 들어갑니다.
  await page.waitForSelector('.dialog input[type="password"]', { timeout: 5000 })
  await page.fill('.dialog input[type="password"]', '엉뚱한 말')
  await page.click('.dialog button:has-text("풀기")')
  await page.waitForTimeout(600)
  const again = await page.textContent('.dialog')
  expect('틀리면 다시 물음', again.includes('암호가 맞지 않습니다'), again.slice(0, 120))
  await page.fill('.dialog input[type="password"]', PASSPHRASE)
  await page.click('.dialog button:has-text("풀기")')
  await page.waitForTimeout(700)
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(400)
  const landed = await page.evaluate(() => ({
    owner: document.querySelector('#gh-owner').value,
    repo: document.querySelector('.row input[placeholder="저장소 이름"]').value,
    minutes: document.querySelector('#gh-interval')?.value,
    theme: document.documentElement.dataset.theme,
  }))
  landed.token = await currentToken()
  console.log('  ' + JSON.stringify(landed))
  expect('토큰이 들어옴', landed.token === '비밀토큰', landed.token)
  expect('저장소가 들어옴', landed.repo === 'wiki' && landed.owner === 'tester', JSON.stringify(landed))
  expect('간격도 들어옴', landed.minutes === '7', String(landed.minutes))

  step('4-2. 암호를 넣지 않고 물러서면 토큰만 빼고 들여온다')
  await page.click('.settings-nav button:has-text("일반")')
  await page.setInputFiles('#settings-bundle', full.path)
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.click('.dialog button:has-text("적용")')
  await page.waitForSelector('.dialog input[type="password"]', { timeout: 5000 })
  await page.click('.dialog button:has-text("취소")')
  await page.waitForTimeout(700)
  const skipped = await page.textContent('.settings-section')
  expect('토큰은 뺐다고 알림', skipped.includes('액세스 토큰은 빼고'), skipped.slice(0, 200))
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(400)
  // 있던 토큰은 지우지 않습니다. 빈 값으로 덮으면 토큰이 사라집니다.
  expect('있던 토큰은 그대로', (await currentToken()) === '비밀토큰')
  expect('테마도 따라옴', landed.theme === 'nord', String(landed.theme))
  await page.click('.sheet-close')

  /*
   * 파일에 적힌 반복 횟수를 그대로 믿으면, 수십억으로 고쳐 둔 파일을 들여올 때 풀다가
   * 탭이 멎습니다. 그런 값은 잠근 꼴로 치지 않고 토큰만 빼고 들여와야 합니다.
   */
  step('4-3. 반복 횟수가 터무니없는 파일은 풀려 들지 않는다')
  const bomb = JSON.parse(readFileSync(full.path, 'utf8'))
  bomb.github.token.iterations = 2_000_000_000
  const bombPath = join(DOWN, 'bomb.json')
  writeFileSync(bombPath, JSON.stringify(bomb))
  if (!(await page.locator('.settings-nav').count())) await openSettings()
  await page.click('.settings-nav button:has-text("일반")')
  await page.setInputFiles('#settings-bundle', bombPath)
  await page.waitForSelector('.dialog', { timeout: 5000 })
  const bombNote = await page.textContent('.dialog')
  expect('토큰이 없는 것으로 봄', bombNote.includes('액세스 토큰은 들어 있지 않습니다'), bombNote.slice(0, 200))
  await page.click('.dialog button:has-text("적용")')
  // 암호 창이 뜨면 풀려고 든 것입니다. 잠깐 기다려도 창이 없어야 합니다.
  await page.waitForTimeout(800)
  expect('암호를 묻지 않음', (await page.locator('.dialog input[type="password"]').count()) === 0)
  expect('화면이 멎지 않음', (await page.evaluate(() => 1 + 1)) === 2)

  step('5. 첫 폴더 설정은 그대로다')
  await closeVault()
  await openVault('first')

  /*
   * 그림 뒤에 깔 바탕부터 고쳐 둡니다. 아래에서 이미지 미리보기를 꺼 버리므로,
   * 그 뒤에는 고를 줄 자체가 화면에 없습니다.
   */
  await page.click('.sidebar-tablist button:has-text("폴더")')
  await page.waitForSelector('.tree', { timeout: 8000 })
  // 이미 펴져 있는 폴더를 또 누르면 도로 접힙니다.
  if (!(await page.locator('.tree-row:has-text("도표")').count())) {
    await page.click('.tree-row:has-text("첨부") .tree-caret')
    await page.waitForTimeout(300)
  }
  await page.click('.tree-row:has-text("도표")')
  await page.waitForSelector('.backdrop-switch', { timeout: 8000 })
  await page.click('.backdrop-switch button:text-is("어둡게")')
  await page.waitForTimeout(300)

  await openSettings()
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(400)
  const origin = await currentToken()
  expect('원래 폴더도 제 값을 지킴', origin === '비밀토큰', origin)
  await page.click('.sheet-close')

  step('6. 엉뚱한 파일은 받지 않는다')
  await openSettings()
  const junk = join(DOWN, 'junk.json')
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
  // 물러섭니다. 파일이 생기면 안 됩니다.
  const madeBefore = await page.evaluate(() => window.__savedNames().length)
  await page.click('.dialog button:has-text("취소")')
  await page.waitForTimeout(800)
  const madeAfter = await page.evaluate(() => window.__savedNames().length)
  expect('물러서면 파일이 생기지 않음', madeAfter === madeBefore, `${madeBefore} -> ${madeAfter}`)

  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(300)
  const beforeCancel = await currentToken()
  await page.setInputFiles('#settings-bundle', plain.path)
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("취소")')
  await page.waitForTimeout(500)
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(300)
  const tokenAfterCancel = await currentToken()
  expect('물러서면 설정도 그대로', tokenAfterCancel === beforeCancel, `${beforeCancel} -> ${tokenAfterCancel}`)
  await page.click('.sheet-close')

  step('7. 브라우저에 남는 취향이 하나도 빠지지 않는다')
  /*
   * 앱이 localStorage 에 적어 두는 값을 통째로 견줍니다.
   * 새 설정을 더하면서 꾸러미에 넣는 것을 잊으면 여기서 걸립니다.
   * 폴더에 딸린 값(기준점·손잡이)은 일부러 담지 않으므로 여기서 보지 않습니다.
   */
  await closeVault()
  await openVault('first')

  /*
   * 그림 뒤에 깔 바탕부터 고쳐 둡니다. 아래에서 이미지 미리보기를 꺼 버리므로,
   * 그 뒤에는 고를 줄 자체가 화면에 없습니다.
   */
  await page.click('.sidebar-tablist button:has-text("폴더")')
  await page.waitForSelector('.tree', { timeout: 8000 })
  // 이미 펴져 있는 폴더를 또 누르면 도로 접힙니다.
  if (!(await page.locator('.tree-row:has-text("도표")').count())) {
    await page.click('.tree-row:has-text("첨부") .tree-caret')
    await page.waitForTimeout(300)
  }
  await page.click('.tree-row:has-text("도표")')
  await page.waitForSelector('.backdrop-switch', { timeout: 8000 })
  await page.click('.backdrop-switch button:text-is("어둡게")')
  await page.waitForTimeout(300)

  await openSettings()
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  // 이미 토큰이 있어 별표가 서 있습니다. 바꾸려면 변경을 눌러 입력란을 받습니다.
  await page.click('#set-token button:has-text("변경")')
  await page.fill('#gh-token', '토큰2')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.click('.settings-nav button:has-text("모양")')
  await page.click('.theme-card:has-text("세피아")')
  // 줄 간격도 기본에서 옮겨 둡니다. 꾸러미에 넣는 것을 잊으면 여기서 걸립니다.
  await page.click('[aria-label="줄 간격"] button:has-text("넓게")')
  // 그림 자리와 최대 너비도 같은 까닭으로 옮겨 둡니다.
  await page.click('[aria-label="이미지 정렬"] button:text-is("가운데")')
  await page.click('[aria-label="이미지 최대 너비"] button:text-is("보통")')
  await page.click('.settings-nav button:has-text("일반")')
  // 이 화면에서 켜고 끌 수 있는 것을 모두 뒤집어 둡니다.
  for (const label of ['마지막 상태로', '고른 이미지를', '워드·엑셀', '줄 끝 공백', '들여쓰기 다시 잡기', '옮긴 지 오래된']) {
    await page.click(`.checkbox:has-text("${label}") input`)
  }
  // 휴지통 날수도 기본에서 옮겨 둡니다.
  await page.fill('#trash-days', '45')
  await page.waitForTimeout(400)
  await page.click('.sheet-close')

  // 나란히 보기의 몫도 옮겨 둡니다. 이것도 기억되는 취향입니다.
  await page.click('.tree-row:has-text("개발 환경")')
  await page.waitForSelector('.editor', { timeout: 8000 })
  await page.waitForTimeout(400)
  const splitter = await page.locator('.split-resizer').boundingBox()
  await page.mouse.move(splitter.x + 3, splitter.y + 120)
  await page.mouse.down()
  await page.mouse.move(splitter.x + 3 - 150, splitter.y + 120, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)

  // 옆줄을 즐겨찾기 탭으로 돌려 둡니다. 어느 탭을 보고 있었는지도 기억되는 취향입니다.
  await page.hover('.tree-row:has-text("개발 환경")')
  await page.click('.tree-row:has-text("개발 환경") .tree-tools button[aria-label="즐겨찾기에 담기"]')
  await page.waitForTimeout(300)
  await page.click('.sidebar-tablist button:has-text("즐겨찾기")')
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
  /*
   * 설정 창의 책갈피(마지막에 보던 갈래)는 취향이 아니라 담지 않습니다.
   * 견줄 때도 뺍니다. 다른 기기가 알 일이 아닙니다.
   */
  const BOOKMARKS = ['mdwiki:settings-spot']
  const before = await page.evaluate((skip) =>
    Object.fromEntries(Object.keys(localStorage)
      .filter((key) => key.startsWith('mdwiki:') && !skip.includes(key))
      .sort()
      .map((key) => [key, localStorage.getItem(key)])), BOOKMARKS)
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
  // 토큰이 담긴 파일이라 풀 암호를 묻습니다.
  await page.waitForSelector('.dialog input[type="password"]', { timeout: 5000 })
  await page.fill('.dialog input[type="password"]', PASSPHRASE)
  await page.click('.dialog button:has-text("풀기")')
  await page.waitForTimeout(700)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)

  const after = await page.evaluate((skip) =>
    Object.fromEntries(Object.keys(localStorage)
      .filter((key) => key.startsWith('mdwiki:') && !skip.includes(key))
      .sort()
      .map((key) => [key, localStorage.getItem(key)])), BOOKMARKS)
  console.log('  들여온 뒤:   ' + JSON.stringify(after))

  const missing = Object.keys(before).filter((key) => before[key] !== after[key])
  expect('빠진 취향이 없음', missing.length === 0,
    '되돌아오지 않은 값: ' + JSON.stringify(missing.map((k) => [k, before[k], after[k]])))

  step('8. 저장 창을 그냥 닫으면 아무 일도 없다')
  await openSettings()
  const kept = await page.evaluate(() => {
    window.__saveCancel = true
    return window.__savedNames().length
  })
  await page.click('button:has-text("설정 내보내기")')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("내보내기")')
  await page.waitForTimeout(300)
  await passLock()
  await page.waitForTimeout(800)
  const afterCancel = await page.evaluate(() => {
    window.__saveCancel = false
    return { count: window.__savedNames().length, note: document.body.textContent.includes('저장하지 못했습니다') }
  })
  console.log('  ' + JSON.stringify(afterCancel))
  expect('파일이 생기지 않음', afterCancel.count === kept, `${kept} -> ${afterCancel.count}`)
  expect('오류라고 하지 않음', !afterCancel.note, '창을 닫은 것은 잘못이 아닙니다')

  step('9. 열어 둔 폴더 안에 저장하려 하면 한 번 더 묻는다')
  /*
   * 볼트 안에 두면 그 파일도 동기화 대상이 됩니다. 토큰이 든 채로 저장소에 올라가면
   * 커밋 기록에 남아 되돌리기 어려우므로, 쓰기 전에 묻고 그 뒤에도 알려 줘야 합니다.
   */
  await page.evaluate(() => { window.__saveInto = 'vault' })
  await page.click('button:has-text("설정 내보내기")')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("내보내기")')
  await page.waitForTimeout(300)
  await passLock()
  await page.waitForSelector('.dialog:has-text("열어 둔 폴더 안에")', { timeout: 5000 })
  const second = await page.textContent('.dialog')
  console.log('  ' + second.replace(/\s+/g, ' ').slice(0, 110))
  expect('저장소로 올라간다고 알림', second.includes('저장소에 올라갑니다'), second.slice(0, 160))
  await page.click('.dialog button:has-text("취소")')
  await page.waitForTimeout(500)
  const notWritten = await page.evaluate(async () => {
    const names = []
    for await (const [name] of window.__mockRoot.entries()) names.push(name)
    return names.filter((n) => n.startsWith('t-WiKi'))
  })
  expect('물러서면 폴더에 쓰지 않음', notWritten.length === 0, JSON.stringify(notWritten))

  await page.click('button:has-text("설정 내보내기")')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("내보내기")')
  await page.waitForTimeout(300)
  await passLock()
  await page.waitForSelector('.dialog:has-text("열어 둔 폴더 안에")', { timeout: 5000 })
  await page.click('.dialog button:has-text("그래도 저장")')
  await page.waitForTimeout(800)
  const written = await page.evaluate(async () => {
    const names = []
    for await (const [name] of window.__mockRoot.entries()) names.push(name)
    return {
      files: names.filter((n) => n.startsWith('t-WiKi')),
      warned: document.querySelector('.transfer-warn')?.textContent ?? null,
    }
  })
  console.log('  ' + JSON.stringify(written))
  expect('그래도 저장하면 폴더에 씀', written.files.length === 1, JSON.stringify(written.files))
  expect('올라간다고 눈에 띄게 알림',
    (written.warned ?? '').includes('저장소로 함께 올라갑니다'), String(written.warned))
  await page.evaluate(() => { window.__saveInto = 'outside' })
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
