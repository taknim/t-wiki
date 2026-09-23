import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'autosave'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => {
  window.__installMockFs()
  // 새로고침한 뒤 "다시 열기"로 같은 폴더를 이어 열기 위해 손잡이를 남겨 둡니다.
  window.__restoreHandle = true
})

const DOC = '개발 환경.md'
const onDisk = () => page.evaluate((path) => window.__vaultText(path), DOC)
/** 제목 옆의 상태말. 저장 단추는 빼고 봅니다. */
const label = () => page.evaluate(() =>
  document.querySelector('.doc-head .pill:not(.pill-save)')?.textContent ?? null)
const saveButton = () => page.locator('.doc-head .pill-save')
const openSettings = async (item) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click(`.settings-nav .settings-nav-item:text-is("${item}")`)
  await page.waitForTimeout(400)
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click(`.tree-row:has-text("${DOC}") .tree-name`)
  await page.waitForSelector('.main .editor', { timeout: 8000 })
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(300)

  step('1. 기본은 0.8초 자동 저장이고, 쓸 것이 없으면 저장됨만 적힌다')
  expect('저장됨', (await label()) === '저장됨', String(await label()))
  expect('저장 단추는 없음', (await saveButton().count()) === 0)
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 하나')
  // 아직 0.8초가 되기 전. 단추가 서고 언제 저장되는지 적힙니다.
  expect('저장 단추가 섬', (await saveButton().count()) === 1)
  expect('언제 저장되는지 적힘', (await label())?.includes('자동 저장') ?? false, String(await label()))
  await page.waitForTimeout(1200)
  expect('0.8초 뒤 저절로 저장됨', (await onDisk()).includes('하나') && (await label()) === '저장됨',
    String(await label()))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'autosave', '01-saved.png'), clip: { x: 340, y: 50, width: 600, height: 40 } })

  step('2. 기다리는 시간을 바꾸면 그만큼 기다린다')
  await openSettings('자동 저장')
  await page.fill('#autosave-seconds', '5')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 둘')
  await page.waitForTimeout(300)
  const counting = await label()
  console.log('  ' + String(counting))
  expect('남은 초가 적힘', /^[1-5]초 뒤 자동 저장$/.test(counting ?? ''), String(counting))
  await page.waitForTimeout(1500)
  expect('아직 쓰지 않음', !(await onDisk()).includes('둘'), (await onDisk()).slice(-30))
  const later = await label()
  expect('셈이 줄어듦', Number.parseInt(later, 10) < Number.parseInt(counting, 10), `${counting} → ${later}`)
  await page.waitForTimeout(4000)
  expect('정한 때가 되면 저장됨', (await onDisk()).includes('둘') && (await label()) === '저장됨',
    String(await label()))

  step('3. 기다리지 않고 저장 단추로 바로 쓴다')
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 셋')
  await page.waitForTimeout(200)
  await saveButton().click()
  await page.waitForTimeout(400)
  expect('누르자 바로 저장됨', (await onDisk()).includes('셋') && (await label()) === '저장됨',
    String(await label()))

  step('4. 다른 문서로 옮기면 셈을 처음부터 다시 잡는다')
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 넷')
  await page.waitForTimeout(2500)
  // 앞 문서는 떠나면서 저장되고, 새 문서에서는 온전한 5초가 다시 주어져야 합니다.
  await page.click('.tree-row:has-text("회고") .tree-caret').catch(() => {})
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("2026-08") .tree-name')
  await page.waitForSelector('.doc-head h1:has-text("2026-08")', { timeout: 5000 })
  await page.waitForTimeout(400)
  expect('떠나면서 앞 문서는 저장됨', (await onDisk()).includes('넷'), (await onDisk()).slice(-30))
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 다섯')
  await page.waitForTimeout(300)
  const fresh = await label()
  console.log('  ' + String(fresh))
  expect('남은 시간이 처음부터', Number.parseInt(fresh, 10) >= 4, String(fresh))

  step('5. 자동 저장을 끄면 단추나 ⌘S 로만 쓴다')
  await page.waitForTimeout(5200)
  await openSettings('자동 저장')
  await page.click('.checkbox:has-text("손을 멈추면 저절로 저장하기") input')
  const disabled = await page.evaluate(() => document.querySelector('#autosave-seconds').disabled)
  expect('끄면 초 칸도 잠김', disabled)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 여섯')
  await page.waitForTimeout(2000)
  expect('가만히 두면 쓰지 않음', !(await page.evaluate(() => window.__vaultText('회고/2026-08.md'))).includes('여섯'))
  expect('고친 것이 남아 있다고 적힘', (await label()) === '변경됨', String(await label()))
  expect('저장 단추는 그대로 있음', (await saveButton().count()) === 1)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
  await page.waitForTimeout(500)
  expect('⌘S 로는 저장됨', (await page.evaluate(() => window.__vaultText('회고/2026-08.md'))).includes('여섯')
    && (await label()) === '저장됨', String(await label()))

  step('6. 꺼 두어도 문서를 떠날 때는 저장한다')
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(' 일곱')
  await page.waitForTimeout(300)
  await page.click(`.tree-row:has-text("${DOC}") .tree-name`)
  await page.waitForSelector(`.doc-head h1:has-text("${DOC}")`, { timeout: 5000 })
  await page.waitForTimeout(500)
  expect('떠나면서 저장됨', (await page.evaluate(() => window.__vaultText('회고/2026-08.md'))).includes('일곱'))

  step('7. 새로고침해도 설정이 남는다')
  // 권한이 살아 있으면 새로 고침 뒤에 곧바로 폴더가 다시 열립니다.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tree', { timeout: 10000 })
  await openSettings('자동 저장')
  const kept = await page.evaluate(() => ({
    on: [...document.querySelectorAll('.checkbox')]
      .find((one) => /저절로 저장하기/.test(one.textContent))?.querySelector('input').checked,
    seconds: document.querySelector('#autosave-seconds').value,
  }))
  console.log('  ' + JSON.stringify(kept))
  expect('꺼 둔 채 남음', kept.on === false, JSON.stringify(kept))
  expect('정한 초도 남음', kept.seconds === '5', JSON.stringify(kept))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
