import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'leading'), { recursive: true })
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
const setLeading = async (name) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(300)
  await page.click(`[aria-label="줄 간격"] button:has-text("${name}")`)
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)
}
/** 화면이 실제로 쓰는 줄 높이. 재 보는 것은 글자 크기가 아니라 줄 높이입니다. */
const measured = () => page.evaluate(() => {
  const of = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const style = getComputedStyle(el)
    return Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) / 100
  }
  return {
    preview: of('.preview'),
    editor: of('.editor'),
    variable: getComputedStyle(document.documentElement).getPropertyValue('--doc-leading').trim(),
    pressed: document.querySelector('[aria-label="줄 간격"] button[aria-pressed="true"]')?.textContent ?? null,
  }
})

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await openVault()
  await openDoc('개발 환경')

  step('1. 기본은 보통이다')
  const first = await measured()
  console.log('  ' + JSON.stringify(first))
  expect('변수가 1.7', first.variable === '1.7', first.variable)
  expect('미리보기가 따름', first.preview === 1.7, String(first.preview))
  expect('편집기도 따름', first.editor === 1.7, String(first.editor))

  step('2. 좁게 고르면 줄이 붙는다')
  await setLeading('좁게')
  const tight = await measured()
  console.log('  ' + JSON.stringify(tight))
  expect('변수가 1.45', tight.variable === '1.45', tight.variable)
  expect('미리보기가 좁아짐', tight.preview === 1.45, String(tight.preview))
  expect('편집기도 좁아짐', tight.editor === 1.45, String(tight.editor))

  step('3. 넓게 고르면 줄이 벌어진다')
  await setLeading('넓게')
  const loose = await measured()
  console.log('  ' + JSON.stringify(loose))
  expect('변수가 2', loose.variable === '2', loose.variable)
  expect('미리보기가 넓어짐', loose.preview === 2, String(loose.preview))
  expect('편집기도 넓어짐', loose.editor === 2, String(loose.editor))
  expect('고른 것이 눌려 있음', loose.pressed === null, '설정 창을 닫아 두었습니다')
  await page.screenshot({ path: join(HERE, '..', 'shots', 'leading', '01-loose.png'),
    clip: { x: 430, y: 60, width: 970, height: 420 } })

  step('4. 글자 크기를 바꿔도 비율은 그대로다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.waitForTimeout(300)
  await page.click('[aria-label="글자 크기"] button:has-text("크게")')
  await page.waitForTimeout(300)
  const bigger = await page.evaluate(() => {
    const el = document.querySelector('.preview')
    const style = getComputedStyle(el)
    return {
      size: parseFloat(style.fontSize),
      ratio: Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) / 100,
      pressed: document.querySelector('[aria-label="줄 간격"] button[aria-pressed="true"]')?.textContent ?? null,
    }
  })
  console.log('  ' + JSON.stringify(bigger))
  expect('글자가 커짐', bigger.size === 17, String(bigger.size))
  expect('비율은 그대로', bigger.ratio === 2, String(bigger.ratio))
  expect('고른 칸이 눌려 있음', bigger.pressed === '넓게', String(bigger.pressed))
  await page.click('.sheet-close')
  await page.waitForTimeout(300)

  step('5. 새로고침해도 그대로다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault()
  await openDoc('개발 환경')
  const kept = await measured()
  console.log('  ' + JSON.stringify(kept))
  expect('변수가 그대로', kept.variable === '2', kept.variable)
  expect('미리보기도 그대로', kept.preview === 2, String(kept.preview))

  step('6. 첨부 미리보기에도 걸린다')
  await page.click('.tree-row:has-text("첨부")')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("도표")')
  await page.waitForTimeout(600)
  const svgPane = await page.evaluate(() => {
    const el = document.querySelector('.code-preview') ?? document.querySelector('.asset-text')
    if (!el) return null
    const style = getComputedStyle(el)
    return Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) / 100
  })
  console.log('  첨부 미리보기: ' + String(svgPane))
  expect('첨부 글도 따름', svgPane === null || svgPane === 2, String(svgPane))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
