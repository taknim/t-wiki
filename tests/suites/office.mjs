import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOCX_B64, XLSX_B64 } from '../office-fixtures.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'office'), { recursive: true })
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
await page.addInitScript(({ xlsx, docx }) => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const bytes = (b64) => Uint8Array.from(atob(b64), (one) => one.charCodeAt(0))
  const put = (name, data) => root._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: data, _lastModified: Date.now() },
  ))
  put('판매표.xlsx', bytes(xlsx))
  put('안내문.docx', bytes(docx))
  put('옛문서.doc', bytes(docx))          // 확장자만 옛것. 열지 못한다고 알려야 합니다
}, { xlsx: XLSX_B64, docx: DOCX_B64 })

const open = async (label, selector) => {
  await page.click(`.tree-row:has-text("${label}")`)
  await page.waitForSelector(selector, { timeout: 15000 })
  await page.waitForTimeout(400)
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. 엑셀을 고르면 표로 보인다')
  await open('판매표', '.data-table')
  const sheet = await page.evaluate(() => ({
    rows: document.querySelectorAll('.data-table tbody tr').length,
    first: [...document.querySelectorAll('.data-table tbody tr')[0].querySelectorAll('td')]
      .map((one) => one.textContent),
    hint: document.querySelector('.text-preview .hint')?.textContent.trim() ?? null,
    tabs: [...document.querySelectorAll('.sheet-tabs button')].map((one) => one.textContent),
  }))
  console.log('  ' + JSON.stringify(sheet))
  expect('세 줄이 그려짐', sheet.rows === 3, JSON.stringify(sheet))
  expect('첫 줄이 머리글', sheet.first.join() === '1,이름,수량,날짜', JSON.stringify(sheet.first))
  expect('몇 행 몇 열인지 적힘', /3행 · 3열/.test(sheet.hint ?? ''), String(sheet.hint))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'office', '01-sheet.png'),
    clip: { x: 430, y: 60, width: 970, height: 320 } })

  step('2. 시트가 여럿이면 탭으로 오간다')
  expect('시트 탭이 둘', sheet.tabs.join() === '판매,메모', JSON.stringify(sheet.tabs))
  await page.click('.sheet-tabs button:text-is("메모")')
  await page.waitForTimeout(400)
  const second = await page.evaluate(() =>
    document.querySelector('.data-table tbody tr')?.textContent ?? null)
  console.log('  ' + String(second))
  expect('고른 시트가 그려짐', (second ?? '').includes('둘째 시트의 값'), String(second))

  step('3. 워드를 고르면 글로 보인다')
  await open('안내문', '.text-preview.markdown-body')
  const word = await page.evaluate(() => {
    const body = document.querySelector('.text-preview.markdown-body')
    return {
      heading: body.querySelector('h1')?.textContent ?? null,
      bold: body.querySelector('strong')?.textContent ?? null,
      list: body.querySelector('li')?.textContent ?? null,
      text: body.textContent.replace(/\s+/g, ' ').trim(),
    }
  })
  console.log('  ' + JSON.stringify(word))
  expect('제목이 제목으로 옴', word.heading === '워드 제목', JSON.stringify(word))
  expect('굵은 글씨가 살아 있음', word.bold === '굵은 글씨', JSON.stringify(word))
  expect('목록도 옴', word.list === '목록 한 줄', JSON.stringify(word))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'office', '02-word.png'),
    clip: { x: 430, y: 60, width: 970, height: 320 } })

  step('4. 옛 형식은 무엇으로 바꾸면 되는지 알려 준다')
  await open('옛문서', '.asset-note')
  const legacy = await page.evaluate(() =>
    document.querySelector('.asset-note')?.textContent.replace(/\s+/g, ' ').trim() ?? null)
  console.log('  ' + String(legacy))
  expect('열 수 없다고 알림', (legacy ?? '').includes('열어 볼 수 없습니다'), String(legacy))
  expect('바꿀 형식을 일러 줌', (legacy ?? '').includes('docx'), String(legacy))
  expect('파일은 그대로라고 밝힘', (legacy ?? '').includes('폴더에 있습니다'), String(legacy))

  step('5. 설정에서 끄면 읽지 않고 안내만 내놓는다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav .settings-nav-item:text-is("오피스 미리보기")')
  await page.waitForTimeout(500)
  await page.click('.checkbox:has-text("워드·엑셀") input')
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)

  await page.click('.tree-row:has-text("판매표")')
  await page.waitForTimeout(600)
  const off = await page.evaluate(() => ({
    note: document.querySelector('.asset-note')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    table: document.querySelectorAll('.data-table').length,
  }))
  console.log('  ' + JSON.stringify(off))
  expect('표 대신 안내가 나옴', off.table === 0, JSON.stringify(off))
  expect('다시 켜는 길을 일러 줌', (off.note ?? '').includes('설정 → 일반 → 오피스 미리보기'),
    String(off.note))

  step('6. 새로고침해도 꺼진 채로 열린다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click('.tree-row:has-text("안내문")')
  await page.waitForTimeout(600)
  const still = await page.evaluate(() => ({
    note: document.querySelectorAll('.asset-note').length,
    body: document.querySelectorAll('.text-preview.markdown-body').length,
  }))
  console.log('  ' + JSON.stringify(still))
  expect('워드도 꺼진 채', still.note === 1 && still.body === 0, JSON.stringify(still))

  step('7. 다시 켜면 돌아온다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.checkbox:has-text("워드·엑셀") input')
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForSelector('.text-preview.markdown-body', { timeout: 15000 })
  const back = await page.evaluate(() =>
    document.querySelector('.text-preview.markdown-body h1')?.textContent ?? null)
  expect('워드가 다시 그려짐', back === '워드 제목', String(back))

  step('8. 트리에도 오피스 파일이 보인다')
  const listed = await page.evaluate(() =>
    [...document.querySelectorAll('.tree-name')].map((one) => one.textContent))
  expect('셋 다 트리에 있음',
    ['판매표.xlsx', '안내문.docx', '옛문서.doc'].every((one) => listed.includes(one)),
    JSON.stringify(listed))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
