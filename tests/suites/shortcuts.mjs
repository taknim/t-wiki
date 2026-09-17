import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'shortcuts'), { recursive: true })
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
await page.addInitScript(() => window.__installMockFs())

// 맥은 ⌘, 그 밖은 Ctrl. 시험대가 어디서 돌든 같은 뜻의 글쇠를 누릅니다.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const press = (combo) => page.keyboard.press(combo.replace('Mod', MOD))
const focused = () => page.evaluate(() => {
  const el = document.activeElement
  return el ? `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}` : null
})
const mode = () => page.evaluate(() =>
  document.querySelector('.mode-switch button.is-active')?.getAttribute('aria-label') ?? null)

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. ⌘/ 와 단추로 단축키 목록이 단추 아래에 뜨고, Esc·바깥 누르기로 닫힌다')
  await press('Mod+/')
  await page.waitForSelector('.shortcuts-pop', { timeout: 3000 })
  // 덮개도 닫기 단추도 없이, 단추 바로 아래에 붙습니다.
  const placed = await page.evaluate(() => {
    const pop = document.querySelector('.shortcuts-pop').getBoundingClientRect()
    const anchor = document.querySelector('.topbar button[aria-label="단축키"]').getBoundingClientRect()
    return {
      overlay: document.querySelector('.overlay') !== null,
      close: document.querySelector('.shortcuts-pop .sheet-close') !== null,
      below: Math.round(pop.top - anchor.bottom),
      rightGap: Math.round(anchor.right - pop.right),
    }
  })
  console.log('  ' + JSON.stringify(placed))
  expect('덮개가 없음', !placed.overlay, JSON.stringify(placed))
  expect('닫기 단추가 없음', !placed.close, JSON.stringify(placed))
  expect('단추 바로 아래, 오른쪽을 맞춤', placed.below >= 0 && placed.below <= 12 && Math.abs(placed.rightGap) <= 2, JSON.stringify(placed))
  const listed = await page.evaluate(() =>
    [...document.querySelectorAll('.shortcut-row')].map((one) => ({
      label: one.querySelector('.shortcut-label').textContent,
      keys: one.querySelector('.shortcut-keys').textContent,
    })))
  console.log('  ' + listed.length + '줄: ' + listed.slice(0, 5).map((one) => one.keys).join(', ') + ' …')
  for (const want of ['검색으로 가기', '새 문서', '보기 모드 바꾸기', 'GitHub 동기화 실행', '설정 열기', '이 단축키 목록', '굵게', '지금 바로 저장', '맨 위에 뜬 창 닫기']) {
    expect(`목록에 "${want}"`, listed.some((one) => one.label.includes(want)), JSON.stringify(listed.map((one) => one.label)))
  }
  // ⌘N 은 브라우저가 가로채므로 사연이 적혀 있어야 합니다.
  const newDocRow = listed.find((one) => one.label.startsWith('새 문서'))
  expect('⌘N 사연이 적힘', newDocRow?.label.includes('가로채') ?? false, JSON.stringify(newDocRow))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'shortcuts', '01-list.png'), clip: { x: 700, y: 0, width: 600, height: 700 } })
  const width = Math.round((await page.locator('.shortcuts-pop').boundingBox()).width)
  expect('창이 좁음', width <= 460, String(width))
  await press('Escape')
  await page.waitForTimeout(300)
  expect('Esc 로 닫힘', (await page.locator('.shortcuts-pop').count()) === 0)
  await page.click('.topbar button[aria-label="단축키"]')
  await page.waitForSelector('.shortcuts-pop', { timeout: 3000 })
  ok('단추로도 뜸')
  await page.mouse.click(600, 500)
  await page.waitForTimeout(300)
  expect('바깥을 누르면 닫힘', (await page.locator('.shortcuts-pop').count()) === 0)
  await page.click('.topbar button[aria-label="단축키"]')
  await page.waitForSelector('.shortcuts-pop', { timeout: 3000 })
  await page.click('.topbar button[aria-label="단축키"]')
  await page.waitForTimeout(300)
  expect('단추를 다시 누르면 닫힘', (await page.locator('.shortcuts-pop').count()) === 0)
  await press('Mod+/')
  await page.waitForSelector('.shortcuts-pop', { timeout: 3000 })
  // 같은 글쇠를 다시 누르면 닫힙니다.
  await press('Mod+/')
  await page.waitForTimeout(300)
  expect('⌘/ 를 다시 누르면 닫힘', (await page.locator('.shortcuts-pop').count()) === 0)
  // 단추는 설정 단추 바로 앞에 있습니다.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('.topbar button')].map((one) => one.getAttribute('aria-label') ?? one.textContent.trim()))
  console.log('  머리줄: ' + JSON.stringify(order))
  expect('설정 바로 앞', order.indexOf('단축키') === order.indexOf('설정') - 1, JSON.stringify(order))

  step('2. ⌘P 는 검색 칸으로 간다 — 옆줄이 접혀 있어도')
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForSelector('.main .editor', { timeout: 8000 })
  await page.click('.main .editor')
  expect('편집기에 있음', (await focused()) === 'textarea.editor', String(await focused()))
  await press('Mod+p')
  await page.waitForTimeout(200)
  expect('검색 칸으로 감', (await focused()) === 'input.search-input', String(await focused()))
  // 옆줄을 접고 다시 누릅니다.
  await page.click('.sidebar button[aria-label="사이드바 접기"], .sidebar button[data-tip*="접"]').catch(() => {})
  const railed = await page.evaluate(() => document.querySelector('.sidebar.is-rail') !== null)
  if (railed) {
    await press('Mod+p')
    await page.waitForTimeout(300)
    expect('접힌 옆줄이 펴지고 검색 칸으로 감',
      (await focused()) === 'input.search-input' && !(await page.evaluate(() => document.querySelector('.sidebar.is-rail') !== null)),
      String(await focused()))
  } else {
    ok('(옆줄 접기 단추를 찾지 못해 이 걸음은 건너뜀)')
  }

  step('3. ⌥⌘N 은 새 문서 창을 연다')
  await press('Escape')
  await press('Mod+Alt+n')
  await page.waitForSelector('.dialog', { timeout: 3000 })
  const asked = await page.textContent('.dialog')
  expect('새 문서를 묻는 창', asked.includes('새 문서'), asked.slice(0, 80))
  await press('Escape')
  await page.waitForTimeout(200)

  step('4. ⌘⇧E 는 보기 모드를 돌린다')
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(200)
  const seen = [await mode()]
  for (let at = 0; at < 3; at += 1) {
    await press('Mod+Shift+e')
    await page.waitForTimeout(250)
    seen.push(await mode())
  }
  console.log('  ' + JSON.stringify(seen))
  expect('편집 → 나란히 → 미리보기 → 편집', JSON.stringify(seen) === JSON.stringify(['편집', '나란히', '미리보기', '편집']), JSON.stringify(seen))

  step('5. ⌘, 는 설정을 열고, 편집기의 ⌘B 는 그대로 서식이다')
  await press('Mod+,')
  await page.waitForSelector('.settings-nav', { timeout: 3000 })
  ok('설정이 열림')
  await press('Escape')
  await page.waitForTimeout(300)
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 굵은말')
  await page.keyboard.down('Shift')
  for (let at = 0; at < 3; at += 1) await page.keyboard.press('ArrowLeft')
  await page.keyboard.up('Shift')
  await press('Mod+b')
  await page.waitForTimeout(200)
  const text = await page.evaluate(() => document.querySelector('.main .editor').value)
  expect('⌘B 는 굵게', text.includes('**굵은말**'), text.slice(-40))
  expect('설정이 열리지 않음', (await page.locator('.settings-nav').count()) === 0)

  step('6. ⌘⇧1 · ⌘⇧2 는 옆줄 탭을, ⌘⇧B 는 옆줄을 접고 편다')
  const tab = () => page.evaluate(() => document.querySelector('.sidebar-tablist button.is-active')?.textContent.trim() ?? null)
  await press('Mod+Shift+2')
  await page.waitForTimeout(200)
  expect('즐겨찾기 탭', (await tab()) === '즐겨찾기', String(await tab()))
  // 아직 담긴 것이 없으니 검색 칸이 잡힙니다. 옮겨 간 뒤 자리가 그쪽에 있어야 곧바로 화살표가 듣습니다.
  expect('즐겨찾기가 비었으면 검색 칸에 자리', (await focused()) === 'input.search-input', String(await focused()))
  await press('Mod+Shift+1')
  await page.waitForTimeout(200)
  expect('폴더 탭', (await tab()) === '폴더', String(await tab()))
  expect('트리의 고른 줄에 자리가 감', (await focused()) === 'div.tree-row', String(await focused()))
  await page.keyboard.press('ArrowDown')
  expect('곧바로 화살표가 들음', (await focused()) === 'div.tree-row')
  const railBefore = await page.evaluate(() => document.querySelector('.sidebar.is-rail') !== null)
  await press('Mod+Shift+b')
  await page.waitForTimeout(300)
  const railAfter = await page.evaluate(() => document.querySelector('.sidebar.is-rail') !== null)
  expect('옆줄이 접힘', !railBefore && railAfter, `${railBefore} -> ${railAfter}`)
  await press('Mod+Shift+b')
  await page.waitForTimeout(300)
  expect('다시 펴짐', !(await page.evaluate(() => document.querySelector('.sidebar.is-rail') !== null)))
  // 편집기 안에서 ⌘⇧B 를 눌러도 굵게가 아니라 옆줄입니다.
  await page.click('.main .editor')
  await press('Mod+Shift+b')
  await page.waitForTimeout(300)
  expect('편집기 안에서도 옆줄이 접힘', await page.evaluate(() => document.querySelector('.sidebar.is-rail') !== null))
  expect('굵게가 끼어들지 않음', !(await page.evaluate(() => document.querySelector('.main .editor').value.includes('****'))))
  await press('Mod+Shift+b')
  await page.waitForTimeout(300)

  /*
   * 검색 결과에서 쓰던 규칙을 트리와 즐겨찾기에도 폅니다. 검색 칸에서 ↓ 로 내려가
   * 화살표로 줄을 오가고 Enter 로 엽니다. 맨 위에서 ↑ 는 검색 칸으로 돌아갑니다.
   */
  step('7. 폴더 트리를 화살표로 오가고 Enter 로 연다 — 열어 둔 문서에서 시작한다')
  /*
   * 맨 위(뿌리)에서 시작하면 열어 둔 문서까지 한 줄씩 내려가야 합니다.
   * 검색 칸에서 ↓ 로 들어오면 지금 열어 둔 줄(개발 환경.md)이 잡혀야 합니다.
   */
  await press('Mod+p')
  await page.waitForTimeout(200)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(100)
  const rowName = () => page.evaluate(() => {
    const el = document.activeElement
    return el?.classList.contains('tree-row') ? el.querySelector('.tree-name')?.textContent ?? null : `(${el?.tagName})`
  })
  expect('↓ 로 열어 둔 문서 줄에 옴', (await rowName()) === '개발 환경.md', String(await rowName()))
  await page.keyboard.press('ArrowUp')
  expect('한 줄 위는 회사', (await rowName()) === '회사', String(await rowName()))
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  expect('→ 로 폴더가 펴짐', (await page.locator('.tree-row:has-text("온보딩")').count()) === 1)
  await page.keyboard.press('ArrowDown')
  expect('펴진 안으로 내려감', (await rowName()) === '온보딩.md', String(await rowName()))
  await page.keyboard.press('Enter')
  await page.waitForSelector('.doc-head h1:has-text("온보딩")', { timeout: 5000 })
  ok('Enter 로 문서가 열림')
  await page.keyboard.press('ArrowLeft')
  expect('파일에서 ← 는 부모 폴더로', (await rowName()) === '회사', String(await rowName()))
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(200)
  expect('← 로 폴더가 접힘', (await page.locator('.tree-row:has-text("온보딩")').count()) === 0)
  for (let at = 0; at < 4; at += 1) await page.keyboard.press('ArrowUp')
  expect('맨 위에서 ↑ 는 검색 칸으로', (await focused()) === 'input.search-input', String(await focused()))
  // 아무것도 고르지 않았을 때는 뿌리가 아니라 첫 줄에서 시작합니다.
  await page.click('.tree-root')
  await page.waitForTimeout(200)
  await press('Mod+p')
  await page.keyboard.press('ArrowDown')
  expect('뿌리를 골랐으면 뿌리 줄', (await rowName()) === '내 위키', String(await rowName()))

  step('8. 즐겨찾기도 화살표로 오가고 Enter 로 연다 — 열어 둔 것에서 시작한다')
  // 회고를 먼저 담아 첫 줄로 두고, 개발 환경을 열어 둔 채 들어갑니다. 첫 줄이 아니라 열어 둔 줄이 잡혀야 합니다.
  await page.hover('.tree-row:has-text("회고")')
  await page.click('.tree-row:has-text("회고") .tree-tools button[aria-label="즐겨찾기에 담기"]')
  await page.hover('.tree-row:has-text("개발 환경")')
  await page.click('.tree-row:has-text("개발 환경") .tree-tools button[aria-label="즐겨찾기에 담기"]')
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(300)
  await press('Mod+Shift+2')
  await page.waitForTimeout(300)
  const favName = () => page.evaluate(() =>
    document.activeElement?.classList.contains('favorites-item')
      ? document.activeElement.querySelector('.favorites-name')?.textContent ?? null : null)
  const favOrder = await page.evaluate(() => [...document.querySelectorAll('.favorites-name')].map((one) => one.textContent))
  console.log('  즐겨찾기 차례: ' + JSON.stringify(favOrder) + ', 자리: ' + String(await favName()))
  expect('첫 줄은 회고', favOrder[0] === '회고', JSON.stringify(favOrder))
  expect('열어 둔 개발 환경 줄에 자리가 감', (await favName()) === '개발 환경.md', String(await favName()))
  await page.keyboard.press('ArrowUp')
  expect('한 줄 위는 회고', (await favName()) === '회고', String(await favName()))
  await page.keyboard.press('ArrowUp')
  expect('맨 위에서 ↑ 는 검색 칸으로', (await focused()) === 'input.search-input', String(await focused()))
  await page.keyboard.press('ArrowDown')
  expect('검색 칸에서 ↓ 도 열어 둔 줄로', (await favName()) === '개발 환경.md', String(await favName()))
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const opened = await page.evaluate(() => document.querySelector('.doc-head h1')?.textContent ?? null)
  expect('Enter 로 회고 폴더가 열림', opened === '회고', String(opened))

  step('9. ⌘⇧G 는 GitHub 동기화를 돌린다')
  // 아직 저장소를 맞추지 않았으니 단추와 같이 설정 창을 엽니다.
  await press('Mod+Shift+g')
  await page.waitForSelector('.settings-nav', { timeout: 3000 })
  expect('설정이 덜 됐으면 설정 창', (await page.locator('.settings-nav button.is-active').textContent()).includes('GitHub'))
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(400)
  await press('Escape')
  await page.waitForTimeout(300)
  const commitsBefore = github.commitCount
  await press('Mod+Shift+g')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), undefined, { timeout: 30000 })
  await page.waitForTimeout(600)
  console.log(`  커밋 ${commitsBefore} → ${github.commitCount}`)
  expect('맞춰 두었으면 실제로 돎', github.commitCount > commitsBefore, `${commitsBefore} -> ${github.commitCount}`)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
