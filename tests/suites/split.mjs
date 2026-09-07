import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'split'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => window.__installMockFs())

const openVault = async () => {
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)
}
const openDoc = async (label) => {
  await page.click(`.tree-row:has-text("${label}")`)
  await page.waitForSelector('.editor', { timeout: 8000 })
  await page.waitForTimeout(400)
}
const setMode = async (label) => {
  await page.click(`.mode-switch button[aria-label="${label}"]`)
  await page.waitForTimeout(400)
}
/** 두 칸이 실제로 차지한 폭. 화면에 나온 결과로만 견줍니다. */
const panes = () => page.evaluate(() => {
  const body = document.querySelector('.doc-body')
  const editor = document.querySelector('.editor')
  const preview = document.querySelector('.preview') ?? document.querySelector('.text-preview')
  return {
    editor: editor ? Math.round(editor.getBoundingClientRect().width) : null,
    preview: preview ? Math.round(preview.getBoundingClientRect().width) : null,
    total: Math.round(body.getBoundingClientRect().width),
    saved: localStorage.getItem('mdwiki:split-ratio'),
  }
})
const dragBy = async (dx) => {
  const box = await page.locator('.split-resizer').boundingBox()
  await page.mouse.move(box.x + 3, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 3 + dx, box.y + 200, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await openVault()
  await openDoc('개발 환경')

  step('1. 처음은 반반이다')
  const first = await panes()
  console.log('  ' + JSON.stringify(first))
  expect('두 칸이 비슷함', Math.abs(first.editor - first.preview) <= 8, JSON.stringify(first))
  expect('손잡이가 사이에 있음', (await page.locator('.split-resizer').count()) === 1)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'split', '01-half.png'),
    clip: { x: 430, y: 60, width: 970, height: 320 } })

  step('2. 끌면 미리보기가 넓어진다')
  await dragBy(-240)
  const wider = await panes()
  console.log('  ' + JSON.stringify(wider))
  expect('원문이 좁아짐', wider.editor < first.editor - 200, JSON.stringify(wider))
  expect('미리보기가 넓어짐', wider.preview > first.preview + 200, JSON.stringify(wider))
  expect('둘을 더하면 그대로', Math.abs(wider.editor + wider.preview - (first.editor + first.preview)) <= 2,
    JSON.stringify(wider))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'split', '02-dragged.png'),
    clip: { x: 430, y: 60, width: 970, height: 320 } })

  step('3. 어느 쪽도 아주 사라지지는 않는다')
  await dragBy(-3000)
  const squeezed = await panes()
  console.log('  왼쪽 끝: ' + JSON.stringify(squeezed))
  expect('원문이 남음', squeezed.editor > 100, JSON.stringify(squeezed))
  expect('20% 에서 멈춤', squeezed.saved === '20', String(squeezed.saved))
  await dragBy(3000)
  const stretched = await panes()
  console.log('  오른쪽 끝: ' + JSON.stringify(stretched))
  expect('미리보기가 남음', stretched.preview > 100, JSON.stringify(stretched))
  expect('80% 에서 멈춤', stretched.saved === '80', String(stretched.saved))

  step('4. 두 번 누르면 반반으로 돌아간다')
  await page.dblclick('.split-resizer')
  await page.waitForTimeout(400)
  const reset = await panes()
  console.log('  ' + JSON.stringify(reset))
  expect('반반', reset.saved === '50', String(reset.saved))
  expect('두 칸이 비슷함', Math.abs(reset.editor - reset.preview) <= 8, JSON.stringify(reset))

  step('5. 자판으로도 옮긴다')
  await page.focus('.split-resizer')
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  const oneStep = await panes()
  expect('화살표는 2%', oneStep.saved === '48', String(oneStep.saved))
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
  await page.waitForTimeout(300)
  const bigStep = await panes()
  expect('Shift 는 8%', bigStep.saved === '56', String(bigStep.saved))

  step('6. 새로고침해도 그 몫으로 열린다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault()
  await openDoc('개발 환경')
  const kept = await panes()
  console.log('  ' + JSON.stringify(kept))
  expect('기억한 몫', kept.saved === '56', String(kept.saved))
  expect('원문이 더 넓음', kept.editor > kept.preview, JSON.stringify(kept))

  step('7. 나란히가 아니면 손잡이가 없다')
  await setMode('편집')
  expect('편집에는 없음', (await page.locator('.split-resizer').count()) === 0)
  await setMode('미리보기')
  expect('미리보기에도 없음', (await page.locator('.split-resizer').count()) === 0)
  await setMode('나란히')
  expect('나란히로 돌아오면 다시 있음', (await page.locator('.split-resizer').count()) === 1)

  step('8. 글 첨부에서도 같은 몫으로 나뉜다')
  /*
   * 마크다운과 글 첨부는 그리는 자리가 다릅니다. 한쪽만 고치면 문서를 옮길 때마다
   * 몫이 달라져 눈이 어지럽습니다.
   */
  await page.click('.tree-root button[aria-label="새 문서"]')
  await page.waitForSelector('.dialog-input')
  await page.fill('.dialog-input', '표.csv')
  await page.click('.dialog button:has-text("만들기")')
  await page.waitForTimeout(900)
  await page.fill('.editor', '이름,값\n하나,1\n')
  await page.waitForTimeout(900)
  const csv = await panes()
  console.log('  ' + JSON.stringify(csv))
  expect('첨부에도 손잡이가 있음', (await page.locator('.split-resizer').count()) === 1)
  expect('같은 몫으로 나뉨',
    Math.abs(csv.editor / csv.total - 0.56) < 0.03, JSON.stringify(csv))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
