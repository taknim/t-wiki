import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'viewmode'), { recursive: true })
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
  const first = window.__mockRoot
  const other = Object.create(Object.getPrototypeOf(first))
  Object.assign(other, { kind: 'directory', name: '다른 폴더', _children: new Map() })
  // 보기 모드 단추는 보여 줄 것이 있는 문서에서만 나오므로 저쪽에도 하나 둡니다.
  other._children.set('메모.md', Object.assign(
    Object.create(Object.getPrototypeOf(first._children.get('개발 환경.md'))),
    { kind: 'file', name: '메모.md', _data: '# 메모\n\n한 줄.\n', _lastModified: Date.now() },
  ))
  window.__vaults = { first, other }
  window.__pick = 'first'
  window.showDirectoryPicker = async () => window.__vaults[window.__pick]
})

const openVault = async (w) => {
  await page.evaluate((x) => { window.__pick = x; window.__mockRoot = window.__vaults[x] }, w)
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
}
const closeVault = async () => {
  if (await page.locator('.sheet-close').count()) { await page.click('.sheet-close'); await page.waitForTimeout(200) }
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const openDoc = async (label) => {
  await page.click(`.tree-row:has-text("${label}") .tree-name`)
  await page.waitForSelector('.mode-switch', { timeout: 8000 })
  await page.waitForTimeout(300)
}
/** 지금 눌려 있는 모드. 화면이 실제로 무엇을 그리고 있는지도 함께 봅니다. */
const current = () => page.evaluate(() => {
  const on = document.querySelector('.mode-switch button[aria-pressed="true"]')
  const body = document.querySelector('.doc-body')
  return {
    mode: on?.getAttribute('aria-label') ?? null,
    body: body ? [...body.classList].find((c) => c.startsWith('mode-')) ?? null : null,
    // 아이콘 셋은 서로 닮아, 이름이 함께 적혀 있어야 눌러 보지 않고도 압니다.
    labels: [...document.querySelectorAll('.mode-switch button')]
      .map((button) => button.textContent.trim()),
    lead: document.querySelector('.doc-head .head-tool .head-tool-label')?.textContent ?? null,
  }
})
const pick = async (label) => {
  await page.click(`.mode-switch button[aria-label="${label}"]`)
  await page.waitForTimeout(400)
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 고른 모드가 화면에 적용된다')
  await openVault('first')
  await openDoc('개발 환경')
  const fresh = await current()
  console.log('  처음: ' + JSON.stringify(fresh))
  expect('처음은 나란히', fresh.mode === '나란히', JSON.stringify(fresh))
  expect('단추에 이름이 함께 적힘', fresh.labels.join() === '편집,나란히,미리보기',
    JSON.stringify(fresh.labels))
  expect('앞에 무엇을 고르는지 적힘', fresh.lead === '보기 모드', String(fresh.lead))
  await pick('미리보기')
  const picked = await current()
  console.log('  고른 뒤: ' + JSON.stringify(picked))
  expect('미리보기로 바뀜', picked.mode === '미리보기', JSON.stringify(picked))
  expect('본문도 따라감', picked.body === 'mode-preview', JSON.stringify(picked))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'viewmode', '01-preview.png') })

  step('2. 새로고침해도 미리보기 그대로다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  // 이 시험대의 목 폴더는 새로고침하면 새로 생기므로 다시 엽니다.
  await openVault('first')
  await page.waitForSelector('.mode-switch', { timeout: 8000 })
  await page.waitForTimeout(500)
  const after = await current()
  console.log('  새로고침 뒤: ' + JSON.stringify(after))
  expect('보던 문서가 다시 열림',
    (await page.textContent('.info-path')).trim() === '/개발 환경.md',
    await page.textContent('.info-path'))
  expect('미리보기로 열림', after.mode === '미리보기', JSON.stringify(after))
  expect('나란히로 돌아가지 않음', after.body === 'mode-preview', JSON.stringify(after))

  step('3. 폴더마다 따로 기억한다')
  await pick('편집')
  await closeVault()
  await openVault('other')
  await openDoc('메모')
  const others = await current()
  console.log('  다른 폴더: ' + JSON.stringify(others))
  expect('처음 여는 폴더는 기본값', others.mode === '나란히', JSON.stringify(others))
  await pick('미리보기')

  await closeVault()
  await openVault('first')
  await page.waitForSelector('.mode-switch', { timeout: 8000 })
  await page.waitForTimeout(400)
  const back = await current()
  console.log('  원래 폴더: ' + JSON.stringify(back))
  expect('원래 폴더는 편집 그대로', back.mode === '편집', JSON.stringify(back))
  expect('본문도 편집', back.body === 'mode-edit', JSON.stringify(back))

  await closeVault()
  await openVault('other')
  await page.waitForSelector('.mode-switch', { timeout: 8000 })
  await page.waitForTimeout(400)
  const again = await current()
  console.log('  다른 폴더 다시: ' + JSON.stringify(again))
  expect('저쪽은 미리보기 그대로', again.mode === '미리보기', JSON.stringify(again))

  step('4. 기억하기를 끄면 따라오지 않는다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("일반")')
  const remember = page.locator('.checkbox:has-text("마지막")').first()
  if (await remember.count()) {
    await remember.locator('input').uncheck()
    await page.waitForTimeout(200)
    await page.click('.sheet-close')
    await closeVault()
    await openVault('other')
    await openDoc('메모')
    const off = await current()
    console.log('  끈 뒤: ' + JSON.stringify(off))
    expect('기본값으로 열림', off.mode === '나란히', JSON.stringify(off))
  } else {
    console.log('  (기억하기 설정을 못 찾아 건너뜁니다)')
  }
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? cause.message : String(cause))
} finally {
  if (errors.length) fail('화면 오류', errors.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
