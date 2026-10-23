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
 * **어두운 세피아로 돌립니다.** PDF 는 늘 흰 바탕에 밝은 벌로 나와야 하는데, 앱이 밝은
 * 채로 시험하면 그것이 지켜지는지 알 수 없습니다. 세피아는 밝은 벌도 바탕이 누레서
 * (#faf4e8) "밝다" 와 "희다" 를 가려 줍니다.
 */
await page.addInitScript(({ xlsx, docx }) => {
  /*
   * 본문 너비는 '좁게'(680px), 글자는 '아주 크게'(19px)로 둡니다.
   * 종이에서는 둘 다 쓰지 않고 쪽에 맞춘 제 값으로 서야 합니다.
   */
  localStorage.setItem('mdwiki:theme',
    JSON.stringify({ theme: 'sepia', mode: 'dark', width: 'narrow', size: 'largest' }))
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
  /*
   * 창 너비를 바꿔 가며 견줄 글. **내용이 똑같은 두 벌**을 둡니다 — 같은 파일을 두 번
   * 내보내면 둘째가 첫째를 덮어써, 무엇이 달라졌는지 가릴 수 없습니다.
   */
  const paged = '# 쪽 나눔\n\n| 구분 | 대상 | 이유 |\n| --- | --- | --- |\n'
    + Array.from({ length: 40 }, (_, at) =>
      `| 계정 | \`taknim${at + 1}\` | 줄이 여럿으로 접히도록 길게 적어 둔 까닭입니다 |`).join('\n')
    + '\n\n## 표 뒤\n\n마지막 문단입니다.\n'
  put('쪽 나눔.md', paged)
  put('쪽 나눔 사본.md', paged)
  /*
   * 쪽보다 넓어지려 드는 글. 칸마다 띄어쓰기 없는 긴 토막을 넣어 **접을 자리가 없게**
   * 만듭니다. 그냥 긴 글은 저절로 접혀 쪽 안에 들어오므로 아무것도 드러내지 못합니다.
   */
  put('넓은 표.md', '# 넓은 표\n\n'
    + '| # | 위치 | 문제 | 고치는 법 | 품 | 비고 |\n| --- | --- | --- | --- | --- | --- |\n'
    + Array.from({ length: 5 }, (_, at) => `| ${at + 1} `
      + '| `application/controllers/Manage_excel_download.php` '
      + '| `PHP7.2이상에서경고가납니다확인바랍니다` '
      + '| `vendor/phpoffice/phpspreadsheet/src/Writer.php` | 2일 '
      + '| `https://example.com/aaaaaaaa/bbbbbbbb/cccccccc` |').join('\n')
    + '\n\n```sh\nSSLProtocol all -SSLv3 -TLSv1 -TLSv1.1 SSLCipherSuite '
    + 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:'
    + 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384\n```\n\n'
    + '| 구분 | 값 |\n| --- | --- |\n| 하나 | 1 |\n')
  /*
   * 줄을 넘어가며 접히는 코드 조각. 조각 **뒤에 글이 더 있어야** 덮이는 것이 드러납니다.
   * 조각만 든 칸은 제 바탕이 제 글만 덮으므로 아무 일도 없어 보입니다.
   */
  put('덮임.md', '# 덮임\n\n'
    + '앞에 글을 길게 적어 코드 조각이 줄 끝에 걸리도록 합니다. 보안 업데이트가 계속 나오므로 '
    + '설치 때 `dnf upgrade -y --refresh --setopt=install_weak_deps=False --exclude=kernel* '
    + '--enablerepo=crb --disablerepo=epel-testing` 후 `rpm -q` 로 다시 확인해 이 표를 고칩니다. '
    + '뒤에 오는 이 글이 가려지면 안 됩니다.\n\n'
    + '| 구분 | 값 | 비고 |\n| --- | --- | --- |\n'
    + '| 웹 | TLS 1.0·1.1·1.2 (`SSLProtocol all -SSLv2 -SSLv3`), 약한 암호 3DES 허용 | 2장 |\n')
}, { xlsx: XLSX_B64, docx: DOCX_B64 })

const open = async (name) => {
  await page.click(`.tree-row:has-text("${name}") .tree-name`)
  await page.waitForTimeout(600)
}
const hasButton = () => page.locator('.doc-tools .doc-tool-pdf').count()
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
  await page.click('.doc-tools .doc-tool-pdf')
  return saved(name)
}
const A4_PORTRAIT = '[[0,0,595.28,841.89]]'

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  const dark = await page.evaluate(() => document.documentElement.dataset.mode)
  expect('어두운 테마로 보고 있음', dark === 'dark', String(dark))

  step('1. 마크다운을 A4 세로 한 벌로 낸다')
  await open('개발 환경.md')
  expect('글 옆에 PDF 단추가 섬', (await hasButton()) === 1)
  const doc = await exportPdf('개발 환경.md.pdf')
  console.log('  ' + JSON.stringify({ ...doc, boxes: doc.boxes }))
  expect('PDF 파일임', doc.head.startsWith('%PDF-'), doc.head)
  expect('한 쪽', doc.pages === 1, String(doc.pages))
  expect('A4 세로', JSON.stringify(doc.boxes) === A4_PORTRAIT, JSON.stringify(doc.boxes))
  expect('빈 파일이 아님', doc.size > 5000, String(doc.size))

  /*
   * 저장 창에 미리 적히는 이름. 가짜 저장 창은 적힌 이름 그대로 파일을 지으므로,
   * 저장된 이름이 곧 창에 뜬 이름입니다.
   *
   * 원래 확장자를 갈아 치우면 `개발 환경.pdf` 가 되어, 한 자리에 모아 둘 때 같은 이름의
   * 다른 형식에서 낸 것과 부딪힙니다. 무엇에서 뜬 것인지도 이름에서 사라집니다.
   */
  const names = await page.evaluate(() => window.__savedNames())
  console.log('  ' + JSON.stringify(names))
  expect('저장 이름은 원래 이름 뒤에 .pdf',
    names.includes('개발 환경.md.pdf') && !names.includes('개발 환경.pdf'), JSON.stringify(names))

  step('2. 뜨는 자리는 어두운 테마로 보던 중에도 흰 바탕이다')
  /*
   * PDF 는 화면 밖에 한 벌 더 그려서 뜹니다. 그 자리가 **살아 있는 동안** 색을 잽니다.
   * 어두운 바탕을 그대로 내보내면 쪽마다 검은 자리가 깔려 잉크를 들이켭니다.
   * 테마의 밝은 바탕(세피아는 누런빛)도 쓰지 않습니다 — 글이 앉은 자리만 누렇고 네 변의
   * 여백은 희어, 쪽 한가운데에 색종이를 붙여 놓은 꼴이 됩니다.
   */
  await open('판매표.xlsx')
  await page.waitForSelector('.data-table', { timeout: 20000 })
  await page.click('.doc-tools .doc-tool-pdf')
  await page.waitForSelector('.pdf-sheet .sheet-page', { timeout: 20000 })
  const sheet = await page.evaluate(() => {
    const host = document.querySelector('.pdf-sheet')
    const head = host.querySelector('.data-table td, .data-table th')
    return {
      bg: getComputedStyle(host).backgroundColor,
      // 표 머리의 음영. 테마 색이 그대로 남아야 합니다.
      음영: head ? getComputedStyle(head.closest('.table-wrap')).borderTopColor : null,
      width: host.getBoundingClientRect().width,
      names: [...host.querySelectorAll('.sheet-name')].map((one) => one.textContent),
      tabs: host.querySelectorAll('.sheet-tabs').length,
      offscreen: host.getBoundingClientRect().right < 0,
      화면: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    }
  })
  console.log('  ' + JSON.stringify(sheet))
  expect('흰 바탕', sheet.bg === 'rgb(255, 255, 255)', sheet.bg)
  // 화면은 어두운 채로 있어야 합니다. PDF 를 뜨느라 보던 색이 바뀌면 안 됩니다.
  expect('보던 화면은 그대로 어두움', /^#[0-3]/.test(sheet.화면), sheet.화면)
  // 바탕만 희게 합니다. 테두리·음영까지 지우면 표와 코드 칸의 결이 사라집니다.
  expect('테마 색은 남아 있음', sheet.음영 !== null && sheet.음영 !== 'rgb(255, 255, 255)',
    String(sheet.음영))
  expect('화면 밖에 섬', sheet.offscreen, JSON.stringify(sheet))
  expect('쪽 너비(698px)로 앉힘', Math.round(sheet.width) === 698, String(sheet.width))

  step('3. 엑셀은 시트를 모두 담는다')
  // 종이에는 탭이 없습니다. 탭으로 가려 두면 보고 있던 한 장만 나가고 나머지는 사라집니다.
  expect('시트 이름이 둘', sheet.names.join() === '판매,메모', JSON.stringify(sheet.names))
  expect('탭은 두지 않음', sheet.tabs === 0, String(sheet.tabs))
  const book = await saved('판매표.xlsx.pdf')
  expect('엑셀도 PDF 로 나옴', book.head.startsWith('%PDF-') && book.pages >= 1, JSON.stringify(book))

  step('4. 다 끝나면 화면 밖 자리를 치운다')
  await page.waitForFunction(() => document.querySelectorAll('.pdf-sheet').length === 0,
    undefined, { timeout: 20000 })
  ok('치워짐')

  step('5. 긴 글은 여러 쪽으로 나뉜다')
  await open('긴 글.md')
  const long = await exportPdf('긴 글.md.pdf')
  console.log('  ' + JSON.stringify({ pages: long.pages, size: long.size }))
  expect('여러 쪽', long.pages > 1, String(long.pages))
  expect('쪽마다 A4 세로', JSON.stringify(long.boxes) === A4_PORTRAIT, JSON.stringify(long.boxes))

  step('6. 그림에는 단추를 두지 않는다 — 종이로 내는 길은 수정 화면에 있다')
  /*
   * 그림을 종이에 담기 전에 하고 싶은 일(돌리기·자르기·크기 줄이기)은 모두 수정 화면에
   * 있습니다. 보는 화면에도 단추를 두면, 손질하려던 사람은 파일을 한 번 만들어 폴더에
   * 남기고 그것을 다시 열어 눌러야 했습니다. 수정 화면이 내는 것은 imageedit 묶음에서 봅니다.
   */
  const pictures = {}
  for (const name of ['세로 그림.png', '누운 그림.svg']) {
    await open(name)
    pictures[name] = { 단추: await hasButton(), 수정: await page.locator('.doc-head button:has-text("수정")').count() }
  }
  console.log('  ' + JSON.stringify(pictures))
  expect('그림에는 Export PDF 가 없음',
    Object.values(pictures).every((one) => one.단추 === 0), JSON.stringify(pictures))
  expect('그 대신 수정 단추가 있음',
    Object.values(pictures).every((one) => one.수정 === 1), JSON.stringify(pictures))

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
  await page.click('.doc-tools .doc-tool-pdf')
  await page.waitForSelector('.pdf-sheet .data-table', { timeout: 20000 })
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.pdf-sheet .data-table tbody tr')].map((one) => one.textContent))
  console.log('  ' + JSON.stringify(rows))
  expect('방금 쓴 줄까지 표로 그려짐', rows.length === 3 && rows[2].includes('셋'),
    JSON.stringify(rows))
  const table = await saved('작은 표.csv.pdf')
  expect('표도 PDF 로 나옴', table.head.startsWith('%PDF-'), JSON.stringify(table))

  step('8. 워드도 낸다')
  await open('안내문.docx')
  await page.waitForSelector('.text-preview.markdown-body', { timeout: 20000 })
  const word = await exportPdf('안내문.docx.pdf')
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
  await page.click('.doc-tools .doc-tool-pdf')
  await page.waitForTimeout(1200)
  const after = await page.evaluate(() => ({
    saved: window.__savedNames().length,
    sheets: document.querySelectorAll('.pdf-sheet').length,
    busy: document.querySelector('.doc-tool-pdf')?.disabled ?? null,
  }))
  console.log('  ' + JSON.stringify({ before, ...after }))
  expect('새로 저장된 것이 없음', after.saved === before, JSON.stringify(after))
  expect('그리지도 않음', after.sheets === 0, JSON.stringify(after))
  expect('단추가 잠긴 채 남지 않음', after.busy === false, JSON.stringify(after))
  await page.evaluate(() => { window.__saveCancel = false })

  step('11. 단추는 글 오른쪽 아래, 목차 위에 선다')
  /*
   * 제목 줄에 있던 것을 글 옆으로 내렸습니다. 다 읽고 나서 "이대로 종이에 담자" 가
   * 되는 일이라, 눈과 손이 글 끝에 가 있을 때 닿아야 합니다.
   */
  await open('긴 글.md')
  await page.waitForTimeout(600)
  const stack = await page.evaluate(() => {
    const main = document.querySelector('.main').getBoundingClientRect()
    const box = document.querySelector('.doc-tools').getBoundingClientRect()
    return {
      차례: [...document.querySelectorAll('.doc-tools .doc-tool')].map((one) => one.textContent.trim()),
      제목줄: document.querySelectorAll('.doc-head .doc-tool-pdf, .doc-head .head-pdf').length,
      오른쪽: Math.round(main.right - box.right),
      아래: Math.round(main.bottom - box.bottom),
    }
  })
  console.log('  ' + JSON.stringify(stack))
  expect('글자가 Export PDF', stack.차례[0] === 'Export PDF', JSON.stringify(stack.차례))
  expect('목차보다 위', stack.차례.findIndex((one) => one.startsWith('목차')) === 1,
    JSON.stringify(stack.차례))
  expect('제목 줄에는 없음', stack.제목줄 === 0, String(stack.제목줄))
  expect('오른쪽 아래에 뜸', stack.오른쪽 < 40 && stack.아래 < 90, JSON.stringify(stack))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'pdfexport', '01-button.png'),
    clip: { x: 900, y: 480, width: 500, height: 420 } })

  /*
   * 떠 있는 단추가 그림의 배율 손잡이와 겹치지 않는지는 imageedit 묶음에서 봅니다.
   * 그림에는 Export PDF 가 서지 않으므로, 이제 그 구석에서 부딪히는 것은 맨 위·맨 아래입니다.
   */
  step('12. 창을 좁혀도 같은 PDF 가 나온다')
  /*
   * 좁은 화면 규칙(@media max-width: 720px)이 글 칸의 좌우 여백을 20px 에서 12px 로
   * 줄입니다. 쪽 너비(698px)는 그 자보다 좁아, 그냥 두면 **뜨는 틀 안에서도** 그 규칙이
   * 걸렸습니다. 그러면 쪽 가를 자리를 재어 둔 이쪽과 그려진 그림이 어긋나, 쪽 끝에서
   * 글줄과 표의 한 줄이 반 토막 납니다. 창 너비에 흔들리지 않아야 합니다.
   */
  const paper = async () => {
    await page.click('.doc-tools .doc-tool-pdf')
    await page.waitForSelector('.pdf-sheet .preview', { timeout: 20000 })
    return page.evaluate(() =>
      getComputedStyle(document.querySelector('.pdf-sheet .preview')).paddingLeft)
  }

  await open('쪽 나눔.md')
  const wideGap = await paper()
  const wide = await saved('쪽 나눔.md.pdf')

  await open('쪽 나눔 사본.md')
  await page.setViewportSize({ width: 600, height: 920 })
  await page.waitForTimeout(600)
  /*
   * 좁아지면 옆줄이 서랍처럼 덮개와 함께 뜹니다. 덮개를 눌러 닫아야 본문에 손이 닿습니다.
   * 덮개는 화면을 다 덮지만 그 가운데는 서랍이 가리고 있으므로, 서랍 밖(오른쪽)을 짚습니다.
   */
  if (await page.locator('.sidebar-backdrop').count()) {
    await page.click('.sidebar-backdrop', { position: { x: 520, y: 500 } })
    await page.waitForTimeout(400)
  }
  // 보기 모드는 앞 걸음에서 고른 것을 따라옵니다. 셋 가운데 서 있는 칸을 잽니다.
  const onScreen = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.main .preview, .main .editor, .main .asset-view'))
      .paddingLeft)
  const narrowGap = await paper()
  const narrow = await saved('쪽 나눔 사본.md.pdf')
  await page.setViewportSize({ width: 1400, height: 920 })
  await page.waitForTimeout(400)
  // 덮개를 눌러 닫은 옆줄은 넓혀도 닫힌 채입니다. 트리를 다시 펴야 다음 글을 고릅니다.
  if (!(await page.locator('.tree').count())) {
    await page.keyboard.press('Meta+Shift+B')
    await page.waitForSelector('.tree', { timeout: 8000 })
    await page.waitForTimeout(300)
  }

  console.log('  ' + JSON.stringify({ wideGap, narrowGap, onScreen,
    넓은창: wide.pages, 좁은창: narrow.pages }))
  // 좁힌 화면에서는 보고 있는 글의 여백이 실제로 줄어야 합니다. 안 줄면 시험이 헛돈 것입니다.
  expect('좁힌 화면의 본문은 여백이 줄어듦', onScreen === '12px', onScreen)
  expect('뜨는 자리는 넓은 창에서 20px', wideGap === '20px', wideGap)
  expect('좁은 창에서도 그대로 20px', narrowGap === '20px', narrowGap)
  expect('쪽 수가 같음', wide.pages === narrow.pages && wide.pages > 1,
    `${wide.pages} ≠ ${narrow.pages}`)

  step('13. 넓은 표와 긴 코드는 잘리지 않고 쪽 너비에 맞춰 접힌다')
  /*
   * 화면에서는 넘치는 표와 코드를 제 칸 안에서 옆으로 굴려 봅니다. 종이에는 굴릴 손이
   * 없어, 칸 밖으로 나간 자리가 그대로 잘려 나갔습니다 — 열이 많은 표의 마지막 열과
   * 긴 코드 한 줄의 뒷부분이 통째로 사라졌습니다.
   */
  await open('넓은 표.md')
  // 화면 쪽 글자와 견주려면 그린 글이 서 있어야 합니다. 보기 모드는 앞 걸음을 따라옵니다.
  await page.click('.doc-head .mode-switch button[aria-label="미리보기"]')
  await page.waitForSelector('.main .preview', { timeout: 10000 })
  await page.click('.doc-tools .doc-tool-pdf')
  await page.waitForSelector('.pdf-sheet .markdown-body table', { timeout: 20000 })
  const wrapped = await page.evaluate(() => {
    const host = document.querySelector('.pdf-sheet')
    const edge = host.getBoundingClientRect().right
    const tables = [...host.querySelectorAll('.markdown-body table')]
    const code = host.querySelector('.markdown-body pre')
    const cut = (one) => one.scrollWidth - one.clientWidth
    return {
      쪽넘침: host.scrollWidth - host.clientWidth,
      표넘침: tables.map(cut),
      표오른끝: tables.map((one) => Math.round(one.getBoundingClientRect().right - edge)),
      // 몇 칸 안 되는 표는 쪽 끝까지 늘이지 않습니다.
      좁은표: Math.round(tables[tables.length - 1].getBoundingClientRect().width),
      코드넘침: code ? cut(code) : null,
      본문너비: getComputedStyle(host).getPropertyValue('--doc-width').trim(),
      글자: getComputedStyle(host.querySelector('.markdown-body')).fontSize,
      화면글자: getComputedStyle(document.querySelector('.main .preview')).fontSize,
      제목: getComputedStyle(host.querySelector('.markdown-body h1')).fontSize,
      화면제목: getComputedStyle(document.querySelector('.main .preview h1')).fontSize,
      줄간격: getComputedStyle(host).getPropertyValue('--doc-leading').trim(),
    }
  })
  console.log('  ' + JSON.stringify(wrapped))
  expect('쪽이 넘치지 않음', wrapped.쪽넘침 === 0, JSON.stringify(wrapped))
  expect('표가 제 칸 안에 다 들어옴', wrapped.표넘침.every((one) => one <= 0),
    JSON.stringify(wrapped))
  expect('표가 쪽 밖으로 나가지 않음', wrapped.표오른끝.every((one) => one <= 0),
    JSON.stringify(wrapped))
  expect('긴 코드도 접힘', wrapped.코드넘침 === 0, JSON.stringify(wrapped))
  expect('작은 표는 늘어나지 않음', wrapped.좁은표 < 400, JSON.stringify(wrapped))
  // 본문 너비 설정('좁게' = 680px)은 쓰지 않습니다. 종이에서는 쪽 너비가 자입니다.
  expect('본문 너비 설정을 쓰지 않음', wrapped.본문너비 === 'none', String(wrapped.본문너비))
  /*
   * 글자 크기도 마찬가지입니다. 화면은 한 번에 한 화면만 보여 주므로 넉넉한 편이 읽기
   * 좋지만, 종이는 쪽 수가 곧 무게입니다. '아주 크게'(19px)로 보고 있어도 종이에는 9pt
   * 로 앉혀 한 쪽에 더 담습니다.
   */
  expect('화면은 고른 대로 큼', wrapped.화면글자 === '19px', String(wrapped.화면글자))
  expect('종이는 9pt(12px)', wrapped.글자 === '12px', String(wrapped.글자))
  expect('줄 간격도 촘촘함', wrapped.줄간격 === '1.5', String(wrapped.줄간격))
  /*
   * 제목 크기는 본문 크기에 매여 있지 않고 못 박혀 있습니다. 본문만 줄이면 제목만 유난히
   * 커 보이고, 제목이 잦은 글에서는 쪽 수도 줄지 않습니다 — 쪽을 차지하던 것이 제목이기
   * 때문입니다.
   */
  expect('제목도 같은 비로 줄어듦',
    wrapped.화면제목 === '24px' && wrapped.제목 === '19px', JSON.stringify(wrapped))
  const fitted = await saved('넓은 표.md.pdf')
  expect('PDF 로 나옴', fitted.head.startsWith('%PDF-'), JSON.stringify(fitted))

  step('14. 줄을 넘어간 코드 조각이 뒤의 글을 덮지 않는다')
  /*
   * 뜨는 쪽은 줄을 넘어가며 접힌 인라인 요소의 바탕을 **조각마다가 아니라 통째로 한 번**
   * 칠합니다. 그래서 두 줄에 걸친 코드 조각이 그 줄의 나머지 글을 네모나게 덮어, 무슨
   * 글이었는지 알 수 없게 되었습니다 — 표의 칸과 문단에서 글이 통째로 사라졌습니다.
   *
   * 화면이 아니라 뜬 그림에서 일어나는 일이라 색을 재서는 잡을 수 없습니다. 대신 그 일이
   * 일어날 수 있는 꼴 자체를 막습니다: **바탕을 지닌 인라인은 두 줄에 걸치지 않는다.**
   */
  await open('덮임.md')
  await page.click('.doc-tools .doc-tool-pdf')
  await page.waitForSelector('.pdf-sheet .markdown-body table', { timeout: 20000 })
  const spread = await page.evaluate(() => {
    const host = document.querySelector('.pdf-sheet')
    const 걸친것 = []
    for (const one of host.querySelectorAll('.markdown-body *')) {
      // 울타리 안의 코드는 블록이 제 바탕을 칠하므로 그런 일이 없습니다.
      if (one.closest('pre')) continue
      const look = getComputedStyle(one)
      if (look.display !== 'inline') continue
      if (look.backgroundColor === 'rgba(0, 0, 0, 0)') continue
      if (one.getClientRects().length > 1) 걸친것.push(`${one.tagName}:${one.textContent.slice(0, 16)}`)
    }
    const chips = [...host.querySelectorAll('.markdown-body code')].filter((one) => !one.closest('pre'))
    return {
      걸친것,
      키: chips.map((one) => Math.round(one.getBoundingClientRect().height)),
      // 조각 뒤의 글이 그대로 남아 있는지. 덮이는 것은 그림에서지만 글은 여기 있어야 합니다.
      칸글: host.querySelector('.markdown-body td')?.parentElement.textContent ?? '',
    }
  })
  console.log('  ' + JSON.stringify(spread))
  // 시험이 헛돌지 않으려면 접힐 만큼 긴 조각이 실제로 있어야 합니다(한 줄은 17px 남짓).
  expect('두 줄이 되는 조각이 있음', spread.키.some((one) => one > 25), JSON.stringify(spread.키))
  expect('바탕을 지닌 인라인이 두 줄에 걸치지 않음', spread.걸친것.length === 0,
    JSON.stringify(spread.걸친것))
  expect('조각 뒤의 글도 그대로', spread.칸글.includes('약한 암호 3DES 허용'), spread.칸글)
  const safe = await saved('덮임.md.pdf')
  expect('PDF 로 나옴', safe.head.startsWith('%PDF-'), JSON.stringify(safe))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
