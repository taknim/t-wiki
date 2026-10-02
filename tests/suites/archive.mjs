import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeZip } from '../zip-fixture.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'archive'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1300, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))

/* 압축 둘을 지어 둡니다. 하나는 보통 것, 하나는 압축이 아닌 것(목차가 없는 파일). */
const zip = makeZip([
  { name: '읽어보기.txt', text: '안녕하세요. 이 압축에는 자료가 들어 있습니다.' },
  { name: '자료/', text: '' },
  { name: '자료/표.csv', text: 'id,name\n1,하나\n2,둘\n' },
  // 두 칸 깊이. 들여쓰기가 깊이만큼 벌어지는지 봅니다.
  { name: '자료/안쪽/메모.txt', text: '깊은 자리' },
])
/*
 * 맥에서 만든 꼴: **깃발을 세우지 않고 UTF-8** 로 적습니다. 깃발만 믿으면 한글 이름이
 * 모두 깨집니다(UTF-8 바이트를 EUC-KR 로 읽은 꼴).
 */
const mac = makeZip([
  { name: new TextEncoder().encode('본인확인 모듈 설명서.txt'), utf8: false, text: 'x' },
  { name: new TextEncoder().encode('자료/분기 보고.pdf'), utf8: false, text: 'y' },
])
/* 윈도에서 만든 꼴: 깃발 없이 CP949. */
const win = makeZip([
  { name: new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb, 0x2e, 0x74, 0x78, 0x74]), utf8: false, text: 'x' },
])
/* 윈도가 덧붙이는 칸이 든 압축. 지은 때 칸이 그때만 서는지 봅니다. */
const stamped = makeZip([
  { name: '보고서.txt', text: 'x'.repeat(100), ntfs: { modified: new Date(2026, 5, 6, 7, 8), created: new Date(2026, 0, 2, 3, 4) } },
])
await page.addInitScript(({ bytes, stamped, junk, first, second, mac, win }) => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const put = (name, data) => root._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: new Blob([new Uint8Array(data)]), _lastModified: Date.now() }))
  put('자료 묶음.zip', bytes)
  put('도장 찍힌.zip', stamped)
  put('깨진 것.zip', junk)
  // 나눠 담은 조각. 하나만 읽으면 목차가 없어 실패하고, 이어야 읽힙니다.
  put('나눈 것.zip.001', first)
  put('나눈 것.zip.002', second)
  // 목록을 읽을 수 없는 압축들. 파일 자체는 그대로 보관합니다.
  put('모르는 것.7z', junk)
  put('옛 것.rar', junk)
  put('맥에서 만든.zip', mac)
  put('윈도에서 만든.zip', win)
}, {
  bytes: [...zip],
  stamped: [...stamped],
  junk: [...new TextEncoder().encode('이건 압축이 아닙니다')],
  first: [...zip.slice(0, Math.floor(zip.length / 2))],
  second: [...zip.slice(Math.floor(zip.length / 2))],
  mac: [...mac],
  win: [...win],
})

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  step('1. 압축 파일이 목록에 보이고 넣을 수도 있다')
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.tree-row .tree-name')].map((one) => one.textContent))
  expect('트리에 보임', rows.includes('자료 묶음.zip'), JSON.stringify(rows.slice(0, 8)))
  // ＋파일 창이 zip 을 걸러 내지 않아야 합니다.
  const accept = await page.evaluate(() =>
    document.querySelector('input[type="file"]')?.getAttribute('accept') ?? '')
  expect('파일 고르기에서 압축을 받음',
    ['.zip', '.rar', '.7z', '.alz', '.001'].every((one) => accept.includes(one)), accept)
  // 압축은 문서와 다른 아이콘을 씁니다. 같은 모양이면 목록에서 가릴 수 없습니다.
  const icons = await page.evaluate(() => ({
    압축: document.querySelector('.tree-row:has(.tree-name) .tree-icon.is-archive') !== null,
    같은모양: (() => {
      const rows = [...document.querySelectorAll('.tree-row')]
      const zipRow = rows.find((one) => one.textContent.includes('자료 묶음.zip'))
      const docRow = rows.find((one) => one.textContent.includes('개발 환경'))
      return zipRow?.querySelector('.tree-icon svg path')?.getAttribute('d')
        === docRow?.querySelector('.tree-icon svg path')?.getAttribute('d')
    })(),
  }))
  console.log('  아이콘: ' + JSON.stringify(icons))
  expect('압축에 제 아이콘이 섬', icons.압축, JSON.stringify(icons))
  expect('문서와 다른 모양', icons.같은모양 === false, JSON.stringify(icons))

  step('2. 압축을 고르면 안엣것 목록이 나온다')
  await page.click('.tree-row:has-text("자료 묶음.zip") .tree-name')
  await page.waitForSelector('.archive-table', { timeout: 8000 })
  const listed = await page.evaluate(() => ({
    머리: [...document.querySelectorAll('.archive-table thead th')].map((one) => one.textContent),
    이름: [...document.querySelectorAll('.archive-table .archive-name')].map((one) => one.textContent),
    첫줄: [...document.querySelectorAll('.archive-table tbody tr:first-child td')].map((one) => one.textContent),
    폴더줄: [...document.querySelectorAll('.archive-dir td')].map((one) => one.textContent),
    합계: document.querySelector('.archive-sum').textContent.replace(/\s+/g, ' '),
    // 합계는 목록 **아래**에 있어야 합니다(unzip 의 끝줄처럼).
    아래: document.querySelector('.archive-table').compareDocumentPosition(document.querySelector('.archive-sum')) & 4,
  }))
  console.log('  ' + JSON.stringify(listed))
  expect('안엣것이 모두 적힘',
    JSON.stringify(listed.이름) === JSON.stringify(['읽어보기.txt', '자료/', '표.csv', '메모.txt']),
    JSON.stringify(listed.이름))
  // 한글 이름이 깨지지 않아야 합니다. UTF-8 로 담긴 이름입니다.
  expect('한글 이름이 그대로', listed.이름[0] === '읽어보기.txt', listed.이름[0])
  expect('칸 이름이 unzip 처럼',
    JSON.stringify(listed.머리) === JSON.stringify(['이름', '크기', '압축 크기', '압축율', '최종 수정일시']),
    JSON.stringify(listed.머리))
  // 지은 때가 없는 압축에서는 그 칸을 아예 세우지 않습니다. 빈 칸이 폭만 먹습니다.
  expect('지은 때가 없으면 칸도 없음', !listed.머리.includes('생성일시'), JSON.stringify(listed.머리))
  expect('크기·압축율·때가 적힘',
    listed.첫줄[1].includes('B') && listed.첫줄[3].includes('%') && /\d{4}\. \d{2}\. \d{2}\./.test(listed.첫줄[4]),
    JSON.stringify(listed.첫줄))
  // 폴더 자리는 크기도 압축율도 없습니다. 이름만 적힌 자리입니다.
  expect('폴더 줄은 숫자가 비어 있음',
    listed.폴더줄[1] === '' && listed.폴더줄[2] === '' && listed.폴더줄[3] === '', JSON.stringify(listed.폴더줄))
  expect('합계를 목록 아래에 적음', listed.아래 !== 0, String(listed.아래))
  /*
   * 긴 경로를 통째로 적어 두었더니 어느 것이 어느 폴더 아래인지 눈으로 좇기 어려웠고,
   * 폴더 이름은 흐려서 되레 읽기 어려웠습니다.
   */
  const nested = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.archive-table tbody tr')]
    const cell = (at) => rows[at].querySelector('.archive-name')
    const left = (at) => Math.round(Number.parseFloat(getComputedStyle(cell(at)).paddingInlineStart))
    const tone = getComputedStyle(cell(1)).color.match(/\d+/g).map(Number)
    const plain = getComputedStyle(cell(0)).color.match(/\d+/g).map(Number)
    return {
      들여쓰기: [left(0), left(1), left(2), left(3)],
      쪽지: cell(2).getAttribute('data-tip'),
      폴더색: tone,
      파일색: plain,
      폴더굵기: getComputedStyle(cell(1)).fontWeight,
    }
  })
  console.log('  ' + JSON.stringify(nested))
  // 깊이만큼 벌어집니다: 뿌리 < 한 칸 < 두 칸.
  expect('깊이만큼 들여씀',
    nested.들여쓰기[0] === nested.들여쓰기[1]
    && nested.들여쓰기[2] > nested.들여쓰기[0]
    && nested.들여쓰기[3] > nested.들여쓰기[2], JSON.stringify(nested.들여쓰기))
  // 마디만 적는 대신 온 경로는 쪽지로 남깁니다. 폴더 자리가 없는 압축도 있습니다.
  expect('온 경로는 쪽지로 남김', nested.쪽지 === '자료/표.csv', String(nested.쪽지))
  expect('폴더 이름이 파일과 다른 색', JSON.stringify(nested.폴더색) !== JSON.stringify(nested.파일색),
    JSON.stringify(nested))
  expect('폴더 이름이 굵음', Number(nested.폴더굵기) >= 600, String(nested.폴더굵기))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'archive', '01-list.png'),
    clip: { x: 430, y: 40, width: 870, height: 330 } })
  expect('총 개수와 크기', /^총 3개 파일 · \d/.test(listed.합계), listed.합계)
  // 설명 문구는 걷어냈습니다. unzip 처럼 목록과 합계만 둡니다.
  expect('군말이 없음', !listed.합계.includes('목록만'), listed.합계)

  step('2-1. 윈도가 덧붙인 칸이 있으면 생성일시도 보여 준다')
  await page.click('.tree-row:has-text("도장 찍힌.zip") .tree-name')
  await page.waitForSelector('.archive-table', { timeout: 8000 })
  const stampedRow = await page.evaluate(() => ({
    머리: [...document.querySelectorAll('.archive-table thead th')].map((one) => one.textContent),
    줄: [...document.querySelectorAll('.archive-table tbody tr:first-child td')].map((one) => one.textContent),
  }))
  console.log('  ' + JSON.stringify(stampedRow))
  expect('생성일시 칸이 섬', stampedRow.머리.includes('생성일시'), JSON.stringify(stampedRow.머리))
  expect('지은 때가 적힘', stampedRow.줄[5].includes('2026') && stampedRow.줄[5].includes('01'),
    JSON.stringify(stampedRow.줄))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'archive', '02-stamped.png'),
    clip: { x: 430, y: 40, width: 870, height: 300 } })

  /*
   * 규격은 "깃발이 서 있으면 UTF-8" 이라지만 맥의 압축은 깃발 없이 UTF-8 로 적습니다.
   * 깃발만 믿었더니 한글 이름이 통째로 깨져 나왔습니다.
   */
  step('2-1-2. 깃발이 없어도 한글 이름이 깨지지 않는다')
  for (const [file, want] of [
    // 이름은 마디만 적습니다(깊이는 들여쓰기로). 온 경로는 쪽지에 있습니다.
    ['맥에서 만든.zip', ['본인확인 모듈 설명서.txt', '분기 보고.pdf']],
    ['윈도에서 만든.zip', ['한글.txt']],
  ]) {
    await page.click(`.tree-row:has-text("${file}") .tree-name`)
    await page.waitForSelector('.archive-table', { timeout: 8000 })
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('.archive-table .archive-name')].map((one) => one.textContent))
    console.log('  ' + file + ': ' + JSON.stringify(names))
    expect(`${file} — 이름이 그대로`, JSON.stringify(names) === JSON.stringify(want), JSON.stringify(names))
  }

  step('2-2. 나눠 담은 조각은 이어서 읽는다')
  await page.click('.tree-row:has-text("나눈 것.zip.001") .tree-name')
  await page.waitForSelector('.archive-table', { timeout: 8000 })
  const split = await page.evaluate(() => ({
    이름: [...document.querySelectorAll('.archive-table .archive-name')].map((one) => one.textContent),
    합계: document.querySelector('.archive-sum').textContent.replace(/\s+/g, ' '),
  }))
  console.log('  ' + JSON.stringify(split))
  expect('조각을 이어 목록을 읽음',
    JSON.stringify(split.이름) === JSON.stringify(['읽어보기.txt', '자료/', '표.csv', '메모.txt']),
    JSON.stringify(split.이름))
  expect('몇 조각을 이었는지 알림', split.합계.includes('조각 2개를 이어서 읽음'), split.합계)
  // 뒤 조각을 골라도 같은 목록이어야 합니다. 조각마다 다르게 보이면 헷갈립니다.
  await page.click('.tree-row:has-text("나눈 것.zip.002") .tree-name')
  await page.waitForSelector('.archive-table', { timeout: 8000 })
  const tail = await page.evaluate(() =>
    [...document.querySelectorAll('.archive-table .archive-name')].map((one) => one.textContent))
  expect('뒤 조각에서도 같은 목록', JSON.stringify(tail) === JSON.stringify(split.이름), JSON.stringify(tail))

  step('2-3. 목록을 읽을 수 없는 압축은 까닭을 밝힌다')
  for (const [name, word] of [['모르는 것.7z', '눌려 있어'], ['옛 것.rar', '공개돼 있지 않아']]) {
    await page.click(`.tree-row:has-text("${name}") .tree-name`)
    await page.waitForSelector('.status-error', { timeout: 8000 })
    const said = await page.textContent('.status-error')
    console.log('  ' + name + ': ' + said)
    expect(`${name} — 까닭을 밝힘`, said.includes(word), said)
    expect(`${name} — 보관한다고 알림`, said.includes('그대로 보관'), said)
  }

  step('3. 읽을 수 없는 압축은 까닭을 알린다')
  await page.click('.tree-row:has-text("깨진 것.zip") .tree-name')
  await page.waitForSelector('.status-error', { timeout: 8000 })
  const told = await page.textContent('.status-error')
  console.log('  ' + told)
  expect('목차를 못 찾았다고 알림', told.includes('목차를 찾지 못했습니다'), told)
  expect('표는 그리지 않음', (await page.locator('.archive-table').count()) === 0)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
