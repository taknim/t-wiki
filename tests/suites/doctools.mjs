import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOCX_LONG_B64, XLSX_LONG_B64 } from '../office-fixtures.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'doctools'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(({ xlsx, docx }) => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const bytes = (b64) => Uint8Array.from(atob(b64), (one) => one.charCodeAt(0))
  const mk = (name, data) => Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: data, _lastModified: Date.now() },
  )
  const make = (name, data) => root._children.set(name, mk(name, data))
  // 굴릴 것이 있는 긴 글과, 한 화면에 들어오는 짧은 글을 함께 둡니다.
  make('긴 문서.md', ['# 긴 문서', '', ...Array.from({ length: 40 },
    (_, at) => `## 제목 ${at + 1}\n\n본문 줄입니다.\n`)].join('\n'))
  make('짧은 문서.md', '# 짧은 문서\n\n한 줄뿐입니다.\n')
  /*
   * 앞머리가 달린 글. 제목은 앞머리를 뗀 본문에서 뽑으므로, 뗀 만큼 자리를 밀어
   * 주지 않으면 편집기에서 엉뚱한 줄로 뛰어갑니다.
   */
  make('앞머리 문서.md', ['---', 'title: 앞머리', 'tags: [가, 나]', '# 주석처럼 보이는 줄', '---', '',
    '# 앞머리 문서', '', ...Array.from({ length: 40 },
      (_, at) => `## 갈래 ${at + 1}\n\n본문 줄입니다.\n`)].join('\n'))
  make('긴 자료.csv', ['가,나,다', ...Array.from({ length: 200 },
    (_, at) => `${at},값,값`)].join('\n'))
  // 한 화면에 담기지 않는 오피스 문서. 이쪽은 벌을 내려받아 그린 뒤에야 칸이 섭니다.
  make('긴 표.xlsx', bytes(xlsx))
  make('긴 보고서.docx', bytes(docx))

  /*
   * 같은 이름의 문서를 두 자리에 둡니다.
   *
   * [[메모]] 는 뿌리 쪽으로 풀립니다. 이름만 맞춰 세면 깊은 곳의 메모도 제 것으로
   * 세어 백링크가 없는데도 큰 수가 적힙니다. 코드 블록 안의 링크는 링크가 아닙니다.
   */
  make('메모.md', '# 메모\n\n뿌리에 있는 메모입니다.\n')
  const dir = (parent, name) => {
    const made = Object.create(Object.getPrototypeOf(root))
    Object.assign(made, { kind: 'directory', name, _children: new Map() })
    parent._children.set(name, made)
    return made
  }
  dir(dir(root, '자료'), '깊은')._children.set('메모.md', mk('메모.md', '# 메모\n\n깊은 곳입니다.\n'))
  for (const at of [1, 2, 3]) {
    make(`가리킴 ${at}.md`, `# 가리킴 ${at}\n\n[[메모]] 를 봅니다.\n`)
  }
  make('코드.md', '# 코드\n\n```\n[[메모]]\n```\n')
  // 이름이 같은 두 문서가 같은 문맥으로 가리킵니다. 이름만 적으면 구별이 되지 않습니다.
  for (const where of ['회사', '회고']) {
    root._children.get(where)._children.set('알림.md',
      mk('알림.md', '# 알림\n\n[[자료/깊은/메모]] 를 봅니다.\n'))
  }
}, { xlsx: XLSX_LONG_B64, docx: DOCX_LONG_B64 })

const openDoc = async (label) => {
  await page.click(`.tree-row:has-text("${label}") .tree-name`)
  await page.waitForTimeout(700)
}
const openToc = async () => {
  const open = await page.evaluate(() => document.querySelectorAll('.info-panel .toc').length > 0)
  if (!open) await page.click('.doc-tool:has-text("목차")')
  await page.waitForTimeout(400)
}
const tools = () => page.evaluate(() =>
  [...document.querySelectorAll('.doc-tool')].map((one) => one.textContent.trim()))
const pane = () => page.evaluate(() => {
  const one = document.querySelector('.main .preview, .main .editor, .main .asset-view')
  return { top: Math.round(one.scrollTop), max: Math.round(one.scrollHeight - one.clientHeight) }
})
/*
 * 부드럽게 굴러가므로 누르자마자 재면 가는 도중입니다.
 * 멈출 때까지 기다렸다가 잽니다. 긴 글은 몇 초씩 걸립니다.
 */
const settled = async () => {
  let last = -1
  for (let tries = 0; tries < 40; tries += 1) {
    const now = await pane()
    if (now.top === last) return now
    last = now.top
    await page.waitForTimeout(150)
  }
  return pane()
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. 목차와 백링크가 글 옆에 뜬다')
  await openDoc('긴 문서')
  await page.click('.mode-switch button[aria-label="미리보기"]')
  await page.waitForTimeout(700)
  const shown = await tools()
  console.log('  ' + JSON.stringify(shown))
  expect('목차가 셈과 함께 뜸', shown.some((one) => /^목차\d+$/.test(one)), JSON.stringify(shown))
  expect('백링크도 뜸', shown.some((one) => one.startsWith('백링크')), JSON.stringify(shown))
  // 아래 표시줄에서는 빠졌습니다. 두 자리에 겹쳐 두면 어느 쪽을 눌러야 할지 헷갈립니다.
  const inBar = await page.evaluate(() => document.querySelectorAll('.info-bar .info-toggle').length)
  expect('표시줄에는 남지 않음', inBar === 0, String(inBar))

  // 오른쪽 아래 구석에 떠 있어야 합니다.
  const spot = await page.evaluate(() => {
    const box = document.querySelector('.doc-tools').getBoundingClientRect()
    const main = document.querySelector('.main').getBoundingClientRect()
    return { right: Math.round(main.right - box.right), bottom: Math.round(main.bottom - box.bottom) }
  })
  console.log('  ' + JSON.stringify(spot))
  expect('오른쪽 아래에 뜸', spot.right < 40 && spot.bottom < 90, JSON.stringify(spot))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'doctools', '01-tools.png'),
    clip: { x: 700, y: 250, width: 500, height: 440 } })

  /*
   * 굴림대가 자리를 차지하는 기계에서는 오른쪽 여백이 그만큼 깎여 단추가 굴림대에
   * 달라붙었습니다. 눈에 보이는 틈이 같아야 합니다.
   * 여기 굴림대는 떠 있는 꼴이라 자리를 먹지 않으므로, gutter 로 흉내 냅니다.
   */
  step('2. 굴림대가 자리를 먹어도 틈은 그대로다')
  const gaps = () => page.evaluate(() => {
    const box = document.querySelector('.main .preview')
    const tools = document.querySelector('.doc-tools').getBoundingClientRect()
    const dock = document.querySelector('.info-dock').getBoundingClientRect()
    const bar = box.offsetWidth - box.clientWidth
    return {
      bar,
      right: Math.round(box.getBoundingClientRect().right - bar - tools.right),
      bottom: Math.round(dock.top - tools.bottom),
    }
  })
  const plain = await gaps()
  console.log('  떠 있는 굴림대: ' + JSON.stringify(plain))
  expect('오른쪽이 넉넉함', plain.right >= 20, JSON.stringify(plain))
  expect('아래도 같은 틈', Math.abs(plain.bottom - plain.right) <= 2, JSON.stringify(plain))

  await page.addStyleTag({ content: '.main .preview { scrollbar-gutter: stable; }' })
  await page.waitForTimeout(700)
  const wide = await gaps()
  console.log('  자리 먹는 굴림대: ' + JSON.stringify(wide))
  expect('굴림대가 자리를 먹음', wide.bar > 8, JSON.stringify(wide))
  expect('그래도 틈은 그대로', Math.abs(wide.right - plain.right) <= 2, JSON.stringify(wide))

  step('3. 눌러서 목차를 폈다 접는다')
  await page.click('.doc-tool:has-text("목차")')
  await page.waitForTimeout(400)
  const opened = await page.evaluate(() => ({
    panel: document.querySelectorAll('.info-panel .toc').length,
    pressed: document.querySelector('.doc-tool.is-open')?.textContent.trim() ?? null,
  }))
  console.log('  ' + JSON.stringify(opened))
  expect('목차가 펴짐', opened.panel === 1, JSON.stringify(opened))
  expect('누른 단추가 짙어짐', (opened.pressed ?? '').startsWith('목차'), JSON.stringify(opened))
  await page.click('.doc-tool:has-text("목차")')
  await page.waitForTimeout(400)
  expect('다시 누르면 접힘',
    (await page.evaluate(() => document.querySelectorAll('.info-panel').length)) === 0)

  step('4. 맨 위·맨 아래로 한 번에 간다')
  const before = await pane()
  await page.click('.doc-tool:has-text("맨 아래")')
  const bottom = await settled()
  console.log('  ' + JSON.stringify(before) + ' → ' + JSON.stringify(bottom))
  expect('맨 아래까지 내려감', bottom.top >= bottom.max - 12, JSON.stringify(bottom))
  await page.click('.doc-tool:has-text("맨 위")')
  const top = await settled()
  console.log('  ' + JSON.stringify(top))
  expect('맨 위까지 올라옴', top.top <= 2, JSON.stringify(top))

  step('5. 굴릴 것이 없으면 위아래 단추도 없다')
  await openDoc('짧은 문서')
  await page.waitForTimeout(600)
  const short = await tools()
  console.log('  ' + JSON.stringify(short))
  expect('맨 위·맨 아래가 없음', !short.some((one) => one.includes('맨')), JSON.stringify(short))
  expect('목차·백링크는 그대로', short.some((one) => one.startsWith('백링크')), JSON.stringify(short))

  step('6. 마크다운이 아닌 글에서도 위아래로 간다')
  await openDoc('긴 자료.csv')
  await page.waitForTimeout(800)
  const csv = await tools()
  console.log('  ' + JSON.stringify(csv))
  expect('맨 위·맨 아래가 뜸', csv.some((one) => one.includes('맨 아래')), JSON.stringify(csv))
  expect('백링크는 없음', !csv.some((one) => one.startsWith('백링크')), JSON.stringify(csv))
  await page.click('.doc-tool:has-text("맨 아래")')
  const csvBottom = await settled()
  console.log('  ' + JSON.stringify(csvBottom))
  expect('표도 맨 아래로 감', csvBottom.top >= csvBottom.max - 12, JSON.stringify(csvBottom))

  /*
   * 워드·엑셀은 벌을 내려받아 그린 뒤에야 굴릴 칸이 생깁니다. 문서를 열 때 한 번만
   * 재고 말면 그때는 아직 칸이 없어, 단추가 끝내 나오지 않았습니다.
   */
  step('7. 워드·엑셀에서도 위아래 단추가 나온다')
  for (const [label, what] of [['긴 표.xlsx', '엑셀'], ['긴 보고서.docx', '워드']]) {
    await openDoc(label)
    await page.waitForSelector('.main .asset-view .preview', { timeout: 15000 })
    await page.waitForTimeout(900)
    const office = await tools()
    console.log(`  ${what}: ` + JSON.stringify(office))
    expect(`${what}에도 맨 위·맨 아래가 뜸`,
      office.some((one) => one.includes('맨 아래')), JSON.stringify(office))
  }
  // 정말 굴러가는지도 봅니다. 단추만 떠 있고 움직이지 않으면 소용없습니다.
  const officePane = () => page.evaluate(() => {
    const one = document.querySelector('.main .asset-view .preview')
    return { top: Math.round(one.scrollTop), max: Math.round(one.scrollHeight - one.clientHeight) }
  })
  await page.click('.doc-tool:has-text("맨 아래")')
  await page.waitForTimeout(1500)
  const wordBottom = await officePane()
  console.log('  ' + JSON.stringify(wordBottom))
  expect('워드도 맨 아래로 감', wordBottom.top >= wordBottom.max - 12, JSON.stringify(wordBottom))

  /*
   * 보기 모드를 바꾸면 굴릴 칸이 통째로 갈아 끼워집니다. 한 번 잡아 둔 칸을 붙들고
   * 있으면 그 뒤로는 아무것도 재지 못해 단추가 사라진 채로 남았습니다.
   */
  step('8. 보기 모드를 바꿔도 단추가 남는다')
  await openDoc('긴 문서')
  await page.click('.mode-switch button[aria-label="미리보기"]')
  await page.waitForTimeout(700)
  for (const mode of ['편집', '나란히', '미리보기']) {
    await page.click(`.mode-switch button[aria-label="${mode}"]`)
    await page.waitForTimeout(800)
    const now = await tools()
    console.log(`  ${mode}: ` + JSON.stringify(now))
    expect(`${mode}에서도 맨 위·맨 아래가 뜸`,
      now.some((one) => one.includes('맨 아래')), JSON.stringify(now))
  }

  /*
   * 편집만 볼 때도 목차는 남습니다. 뛰어갈 앵커가 없을 뿐이지, 갈 곳은 있습니다.
   * 글자 자리를 짚어 편집기를 그 줄로 굴려 보냅니다.
   */
  step('9. 편집 화면에서도 목차로 그 줄을 찾아간다')
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(700)
  const inEdit = await tools()
  console.log('  ' + JSON.stringify(inEdit))
  expect('편집에서도 목차가 뜸', inEdit.some((one) => /^목차\d+$/.test(one)), JSON.stringify(inEdit))
  await page.click('.doc-tool:has-text("목차")')
  await page.waitForTimeout(400)
  await page.click('.info-panel .toc a:text-is("제목 30")')
  await page.waitForTimeout(600)
  const jumped = await page.evaluate(() => {
    const editor = document.querySelector('.main .editor')
    const at = editor.value.indexOf('## 제목 30')
    // 그 줄이 화면 어디쯤에 섰는지. 전체 높이에서 차지하는 몫으로 어림합니다.
    const upTo = editor.scrollHeight * (at / editor.value.length)
    return {
      top: Math.round(editor.scrollTop),
      max: Math.round(editor.scrollHeight - editor.clientHeight),
      line: Math.round(upTo),
      caret: editor.selectionStart,
      at,
      dirty: document.querySelector('.pill')?.textContent ?? null,
    }
  })
  console.log('  ' + JSON.stringify(jumped))
  expect('편집기가 굴러감', jumped.top > 0, JSON.stringify(jumped))
  expect('그 줄이 화면 안에 듦',
    jumped.line >= jumped.top - 40 && jumped.line <= jumped.top + 400, JSON.stringify(jumped))
  expect('커서도 그 줄에 섬', jumped.caret === jumped.at, JSON.stringify(jumped))
  // 자리를 재느라 값을 잠깐 갈아 끼웁니다. 고쳐졌다고 잡히면 안 됩니다.
  expect('글은 고쳐지지 않음', jumped.dirty === '저장됨', String(jumped.dirty))

  // 앞머리를 뗀 만큼 자리를 밀어야 합니다. 안 그러면 몇 줄 앞으로 떨어집니다.
  await openDoc('앞머리 문서')
  await page.click('.mode-switch button[aria-label="편집"]')
  await page.waitForTimeout(700)
  await openToc()
  await page.click('.info-panel .toc a:text-is("갈래 30")')
  await page.waitForTimeout(600)
  const withHead = await page.evaluate(() => {
    const editor = document.querySelector('.main .editor')
    return { caret: editor.selectionStart, at: editor.value.indexOf('## 갈래 30'), top: Math.round(editor.scrollTop) }
  })
  console.log('  앞머리: ' + JSON.stringify(withHead))
  expect('앞머리가 있어도 그 줄에 섬', withHead.caret === withHead.at, JSON.stringify(withHead))
  expect('앞머리가 있어도 굴러감', withHead.top > 0, JSON.stringify(withHead))

  // 결과 화면이 있을 때는 앵커가 데려다 줍니다. 편집기를 굴리지 않습니다.
  await openDoc('긴 문서')
  await page.waitForTimeout(400)
  await openToc()
  await page.click('.mode-switch button[aria-label="미리보기"]')
  await page.waitForTimeout(700)
  await page.click('.info-panel .toc a:text-is("제목 20")')
  await page.waitForTimeout(700)
  const anchored = await page.evaluate(() => {
    const box = document.querySelector('.main .preview')
    const head = [...box.querySelectorAll('h2')].find((one) => one.textContent.startsWith('제목 20'))
    return { top: Math.round(box.scrollTop), head: Math.round(head.getBoundingClientRect().top) }
  })
  console.log('  ' + JSON.stringify(anchored))
  expect('결과 화면도 그 자리로 감', anchored.top > 0 && anchored.head < 400, JSON.stringify(anchored))

  // 부를 단추가 사라지면 펼친 것도 접습니다. 접을 단추가 없는데 남으면 닫을 길이 없습니다.
  step('10. 부를 단추가 사라지면 펼친 것도 접힌다')
  await openDoc('긴 자료.csv')
  await page.waitForTimeout(700)
  const folded = await page.evaluate(() => ({
    panel: document.querySelectorAll('.info-panel').length,
    tools: [...document.querySelectorAll('.doc-tool')].map((one) => one.textContent.trim()),
  }))
  console.log('  ' + JSON.stringify(folded))
  expect('목차가 접힘', folded.panel === 0, JSON.stringify(folded))
  expect('목차 단추도 감춰짐',
    !folded.tools.some((one) => one.startsWith('목차')), JSON.stringify(folded))

  /*
   * 백링크 셈은 목록과 같은 자리에서 나와야 합니다. 예전에는 셈만 따로 세면서
   * 파일명만 맞춰 보아, 다른 폴더의 같은 이름 문서를 가리키는 링크까지 세었습니다.
   */
  step('11. 백링크 셈이 펼친 목록과 맞고, 어느 폴더의 것인지 밝힌다')
  await page.click('.tree-row:has-text("자료") .tree-caret')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("깊은") .tree-caret')
  await page.waitForTimeout(300)
  await page.locator('.tree-row:has-text("메모.md")').nth(0).click()
  await page.waitForTimeout(700)
  const deep = await tools()
  console.log('  깊은 곳: ' + JSON.stringify(deep))
  expect('가리키는 둘만 셈', deep.includes('백링크2'), JSON.stringify(deep))
  await page.click('.doc-tool:has-text("백링크")')
  await page.waitForTimeout(400)
  const listed = await page.evaluate(() =>
    [...document.querySelectorAll('.info-panel .backlinks > li')].map((one) => ({
      text: one.querySelector('.backlink-title').textContent.trim(),
      dir: one.querySelector('.backlink-dir')?.textContent.trim() ?? null,
    })))
  console.log('  ' + JSON.stringify(listed))
  expect('펼친 목록도 둘', listed.length === 2, JSON.stringify(listed))
  // 이름은 둘 다 알림.md 입니다. 폴더까지 적혀야 어느 것인지 갈립니다.
  expect('폴더까지 적힘',
    listed.every((one) => /^(회사|회고)\/$/.test(one.dir ?? '')), JSON.stringify(listed))
  expect('둘이 서로 다름', listed[0].text !== listed[1].text, JSON.stringify(listed))

  await page.locator('.tree-row:has-text("메모.md")').nth(1).click()
  await page.waitForTimeout(700)
  const rooted = await page.evaluate(() => ({
    tools: [...document.querySelectorAll('.doc-tool')].map((one) => one.textContent.trim()),
    items: [...document.querySelectorAll('.info-panel .backlinks > li')].map((one) =>
      one.querySelector('.backlink-title').textContent.trim()),
  }))
  console.log('  뿌리: ' + JSON.stringify(rooted))
  // 셋이 가리키고, 코드 블록 안의 하나는 링크가 아닙니다.
  expect('셋이라고 적힘', rooted.tools.includes('백링크3'), JSON.stringify(rooted))
  expect('펼친 목록도 셋', rooted.items.length === 3, JSON.stringify(rooted))
  // 뿌리에 있는 문서는 앞에 붙일 폴더가 없습니다.
  expect('뿌리 문서는 이름만', rooted.items.every((one) => !one.includes('/')), JSON.stringify(rooted))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
