import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOCX_B64, XLSX_B64 } from '../office-fixtures.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'pdfexport'), { recursive: true })
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
/*
 * **어두운 테마로 돌립니다.** PDF 는 늘 밝은 벌로 나와야 하는데, 앱이 밝은 채로
 * 시험하면 그것이 지켜지는지 알 수 없습니다.
 */
await page.addInitScript(({ xlsx, docx }) => {
  localStorage.setItem('mdwiki:theme', JSON.stringify({ mode: 'dark' }))
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const put = (name, data) => root._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: data, _lastModified: Date.now() },
  ))
  const bytes = (b64) => Uint8Array.from(atob(b64), (one) => one.charCodeAt(0))

  /*
   * 그림은 브라우저에서 지어 넣습니다. 이진 파일을 저장소에 넣어 두면 무엇이 들었는지
   * 아무도 열어 보지 못합니다. canvas 는 PNG 를 규격대로 내놓으므로 진짜 파일입니다.
   */
  const png = (width, height, color) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const paint = canvas.getContext('2d')
    paint.fillStyle = color
    paint.fillRect(0, 0, width, height)
    return bytes(canvas.toDataURL('image/png').split(',')[1])
  }

  put('세로 그림.png', png(400, 600, '#2f6feb'))
  put('누운 그림.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400">'
    + '<rect width="1600" height="400" fill="#c2410c"/></svg>')
  put('작은 표.csv', 'id,name\n1,하나\n2,둘\n')
  put('판매표.xlsx', bytes(xlsx))
  put('안내문.docx', bytes(docx))
  put('메모.txt', '그냥 글입니다.\n')
  put('도구.py', 'def hello():\n    return 1\n')
  put('자료.zip', bytes('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=='))
  // 여러 쪽으로 나뉘는 글. 제목과 표도 섞어 둡니다.
  put('긴 글.md', '# 긴 글\n\n'
    + Array.from({ length: 90 }, (_, at) => `## ${at + 1}째 마디\n\n이 마디는 ${at + 1}번입니다. `
      + '쪽이 넘어가는지 보려고 길게 적어 둔 글입니다.\n').join('\n'))
}, { xlsx: XLSX_B64, docx: DOCX_B64 })

const open = async (name) => {
  await page.click(`.tree-row:has-text("${name}") .tree-name`)
  await page.waitForTimeout(600)
}
const hasButton = () => page.locator('.doc-head .head-pdf').count()
/*
 * PDF 단추를 누르고 **다 쓰일 때까지** 기다립니다.
 *
 * 이름만 보고 기다리면 안 됩니다. 저장 창은 이름을 정하는 순간 빈 파일을 만들어 두므로,
 * 이름은 뜨기 시작하기 전부터 있습니다. 크기가 찰 때까지 봐야 합니다.
 */
const saved = (name) => page.waitForFunction(
  (wanted) => window.__savedSize(wanted) > 0,
  name,
  { timeout: 60000 },
).then(() => page.evaluate((wanted) => window.__savedPdf(wanted), name))

const exportPdf = async (name) => {
  await page.click('.doc-head .head-pdf')
  return saved(name)
}
const A4_PORTRAIT = '[[0,0,595.28,841.89]]'
const A4_LANDSCAPE = '[[0,0,841.89,595.28]]'

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  const dark = await page.evaluate(() => document.documentElement.dataset.mode)
  expect('어두운 테마로 보고 있음', dark === 'dark', String(dark))

  step('1. 마크다운을 A4 세로 한 벌로 낸다')
  await open('개발 환경.md')
  expect('제목 줄에 PDF 단추가 섬', (await hasButton()) === 1)
  const doc = await exportPdf('개발 환경.pdf')
  console.log('  ' + JSON.stringify({ ...doc, boxes: doc.boxes }))
  expect('PDF 파일임', doc.head.startsWith('%PDF-'), doc.head)
  expect('한 쪽', doc.pages === 1, String(doc.pages))
  expect('A4 세로', JSON.stringify(doc.boxes) === A4_PORTRAIT, JSON.stringify(doc.boxes))
  expect('빈 파일이 아님', doc.size > 5000, String(doc.size))

  step('2. 뜨는 자리는 어두운 테마로 보던 중에도 밝은 벌이다')
  /*
   * PDF 는 화면 밖에 한 벌 더 그려서 뜹니다. 그 자리가 **살아 있는 동안** 색을 잽니다.
   * 어두운 바탕을 그대로 내보내면 쪽마다 검은 자리가 깔려 잉크를 들이켭니다.
   */
  await open('판매표.xlsx')
  await page.waitForSelector('.data-table', { timeout: 20000 })
  await page.click('.doc-head .head-pdf')
  await page.waitForSelector('.pdf-sheet .sheet-page', { timeout: 20000 })
  const sheet = await page.evaluate(() => {
    const host = document.querySelector('.pdf-sheet')
    return {
      bg: getComputedStyle(host).backgroundColor,
      width: host.getBoundingClientRect().width,
      names: [...host.querySelectorAll('.sheet-name')].map((one) => one.textContent),
      tabs: host.querySelectorAll('.sheet-tabs').length,
      offscreen: host.getBoundingClientRect().right < 0,
    }
  })
  console.log('  ' + JSON.stringify(sheet))
  const light = (sheet.bg.match(/\d+/g) ?? []).map(Number).slice(0, 3)
  expect('밝은 바탕', light.length === 3 && light.every((one) => one > 200), sheet.bg)
  expect('화면 밖에 섬', sheet.offscreen, JSON.stringify(sheet))
  expect('쪽 너비(698px)로 앉힘', Math.round(sheet.width) === 698, String(sheet.width))

  step('3. 엑셀은 시트를 모두 담는다')
  // 종이에는 탭이 없습니다. 탭으로 가려 두면 보고 있던 한 장만 나가고 나머지는 사라집니다.
  expect('시트 이름이 둘', sheet.names.join() === '판매,메모', JSON.stringify(sheet.names))
  expect('탭은 두지 않음', sheet.tabs === 0, String(sheet.tabs))
  const book = await saved('판매표.pdf')
  expect('엑셀도 PDF 로 나옴', book.head.startsWith('%PDF-') && book.pages >= 1, JSON.stringify(book))

  step('4. 다 끝나면 화면 밖 자리를 치운다')
  await page.waitForFunction(() => document.querySelectorAll('.pdf-sheet').length === 0,
    undefined, { timeout: 20000 })
  ok('치워짐')

  step('5. 긴 글은 여러 쪽으로 나뉜다')
  await open('긴 글.md')
  const long = await exportPdf('긴 글.pdf')
  console.log('  ' + JSON.stringify({ pages: long.pages, size: long.size }))
  expect('여러 쪽', long.pages > 1, String(long.pages))
  expect('쪽마다 A4 세로', JSON.stringify(long.boxes) === A4_PORTRAIT, JSON.stringify(long.boxes))

  step('6. 그림은 쪽 하나에, 가로로 길면 누운 쪽에 앉는다')
  await open('세로 그림.png')
  const portrait = await exportPdf('세로 그림.pdf')
  expect('세운 쪽', JSON.stringify(portrait.boxes) === A4_PORTRAIT, JSON.stringify(portrait.boxes))
  expect('한 쪽', portrait.pages === 1, String(portrait.pages))

  await open('누운 그림.svg')
  const landscape = await exportPdf('누운 그림.pdf')
  console.log('  ' + JSON.stringify(landscape.boxes))
  expect('누운 쪽', JSON.stringify(landscape.boxes) === A4_LANDSCAPE, JSON.stringify(landscape.boxes))

  step('7. 표는 고치는 중에도 보던 그대로 낸다')
  /*
   * 화면에 표가 그려져 있지 않아도 됩니다. PDF 는 화면 밖에 다시 그려서 뜨므로,
   * 편집만 하고 있던 파일에서도 그려진 표가 나옵니다.
   */
  await open('작은 표.csv')
  await page.click('.doc-head .mode-switch button:has-text("편집")')
  await page.waitForTimeout(400)
  await page.fill('.main textarea', 'id,name\n1,하나\n2,둘\n3,셋\n')
  await page.waitForTimeout(400)
  await page.click('.doc-head .head-pdf')
  await page.waitForSelector('.pdf-sheet .data-table', { timeout: 20000 })
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.pdf-sheet .data-table tbody tr')].map((one) => one.textContent))
  console.log('  ' + JSON.stringify(rows))
  expect('방금 쓴 줄까지 표로 그려짐', rows.length === 3 && rows[2].includes('셋'),
    JSON.stringify(rows))
  const table = await saved('작은 표.pdf')
  expect('표도 PDF 로 나옴', table.head.startsWith('%PDF-'), JSON.stringify(table))

  step('8. 워드도 낸다')
  await open('안내문.docx')
  await page.waitForSelector('.text-preview.markdown-body', { timeout: 20000 })
  const word = await exportPdf('안내문.pdf')
  expect('PDF 로 나옴', word.head.startsWith('%PDF-') && word.size > 5000, JSON.stringify(word))

  step('9. 글자 그대로 보여 주는 것에는 단추가 없다')
  // PDF 로 감싸도 원본에 더해지는 것이 없고, 자리만 몇 배로 먹습니다.
  const none = {}
  for (const name of ['메모.txt', '도구.py', '자료.zip']) {
    await open(name)
    none[name] = await hasButton()
  }
  console.log('  ' + JSON.stringify(none))
  expect('그냥 글·코드·압축에는 없음', Object.values(none).every((one) => one === 0),
    JSON.stringify(none))

  step('10. 저장 창에서 물러서면 아무것도 남지 않는다')
  await open('개발 환경.md')
  const before = await page.evaluate(() => window.__savedNames().length)
  await page.evaluate(() => { window.__saveCancel = true })
  await page.click('.doc-head .head-pdf')
  await page.waitForTimeout(1200)
  const after = await page.evaluate(() => ({
    saved: window.__savedNames().length,
    sheets: document.querySelectorAll('.pdf-sheet').length,
    busy: document.querySelector('.head-pdf')?.disabled ?? null,
  }))
  console.log('  ' + JSON.stringify({ before, ...after }))
  expect('새로 저장된 것이 없음', after.saved === before, JSON.stringify(after))
  expect('그리지도 않음', after.sheets === 0, JSON.stringify(after))
  expect('단추가 잠긴 채 남지 않음', after.busy === false, JSON.stringify(after))
  await page.evaluate(() => { window.__saveCancel = false })
  await page.screenshot({ path: join(HERE, '..', 'shots', 'pdfexport', '01-button.png'),
    clip: { x: 430, y: 40, width: 970, height: 320 } })
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
