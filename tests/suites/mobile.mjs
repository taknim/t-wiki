import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'mobile'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
// 손전화 크기. 손을 얹을 수 없는 기기라는 것도 함께 흉내 냅니다(hover: none).
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => window.__installMockFs())

const layout = () => page.evaluate(() => {
  const aside = document.querySelector('.sidebar')
  const rect = aside?.getBoundingClientRect()
  const style = aside ? getComputedStyle(aside) : null
  return {
    rail: aside?.classList.contains('is-rail') ?? null,
    shown: aside ? style.display !== 'none' : false,
    fixed: style?.position ?? null,
    width: rect ? Math.round(rect.width) : null,
    backdrop: document.querySelector('.sidebar-backdrop') !== null,
    mainLeft: Math.round(document.querySelector('.main').getBoundingClientRect().left),
    mainWidth: Math.round(document.querySelector('.main').getBoundingClientRect().width),
    menu: (() => { const b = document.querySelector('.menu-toggle'); return b ? getComputedStyle(b).display !== 'none' : false })(),
  }
})

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree-row, .main', { timeout: 10000 })
  await page.waitForTimeout(600)

  step('1. 좁은 화면에서는 옆줄이 닫힌 채 시작하고 본문이 화면을 다 쓴다')
  const closed = await layout()
  console.log('  ' + JSON.stringify(closed))
  expect('옆줄이 그려지지 않음', closed.rail === true && closed.shown === false, JSON.stringify(closed))
  expect('본문이 왼쪽 끝부터', closed.mainLeft === 0 && closed.mainWidth >= 380, JSON.stringify(closed))
  expect('머리줄에 메뉴 단추', closed.menu, JSON.stringify(closed))
  // 머리줄 단추들이 두 줄로 접히지 않습니다.
  const topbar = await page.evaluate(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height))
  expect('머리줄이 한 줄', topbar < 60, String(topbar))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '01-closed.png') })

  step('2. 메뉴 단추를 누르면 옆줄이 본문 위에 서랍처럼 뜬다')
  await page.click('.menu-toggle')
  await page.waitForTimeout(400)
  const opened = await layout()
  console.log('  ' + JSON.stringify(opened))
  expect('서랍이 떠 있음', opened.shown && opened.fixed === 'fixed', JSON.stringify(opened))
  expect('본문을 밀지 않고 덮음', opened.mainLeft === 0, JSON.stringify(opened))
  expect('화면보다 좁아 본문이 비침', opened.width < 390 && opened.width >= 300, JSON.stringify(opened))
  expect('덮개가 깔림', opened.backdrop, JSON.stringify(opened))
  // 손을 얹을 수 없는 기기에서 안내 말풍선은 손가락에 가려 방해만 됩니다.
  await page.hover('.sidebar-toggle')
  await page.waitForTimeout(700)
  const tip = await page.evaluate(() => {
    const one = document.querySelector('.tooltip')
    return one ? getComputedStyle(one).display : 'none'
  })
  expect('안내 말풍선이 뜨지 않음', tip === 'none', tip)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '02-open.png') })

  step('3. 문서를 고르면 서랍이 닫히고 문서가 보인다')
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(500)
  const picked = await layout()
  expect('서랍이 닫힘', picked.shown === false && !picked.backdrop, JSON.stringify(picked))
  const title = await page.evaluate(() => document.querySelector('.doc-head h1')?.textContent ?? null)
  expect('문서가 열림', title === '개발 환경.md', String(title))

  step('4. 폴더를 고르면 서랍은 그대로 열려 있다')
  await page.click('.menu-toggle')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("회사") .tree-name')
  await page.waitForTimeout(400)
  expect('폴더를 골라도 열린 채', (await layout()).shown === true)

  step('5. 덮개를 누르거나 옆줄 접기 단추로 닫는다')
  await page.mouse.click(385, 700)     // 서랍 밖(덮개)
  await page.waitForTimeout(300)
  expect('덮개를 누르면 닫힘', (await layout()).shown === false)
  await page.click('.menu-toggle')
  await page.waitForTimeout(300)
  await page.click('.sidebar-toggle')
  await page.waitForTimeout(300)
  expect('접기 단추로도 닫힘', (await layout()).shown === false)

  step('6. 손을 얹을 수 없어도 고른 줄의 단추는 보인다')
  await page.click('.menu-toggle')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("회고") .tree-name')
  await page.waitForTimeout(300)
  const tools = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.tree-row')].find((one) => one.textContent.includes('회고'))
    const shown = [...row.querySelectorAll('.tree-tools button')].filter((one) => one.offsetParent !== null)
    // 뿌리 줄의 단추는 늘 보이는 것이라 셈에서 뺍니다.
    const other = [...document.querySelectorAll('.tree-row:not(.is-selected):not(.tree-root) .tree-tools button')]
      .filter((one) => one.offsetParent !== null && !one.classList.contains('tree-fav'))
    return { shown: shown.map((one) => one.getAttribute('aria-label')), othersShown: other.length }
  })
  console.log('  ' + JSON.stringify(tools))
  expect('고른 줄의 단추가 보임', tools.shown.includes('삭제') && tools.shown.includes('즐겨찾기에 담기'), JSON.stringify(tools))
  expect('다른 줄은 그대로 감춤', tools.othersShown === 0, JSON.stringify(tools))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '03-tools.png') })

  /*
   * 단축키 목록은 단추 오른쪽에 맞춰 뜨는데, 좁은 화면에서는 왼쪽이 화면 밖으로 잘렸습니다.
   * 화면 안에 들어오도록 자리와 너비를 맞춰야 합니다.
   */
  step('6-2. 단축키 목록이 화면 안에 다 들어온다')
  await page.mouse.click(385, 700)
  await page.waitForTimeout(300)
  await page.click('.topbar button[aria-label="단축키"]')
  await page.waitForSelector('.shortcuts-pop', { timeout: 3000 })
  const pop = await page.evaluate(() => {
    const r = document.querySelector('.shortcuts-pop').getBoundingClientRect()
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: window.innerWidth }
  })
  console.log('  ' + JSON.stringify(pop))
  expect('왼쪽이 잘리지 않음', pop.left >= 0, JSON.stringify(pop))
  expect('오른쪽도 화면 안', pop.right <= pop.vw, JSON.stringify(pop))
  expect('화면 폭에 맞춰 좁아짐', pop.width <= pop.vw - 16 && pop.width > 300, JSON.stringify(pop))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '04-shortcuts.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // 설정 창의 왼쪽 메뉴는 좁은 화면에서 창의 반을 먹어 감춥니다. 본문의 머리를 굴려 찾습니다.
  step('6-3. 설정 창에서는 왼쪽 메뉴가 감춰진다')
  await page.click('.topbar button[aria-label="설정"]')
  await page.waitForSelector('.settings-content', { timeout: 3000 })
  const nav = await page.evaluate(() => {
    const menu = document.querySelector('.settings-nav')
    return {
      shown: menu ? getComputedStyle(menu).display !== 'none' : false,
      contentLeft: Math.round(document.querySelector('.settings-content').getBoundingClientRect().left),
      heads: document.querySelectorAll('.settings-content .field-group-title').length,
    }
  })
  console.log('  ' + JSON.stringify(nav))
  expect('메뉴가 감춰짐', nav.shown === false, JSON.stringify(nav))
  expect('본문 머리는 그대로 있음', nav.heads >= 10, JSON.stringify(nav))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '05-settings.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  /*
   * 좁은 화면에서 나란히 보기는 원문과 결과가 위아래로 서는데, 사이에 손잡이가 없어
   * 몫을 정할 수 없었습니다. 손잡이를 눕혀 두고 위아래로 끌어 정합니다.
   */
  step('6-4. 나란히 보기에서 위아래 몫을 손잡이로 정한다')
  await page.click('.menu-toggle')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(500)
  await page.click('.mode-switch button[aria-label="나란히"]')
  await page.waitForTimeout(400)
  const split = () => page.evaluate(() => {
    const editor = document.querySelector('.main .editor').getBoundingClientRect()
    const preview = document.querySelector('.main .preview').getBoundingClientRect()
    const bar = document.querySelector('.split-resizer')
    const r = bar?.getBoundingClientRect()
    return {
      stacked: preview.top >= editor.bottom,
      editorH: Math.round(editor.height),
      previewH: Math.round(preview.height),
      handle: bar ? { w: Math.round(r.width), h: Math.round(r.height), shown: getComputedStyle(bar).display !== 'none',
        orientation: bar.getAttribute('aria-orientation'), cursor: getComputedStyle(bar).cursor, y: Math.round(r.top) } : null,
    }
  })
  const before = await split()
  console.log('  ' + JSON.stringify(before))
  expect('위아래로 섬', before.stacked, JSON.stringify(before))
  expect('사이에 누운 손잡이가 있음',
    before.handle?.shown && before.handle.w > before.handle.h && before.handle.orientation === 'horizontal'
      && before.handle.cursor === 'row-resize', JSON.stringify(before))
  expect('처음엔 반반', Math.abs(before.editorH - before.previewH) < 20, JSON.stringify(before))
  // 손잡이를 위로 끌어 원문 칸을 줄입니다.
  await page.mouse.move(195, before.handle.y + 3)
  await page.mouse.down()
  await page.mouse.move(195, before.handle.y - 150, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const dragged = await split()
  console.log('  ' + JSON.stringify(dragged))
  expect('끌면 원문이 줄고 결과가 늘어남',
    dragged.editorH < before.editorH - 80 && dragged.previewH > before.previewH + 80, JSON.stringify(dragged))
  // 자판으로도: 누워 있으니 위아래 화살표입니다.
  await page.focus('.split-resizer')
  await page.keyboard.press('Shift+ArrowDown')
  await page.waitForTimeout(200)
  const keyed = await split()
  expect('↓ 로 원문이 다시 늘어남', keyed.editorH > dragged.editorH + 20, JSON.stringify(keyed))
  await page.keyboard.press('Home')
  await page.waitForTimeout(200)
  const home = await split()
  expect('Home 으로 반반', Math.abs(home.editorH - home.previewH) < 20, JSON.stringify(home))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'mobile', '06-split.png') })
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(200)

  /*
   * 손가락으로는 끌어다 놓을 수 없습니다. 손전화 브라우저는 손가락으로 시작한 끌기를
   * HTML 끌어놓기로 올려 주지 않습니다. 줄 단추로 폴더를 골라 옮깁니다.
   */
  step('6-5. 끌지 않고 단추로 폴더를 골라 옮긴다')
  // 앞 걸음에서 서랍이 열린 채일 수 있습니다. 열려 있지 않을 때만 엽니다.
  if (!(await layout()).shown) {
    await page.click('.menu-toggle')
    await page.waitForTimeout(300)
  }
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(400)
  if (!(await layout()).shown) {
    await page.click('.menu-toggle')
    await page.waitForTimeout(300)
  }
  // 고른 줄의 단추가 보입니다(손을 얹을 수 없는 기기).
  await page.click('.tree-row.is-selected .tree-tools button[aria-label="옮기기"]')
  await page.waitForSelector('.sheet[aria-label="옮길 폴더 고르기"]', { timeout: 3000 })
  const choices = await page.evaluate(() =>
    [...document.querySelectorAll('.move-item')].map((one) => ({
      name: one.querySelector('span')?.textContent, disabled: one.disabled,
    })))
  console.log('  ' + JSON.stringify(choices))
  expect('뿌리와 폴더들이 늘어섬', choices.some((one) => one.name === '회사') && choices[0].name === '내 위키', JSON.stringify(choices))
  expect('지금 있는 자리(뿌리)는 고를 수 없음', choices[0].disabled === true, JSON.stringify(choices))
  await page.click('.move-item:has-text("회사")')
  await page.waitForTimeout(800)
  const moved = await page.evaluate(async () => ({
    there: await window.__vaultText('회사/개발 환경.md'),
    here: await window.__vaultText('개발 환경.md'),
    sheet: document.querySelector('.sheet[aria-label="옮길 폴더 고르기"]') !== null,
    title: document.querySelector('.doc-head h1')?.textContent ?? null,
  }))
  expect('파일이 그 폴더로 감', moved.there !== null && moved.here === null, JSON.stringify({ there: moved.there !== null, here: moved.here }))
  expect('창이 닫히고 열어 둔 문서는 그대로', !moved.sheet && moved.title === '개발 환경.md', JSON.stringify(moved))

  // 폴더는 제 안으로 옮길 수 없습니다. 옮기면서 열어 둔 문서의 자리가 바뀌어 서랍이 닫혔으니 다시 엽니다.
  if (!(await layout()).shown) {
    await page.click('.menu-toggle')
    await page.waitForTimeout(300)
  }
  await page.click('.tree-row:has-text("회사") .tree-name')
  await page.waitForTimeout(300)
  await page.click('.tree-row.is-selected .tree-tools button[aria-label="옮기기"]')
  await page.waitForSelector('.sheet[aria-label="옮길 폴더 고르기"]', { timeout: 3000 })
  const forDir = await page.evaluate(() =>
    [...document.querySelectorAll('.move-item')].filter((one) => one.disabled).map((one) => one.querySelector('span')?.textContent))
  console.log('  폴더를 옮길 때 막힌 것: ' + JSON.stringify(forDir))
  expect('제 자신은 막힘', forDir.includes('회사'), JSON.stringify(forDir))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  expect('Esc 로 닫힘', (await page.locator('.sheet[aria-label="옮길 폴더 고르기"]').count()) === 0)

  step('7. 넓게 펴면 예전처럼 본문 옆에 선다')
  if (!(await layout()).shown) {
    await page.click('.menu-toggle')
    await page.waitForTimeout(300)
  }
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(400)
  const wide = await layout()
  console.log('  ' + JSON.stringify(wide))
  expect('본문 옆에 서고 덮개는 없음', wide.fixed !== 'fixed' && !wide.backdrop && wide.mainLeft > 200, JSON.stringify(wide))
  expect('메뉴 단추는 감춰짐', wide.menu === false, JSON.stringify(wide))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
