import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'search'), { recursive: true })
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
await page.addInitScript(() => {
  window.__installMockFs()
  /*
   * 본문을 읽기에도, 동기화하기에도 너무 큰 텍스트(6MB). **이름으로는 찾혀야 합니다** — 이름 검색은 트리를
   * 훑는 일이라 크기와 상관이 없습니다.
   */
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const line = '2026-09-30 12:00:00 INFO  처리 완료 id=1234567\n'
  const filler = line.repeat(Math.ceil(2 * 1024 * 1024 / line.length))
  // 앞머리와 꼬리에 서로 다른 말을 심어, 어디까지 읽는지 가릴 수 있게 합니다.
  const body = `머리표지 들어 있음\n${filler}꼬리표지 들어 있음\n`
  root._children.set('커다란 기록.txt', Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name: '커다란 기록.txt', _data: new Blob([body]), _lastModified: Date.now() }))
})

const showTab = async (name) => {
  await page.click(`.sidebar-tablist button:has-text("${name}")`)
  await page.waitForTimeout(300)
}
const make = async (name, body) => {
  await page.click('.tree-root button[aria-label="새 문서"]')
  await page.waitForSelector('.dialog-input')
  await page.fill('.dialog-input', name)
  await page.click('.dialog button:has-text("만들기")')
  await page.waitForFunction((want) =>
    document.querySelector('.info-path')?.textContent.endsWith(`/${want}`), name, { timeout: 8000 })
  await page.fill('.editor', body)
  await page.waitForTimeout(900)
}
/** 검색란에 치고 결과가 자리 잡을 때까지 기다립니다. */
const find = async (text) => {
  await page.fill('.search-input', text)
  // 첨부 본문은 검색을 시작할 때 읽습니다. 다 읽을 틈을 줍니다.
  await page.waitForTimeout(1200)
  return page.evaluate(() =>
    [...document.querySelectorAll('.search-results li')].map((li) => ({
      title: li.querySelector('.search-title')?.textContent ?? null,
      path: li.querySelector('.search-path')?.textContent ?? null,
      snippet: li.querySelector('.search-snippet')?.textContent ?? null,
      marked: li.querySelector('.search-snippet mark')?.textContent ?? null,
      // 이름에서 걸린 자리에도 같은 표시가 붙어야 합니다.
      markedName: li.querySelector('.search-title mark')?.textContent ?? null,
      icon: [...(li.querySelector('.tree-icon')?.classList ?? [])].find((c) => c.startsWith('is-')) ?? null,
    })))
}
const titles = (rows) => rows.map((row) => row.title)

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)

  // 본문까지 뒤져야 할 텍스트 첨부를 하나 심어 둡니다.
  await make('연락처.csv', '이름,부서\n피카츄,인사팀\n라이츄,총무팀\n')

  step('1. 폴더 이름으로 찾는다')
  const dir = await find('회사')
  console.log('  ' + JSON.stringify(dir))
  expect('폴더가 나옴', titles(dir).includes('회사'), JSON.stringify(titles(dir)))
  const folder = dir.find((row) => row.title === '회사')
  expect('폴더 아이콘이 붙음', folder?.icon === 'is-dir', String(folder?.icon))
  expect('폴더라고 알려 줌', (folder?.snippet ?? '').includes('폴더'), String(folder?.snippet))
  expect('폴더 이름에도 강조가 붙음', folder?.markedName === '회사', String(folder?.markedName))

  step('2. 폴더를 누르면 그 폴더가 열린다')
  await page.click('.search-results button:has-text("회사")')
  await page.waitForFunction(() => document.querySelector('.info-kind')?.textContent === '폴더',
    { timeout: 8000 })
  expect('그 폴더가 열림', (await page.textContent('.info-path')).trim().endsWith('/회사'),
    await page.textContent('.info-path'))

  step('3. 첨부 파일 이름으로 찾는다')
  const asset = await find('도표')
  console.log('  ' + JSON.stringify(titles(asset)))
  expect('그림도 나옴', titles(asset).includes('도표.svg'), JSON.stringify(titles(asset)))
  expect('그림 아이콘이 붙음',
    asset.find((row) => row.title === '도표.svg')?.icon === 'is-image',
    JSON.stringify(asset))
  expect('파일 이름에도 강조가 붙음',
    asset.find((row) => row.title === '도표.svg')?.markedName === '도표', JSON.stringify(asset))

  step('4. 텍스트 첨부는 본문까지 뒤진다')
  const inside = await find('라이츄')
  console.log('  ' + JSON.stringify(inside))
  expect('csv 안의 말로 찾음', titles(inside).includes('연락처.csv'), JSON.stringify(inside))
  expect('찾은 자리를 보여 줌',
    inside.find((row) => row.title === '연락처.csv')?.marked === '라이츄', JSON.stringify(inside))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'search', '01-text.png'),
    clip: { x: 0, y: 40, width: 470, height: 320 } })

  step('5. 마크다운 본문도 그대로 찾는다')
  const doc = await find('연차')
  console.log('  ' + JSON.stringify(titles(doc)))
  expect('본문에서 찾음', titles(doc).includes('휴가 정책.md'), JSON.stringify(doc))
  expect('찾은 자리를 보여 줌',
    doc.find((row) => row.title === '휴가 정책.md')?.marked === '연차', JSON.stringify(doc))

  step('6. 이름과 본문이 함께 잡히면 이름이 앞선다')
  const both = await find('온보딩')
  console.log('  ' + JSON.stringify(titles(both)))
  expect('이름이 맞는 쪽이 먼저', both[0]?.title === '온보딩.md', JSON.stringify(titles(both)))
  expect('본문에서 가리키는 문서도 나옴',
    titles(both).includes('개발 환경.md'), JSON.stringify(titles(both)))

  /*
   * 본문을 읽지 않는 큰 파일이라도 **이름으로는 찾혀야** 합니다. 이름 검색은 트리를
   * 훑는 일이라 크기와 상관이 없습니다.
   */
  step('6-1. 큰 파일은 앞부분까지 본문으로 찾고, 이름은 늘 찾는다')
  const big = await find('커다란')
  console.log('  ' + JSON.stringify(big))
  expect('이름으로 잡힘', big.some((one) => one.title === '커다란 기록.txt'), JSON.stringify(big))
  /*
   * 큰 파일을 통째로 빼면 이름으로만 찾게 됩니다. 로그는 앞머리에 무엇이 든 파일인지
   * 적혀 있는 일이 많아, 앞에서부터 1MB 까지는 읽어 둡니다.
   */
  const head = await find('머리표지')
  console.log('  앞부분: ' + JSON.stringify(head))
  expect('앞부분은 본문으로 찾힘', head.some((one) => one.title === '커다란 기록.txt'), JSON.stringify(head))
  expect('앞부분만 봤다고 밝힘',
    (head.find((one) => one.title === '커다란 기록.txt')?.snippet ?? '').includes('앞부분에서'),
    JSON.stringify(head))
  // 자른 뒤쪽은 찾히지 않습니다. 못 찾는 것을 찾은 척하지 않습니다.
  const tail = await find('꼬리표지')
  console.log('  뒷부분: ' + JSON.stringify(tail))
  expect('자른 뒤쪽은 찾히지 않음', !tail.some((one) => one.title === '커다란 기록.txt'), JSON.stringify(tail))

  step('7. 없는 말은 없다고 한다')
  await page.fill('.search-input', '없는말없는말')
  await page.waitForTimeout(1000)
  const none = await page.textContent('.panel-empty')
  console.log('  ' + none)
  expect('없다고 알려 줌', none.includes('일치하는 것이 없습니다'), none)

  step('8. 즐겨찾기 탭에서는 이름으로만 거른다')
  await page.fill('.search-input', '')
  await page.waitForTimeout(400)
  for (const label of ['개발 환경', '연락처']) {
    await page.hover(`.tree-row:has-text("${label}")`)
    await page.click(`.tree-row:has-text("${label}") .tree-tools button[aria-label="즐겨찾기에 담기"]`)
    await page.waitForTimeout(300)
  }
  await showTab('즐겨찾기')
  const box = await page.evaluate(() => ({
    placeholder: document.querySelector('.search-input')?.getAttribute('placeholder') ?? null,
    value: document.querySelector('.search-input')?.value ?? null,
  }))
  console.log('  ' + JSON.stringify(box))
  expect('찾는 칸이 있음', box.placeholder?.includes('즐겨찾기'), JSON.stringify(box))
  expect('폴더 탭에 친 말이 넘어오지 않음', box.value === '', JSON.stringify(box))

  const listed = () => page.evaluate(() =>
    [...document.querySelectorAll('.favorites-name')].map((n) => n.textContent))
  expect('둘 다 보임', (await listed()).length === 2, JSON.stringify(await listed()))

  await page.fill('.search-input', '연락')
  await page.waitForTimeout(500)
  const filtered = await listed()
  console.log('  ' + JSON.stringify(filtered))
  expect('이름이 맞는 것만 남음', JSON.stringify(filtered) === '["연락처.csv"]',
    JSON.stringify(filtered))
  const favMark = await page.evaluate(() =>
    document.querySelector('.favorites-name mark')?.textContent ?? null)
  expect('즐겨찾기 이름에도 강조가 붙음', favMark === '연락', String(favMark))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'search', '02-favorites.png'),
    clip: { x: 0, y: 40, width: 470, height: 300 } })

  step('9. 즐겨찾기에서는 본문으로 찾지 않는다')
  const byBody = await page.evaluate(async () => {
    const box = document.querySelector('.search-input')
    return box ? box.value : null
  })
  await page.fill('.search-input', '라이츄')
  await page.waitForTimeout(600)
  const empty = await page.evaluate(() => ({
    rows: document.querySelectorAll('.favorites-name').length,
    note: document.querySelector('.panel-empty')?.textContent ?? null,
    results: document.querySelectorAll('.search-results').length,
  }))
  console.log('  ' + JSON.stringify(empty) + ' (앞 값: ' + byBody + ')')
  expect('본문에 있는 말로는 안 걸림', empty.rows === 0, JSON.stringify(empty))
  expect('없다고 알려 줌', (empty.note ?? '').includes('그런 이름은 없습니다'), JSON.stringify(empty))
  expect('폴더 검색 결과가 새어 들어오지 않음', empty.results === 0, JSON.stringify(empty))

  step('10. 탭을 오가도 친 말이 각자 남는다')
  await showTab('폴더')
  const back = await page.evaluate(() => document.querySelector('.search-input')?.value ?? null)
  console.log('  폴더 탭: ' + JSON.stringify(back))
  expect('폴더 탭 말은 비어 있음', back === '', String(back))
  await page.fill('.search-input', '연차')
  await page.waitForTimeout(600)
  await showTab('즐겨찾기')
  const favBox = await page.evaluate(() => document.querySelector('.search-input')?.value ?? null)
  expect('즐겨찾기 말은 그대로', favBox === '라이츄', String(favBox))
  await showTab('폴더')
  const treeBox = await page.evaluate(() => document.querySelector('.search-input')?.value ?? null)
  expect('폴더 말도 그대로', treeBox === '연차', String(treeBox))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
