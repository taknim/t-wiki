import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'settings'), { recursive: true })
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
await page.addInitScript(() => window.__installMockFs())

const open = async () => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.waitForTimeout(400)
}
const isOpen = () => page.locator('.settings-nav').count().then((n) => n === 1)
const sheetBox = () => page.locator('.sheet').boundingBox()
/** 머리줄을 잡고 끕니다. */
const drag = async (dx, dy) => {
  const head = await page.locator('.sheet-head').boundingBox()
  // 창이 화면 끝으로 밀려 있으면 머리줄 가운데가 화면 밖일 수 있습니다. 보이는 자리를 잡습니다.
  const x = Math.min(Math.max(head.x + 24, 8), 1392)
  const y = Math.min(Math.max(head.y + head.height / 2, 8), 912)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click('.tree-row:has-text("개발 환경")')
  await page.waitForSelector('.editor', { timeout: 8000 })
  await page.waitForTimeout(400)

  step('1. 열어도 뒷 화면이 어두워지지 않는다')
  /*
   * 색이나 글꼴을 바꾸면서 화면이 어떻게 바뀌는지 바로 보여야 합니다.
   * 어둡게 덮으면 고르는 동안에는 결과를 알 수 없습니다.
   */
  await open()
  const backdrop = await page.evaluate(() => {
    const overlay = document.querySelector('.overlay')
    return {
      background: getComputedStyle(overlay).backgroundColor,
      covers: Math.round(overlay.getBoundingClientRect().width),
      shadowed: getComputedStyle(document.querySelector('.sheet')).boxShadow !== 'none',
    }
  })
  console.log('  ' + JSON.stringify(backdrop))
  expect('덮개가 투명함', /rgba\(0, 0, 0, 0\)|transparent/.test(backdrop.background),
    backdrop.background)
  expect('그래도 화면을 덮고 있음', backdrop.covers === 1400, String(backdrop.covers))
  expect('떠 있는 것은 그림자로 알림', backdrop.shadowed, '그림자가 없습니다')
  await page.screenshot({ path: join(HERE, '..', 'shots', 'settings', '01-clear.png'),
    clip: { x: 0, y: 0, width: 1400, height: 560 } })

  step('2. 뒤쪽은 눌리지 않는다')
  const before = await page.textContent('.info-path')
  const covered = await page.evaluate(() => {
    // 트리의 다른 줄이 있던 자리를 짚어, 지금 그 자리에 무엇이 있는지 물어봅니다.
    const row = [...document.querySelectorAll('.tree-row')].find((n) => n.textContent.includes('회고'))
    const box = row.getBoundingClientRect()
    const at = document.elementFromPoint(box.x + 40, box.y + box.height / 2)
    return { tag: at?.className ?? null, inTree: Boolean(at?.closest('.tree')) }
  })
  console.log('  ' + JSON.stringify(covered))
  expect('그 자리는 덮개가 차지함', !covered.inTree, JSON.stringify(covered))
  const after = await page.textContent('.info-path')
  expect('고른 문서도 그대로', after === before, `${before} -> ${after}`)

  step('3. 머리줄을 끌면 창이 옮겨진다')
  const start = await sheetBox()
  await drag(-180, 90)
  const moved = await sheetBox()
  console.log(`  ${Math.round(start.x)},${Math.round(start.y)} → ${Math.round(moved.x)},${Math.round(moved.y)}`)
  expect('왼쪽으로 옮겨짐', Math.round(moved.x - start.x) === -180, String(moved.x - start.x))
  expect('아래로 옮겨짐', Math.round(moved.y - start.y) === 90, String(moved.y - start.y))
  expect('끄는 동안에도 열려 있음', await isOpen(), '창이 닫혔습니다')
  await page.screenshot({ path: join(HERE, '..', 'shots', 'settings', '02-moved.png'),
    clip: { x: 0, y: 0, width: 1400, height: 760 } })

  step('4. 화면 밖으로는 달아나지 않는다')
  await drag(-3000, -3000)
  const far = await sheetBox()
  console.log(`  ${Math.round(far.x)},${Math.round(far.y)}`)
  expect('머리줄이 위로 사라지지 않음', far.y >= -1, String(far.y))
  expect('왼쪽으로도 조금은 남음', far.x + far.width >= 79, String(far.x + far.width))
  await drag(3000, 3000)
  const back = await sheetBox()
  console.log(`  ${Math.round(back.x)},${Math.round(back.y)}`)
  expect('아래로도 조금은 남음', back.y <= 920 - 79, String(back.y))
  expect('오른쪽으로도 조금은 남음', back.x <= 1400 - 79, String(back.x))

  step('5. Esc 로 닫힌다')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect('닫힘', !(await isOpen()), '아직 열려 있습니다')

  step('6. 다시 열면 가운데에서 시작한다')
  await open()
  const fresh = await sheetBox()
  console.log(`  ${Math.round(fresh.x)},${Math.round(fresh.y)}`)
  expect('가운데로 돌아옴', Math.abs(fresh.x + fresh.width / 2 - 700) < 2,
    String(fresh.x + fresh.width / 2))

  step('7. 바깥을 누르면 닫힌다')
  await page.mouse.click(40, 800)
  await page.waitForTimeout(400)
  expect('닫힘', !(await isOpen()), '아직 열려 있습니다')

  step('8. 겹쳐 뜬 창은 위에 있는 것부터 닫힌다')
  /*
   * 아래 것이 먼저 닫히면 위에 남은 창이 무엇에 딸린 것인지 알 수 없게 됩니다.
   * 확인 창이든 동기화 결과든, Esc 는 늘 맨 위 하나만 닫아야 합니다.
   */
  await open()
  await page.click('button:has-text("설정 내보내기")')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const afterEsc = await page.evaluate(() => ({
    dialog: document.querySelectorAll('.dialog').length,
    settings: document.querySelectorAll('.settings-nav').length,
  }))
  console.log('  확인 창: ' + JSON.stringify(afterEsc))
  expect('확인 창이 닫힘', afterEsc.dialog === 0, JSON.stringify(afterEsc))
  expect('설정 창은 그대로', afterEsc.settings === 1, JSON.stringify(afterEsc))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect('한 번 더 누르면 설정도 닫힘', !(await isOpen()), '아직 열려 있습니다')

  step('9. 동기화 결과가 떠 있으면 그쪽이 먼저 닫힌다')
  await open()
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(400)
  await page.click('button:has-text("지금 동기화")')
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')]
      .find((n) => /지금 동기화|동기화 중/.test(n.textContent))
    return button && !button.disabled && button.textContent.includes('지금 동기화')
  }, { timeout: 25000 })
  await page.waitForTimeout(800)
  // 결과 창이 저절로 떴다면 닫고 다시 엽니다. 설정 위에 겹친 모습을 봐야 합니다.
  if (await page.locator('.sheet:has-text("동기화 결과")').count()) {
    await page.click('.sheet:has-text("동기화 결과") .sheet-close')
    await page.waitForTimeout(400)
  }
  await page.click('button:has-text("지난 결과 보기")')
  await page.waitForSelector('.sheet:has-text("동기화 결과")', { timeout: 8000 })
  await page.waitForTimeout(400)
  const stacked = await page.evaluate(() => ({
    sheets: document.querySelectorAll('.sheet').length,
    settings: document.querySelectorAll('.settings-nav').length,
  }))
  console.log('  겹친 채: ' + JSON.stringify(stacked))
  expect('둘이 겹쳐 있음', stacked.sheets === 2 && stacked.settings === 1, JSON.stringify(stacked))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'settings', '03-stacked.png'),
    clip: { x: 0, y: 0, width: 1400, height: 620 } })

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const afterFirst = await page.evaluate(() => ({
    report: document.querySelectorAll('.sheet').length,
    settings: document.querySelectorAll('.settings-nav').length,
  }))
  console.log('  한 번 누른 뒤: ' + JSON.stringify(afterFirst))
  expect('결과 창이 먼저 닫힘', afterFirst.report === 1, JSON.stringify(afterFirst))
  expect('설정 창은 남아 있음', afterFirst.settings === 1, JSON.stringify(afterFirst))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  expect('한 번 더 누르면 설정도 닫힘', !(await isOpen()), '아직 열려 있습니다')

  step('10. 마지막 묶음 아래에 빈 칸이 남지 않는다')
  /*
   * 마지막 묶음도 메뉴로 뛰면 맨 위까지 올라와야 합니다. 그렇다고 한 화면만큼을
   * 여백으로 붙여 두면, 이미 긴 묶음 아래에 아무것도 없는 칸만 남습니다.
   */
  await open()
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(1200)
  const jumped = await page.evaluate(() => {
    const pane = document.querySelector('.settings-content')
    const head = [...document.querySelectorAll('.settings-heading')]
      .find((n) => n.textContent.includes('GitHub'))
    return Math.round(head.getBoundingClientRect().top - pane.getBoundingClientRect().top)
  })
  console.log('  머리가 위에서 ' + jumped + 'px')
  expect('메뉴로 뛰면 머리가 위에 붙음', jumped >= 0 && jumped < 60, String(jumped))

  const tail = await page.evaluate(() => {
    const pane = document.querySelector('.settings-content')
    pane.scrollTop = pane.scrollHeight
    /*
     * 묶음이 아니라 그 안의 마지막 줄에서 잽니다. 여백을 묶음 안쪽에 붙여 두면
     * 묶음의 아래 끝은 화면 끝에 닿아 있어, 빈 칸이 있어도 없는 것으로 보입니다.
     */
    const last = document.querySelector('.settings-section:last-child > :last-child')
    return Math.round(pane.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom)
  })
  console.log('  끝까지 내린 뒤 아래 빈 칸: ' + tail + 'px')
  // 칸 바깥 여백(18) 과 마지막 줄의 아래 간격(20) 만 남아야 합니다. 한 화면이 남으면 안 됩니다.
  expect('바닥에 빈 칸이 남지 않음', tail <= 48, String(tail))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'settings', '04-bottom.png'),
    clip: { x: 280, y: 120, width: 840, height: 660 } })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  /*
   * 설정이 늘면서 묶음 셋만으로는 굴려 찾아야 했습니다. 갈래를 펼쳐 두고
   * 눌러 곧바로 가게 했으니, 이름과 자리가 어긋나지 않는지 봅니다.
   */
  step('11. 왼쪽 메뉴가 묶음과 갈래로 갈라져 있다')
  if (!(await page.locator('.settings-nav').count())) {
    await page.click('button[aria-label="설정"]')
    await page.waitForSelector('.settings-nav')
    await page.waitForTimeout(300)
  }
  const menu = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('.settings-nav-group > button:not(.settings-nav-item)')]
      .map((one) => one.textContent),
    items: [...document.querySelectorAll('.settings-nav-item')].map((one) => one.textContent),
    // 갈래 이름마다 갈 자리가 실제로 있어야 합니다.
    lost: [...document.querySelectorAll('.settings-nav-item')]
      .map((one) => one.textContent)
      .filter((name, at, all) => all.indexOf(name) !== at),
  }))
  console.log('  ' + JSON.stringify(menu))
  expect('묶음이 셋', menu.groups.join() === '일반,모양,GitHub 동기화', JSON.stringify(menu.groups))
  expect('갈래가 펼쳐져 있음', menu.items.length >= 8, String(menu.items.length))
  // 설정 하나에 한 줄씩 세우면 메뉴가 화면보다 길어집니다. 갈래로 묶어 둡니다.
  expect('갈래로 묶여 있음', menu.items.length <= 12, String(menu.items.length))
  expect('미리보기가 한 갈래로 묶임',
    menu.items.includes('미리보기') && !menu.items.includes('오피스 미리보기'),
    JSON.stringify(menu.items))
  expect('이름이 겹치지 않음', menu.lost.length === 0, JSON.stringify(menu.lost))

  step('12. 갈래를 누르면 그 자리로 곧바로 간다')
  // 갈래를 누르면 그 갈래의 첫 설정이 창 위쪽에 옵니다.
  const FIRST = { 본문: '본문 글꼴', 이미지: '이미지 정렬', 미리보기: '이미지 미리보기' }
  const landed = []
  for (const [name, first] of Object.entries(FIRST)) {
    await page.click(`.settings-nav .settings-nav-item:text-is("${name}")`)
    await page.waitForTimeout(800)
    landed.push(await page.evaluate(([want, label]) => {
      const nav = [...document.querySelectorAll('.settings-nav-item')]
        .find((one) => one.textContent === want)
      const box = document.querySelector('.settings-content').getBoundingClientRect()
      const head = [...document.querySelectorAll('.settings-content .field > label')]
        .find((one) => one.textContent === label)
      return {
        name: want,
        here: nav?.classList.contains('is-here') ?? false,
        top: head ? Math.round(head.getBoundingClientRect().top - box.top) : null,
      }
    }, [name, first]))
  }
  console.log('  ' + JSON.stringify(landed))
  expect('누른 갈래가 짙어짐', landed.every((one) => one.here), JSON.stringify(landed))
  expect('그 자리가 창 위쪽에 옴',
    landed.every((one) => one.top !== null && one.top >= -4 && one.top < 60), JSON.stringify(landed))

  /*
   * 맨 아래 갈래는 위쪽까지 끌어올 수 없습니다. 굴림이 끝에 닿기 때문입니다.
   * 그때는 화면 안에 들어오기만 하면 된 것으로 봅니다.
   */
  await page.click('.settings-nav .settings-nav-item:text-is("동기화 방식")')
  await page.waitForTimeout(800)
  const bottom = await page.evaluate(() => {
    const box = document.querySelector('.settings-content').getBoundingClientRect()
    const label = [...document.querySelectorAll('.settings-content .field > label')]
      .find((one) => one.textContent === '충돌 처리 방식')
    const at = label.getBoundingClientRect()
    return { top: Math.round(at.top - box.top), height: Math.round(box.height) }
  })
  console.log('  ' + JSON.stringify(bottom))
  expect('맨 아래 갈래도 화면 안에 들어옴',
    bottom.top >= -4 && bottom.top < bottom.height, JSON.stringify(bottom))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'settings', '03-nav.png'),
    clip: { x: 280, y: 120, width: 840, height: 660 } })

  step('13. 큰 메뉴를 누르면 접히고 펼쳐진다')
  const shown = () => page.evaluate(() => ({
    items: [...document.querySelectorAll('.settings-nav-item')].map((one) => one.textContent),
    open: [...document.querySelectorAll('.settings-nav-group > button:not(.settings-nav-item)')]
      .map((one) => one.getAttribute('aria-expanded')),
  }))
  const whole = await shown()
  // 트리의 폴더 줄과 같습니다. 먼저 그 자리로 가고, 다시 누를 때 접힙니다.
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(800)
  const first = await shown()
  expect('처음 누르면 접히지 않음', first.items.includes('테마'), JSON.stringify(first.items))
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(400)
  const shut = await shown()
  console.log('  접은 뒤: ' + JSON.stringify(shut.open) + ' · ' + shut.items.length + '줄')
  expect('그 묶음 갈래가 사라짐', !shut.items.includes('테마') && !shut.items.includes('본문'),
    JSON.stringify(shut.items))
  expect('다른 묶음은 그대로',
    shut.items.includes('저장소 연결') && shut.items.includes('미리보기'), JSON.stringify(shut.items))
  expect('접혔다고 밝힘', shut.open.join() === 'true,false,true', JSON.stringify(shut.open))

  // 접은 김에 아래쪽 묶음이 위로 올라옵니다. 접는 까닭이 그것입니다.
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(800)
  const again = await shown()
  const landedBack = await page.evaluate(() => {
    const box = document.querySelector('.settings-content').getBoundingClientRect()
    const heading = [...document.querySelectorAll('.settings-heading')]
      .find((one) => one.textContent === '모양')
    return Math.round(heading.getBoundingClientRect().top - box.top)
  })
  console.log('  편 뒤: ' + again.items.length + '줄 · 모양 자리 ' + landedBack)
  expect('갈래가 다시 나옴', again.items.join() === whole.items.join(), JSON.stringify(again.items))
  expect('펴면서 그 자리로 감', landedBack >= -4 && landedBack < 60, String(landedBack))

  // 다음 걸음은 닫힌 자리에서 시작합니다.
  await page.click('.sheet-close')
  await page.waitForTimeout(300)

  step('14. 닫기 단추는 끌기에 잡히지 않는다')
  await open()
  await page.click('.sheet-close')
  await page.waitForTimeout(400)
  expect('단추로도 닫힘', !(await isOpen()), '아직 열려 있습니다')
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
