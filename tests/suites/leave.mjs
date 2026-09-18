import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'leave'), { recursive: true })
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
  // 옮길 폴더 창이 굴러가도록 폴더를 여럿 둡니다. 지금 자리는 한가운데 즈음에 둡니다.
  const root = window.__mockRoot
  const dir = (parent, name) => {
    const made = Object.create(Object.getPrototypeOf(root))
    Object.assign(made, { kind: 'directory', name, _children: new Map() })
    parent._children.set(name, made)
    return made
  }
  for (let at = 1; at <= 40; at += 1) dir(root, `묶음 ${String(at).padStart(2, '0')}`)
  const sample = root._children.get('개발 환경.md')
  root._children.get('묶음 20')._children.set('깊은 글.md', Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name: '깊은 글.md', _data: '# 깊은 글\n', _lastModified: Date.now() }))
})

// 떠나기 전 묻는 창. 브라우저의 것이라 글귀는 못 정하고, 뜨는지와 취소가 듣는지만 봅니다.
const dialogs = []
page.on('dialog', async (dialog) => {
  dialogs.push(dialog.type())
  await dialog.dismiss()          // 취소
})

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 폴더를 열기 전에는 새로 고침해도 묻지 않는다')
  // 브라우저는 사람이 한 번은 만진 페이지에서만 묻습니다. 빈 곳을 눌러 둡니다.
  await page.mouse.click(600, 400)
  await page.evaluate(() => location.reload())
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
  expect('묻지 않고 새로 고침됨', dialogs.length === 0, JSON.stringify(dialogs))

  step('2. 폴더를 열어 둔 채 새로 고침하면 묻고, 취소하면 그대로다')
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(500)
  await page.evaluate(() => location.reload())
  await page.waitForTimeout(1200)
  console.log('  뜬 창: ' + JSON.stringify(dialogs))
  expect('떠나기 전에 물음', dialogs.includes('beforeunload'), JSON.stringify(dialogs))
  const kept = await page.evaluate(() => ({
    tree: document.querySelector('.tree') !== null,
    title: document.querySelector('.doc-head h1')?.textContent ?? null,
  }))
  expect('취소하면 그대로 남음', kept.tree && kept.title === '개발 환경.md', JSON.stringify(kept))

  step('3. 옮길 폴더 창은 지금 자리가 가운데에 보이게 뜬다')
  await page.click('.tree-row:has-text("묶음 20") .tree-caret')
  await page.waitForTimeout(300)
  await page.hover('.tree-row:has-text("깊은 글")')
  await page.click('.tree-row:has-text("깊은 글") .tree-tools button[aria-label="옮기기"]')
  await page.waitForSelector('.sheet[aria-label="옮길 폴더 고르기"]', { timeout: 3000 })
  await page.waitForTimeout(300)
  const placed = await page.evaluate(() => {
    const body = document.querySelector('.sheet[aria-label="옮길 폴더 고르기"] .sheet-body')
    const here = body.querySelector('.move-item.is-here')
    const box = body.getBoundingClientRect()
    const row = here.getBoundingClientRect()
    return {
      name: here.querySelector('span')?.textContent,
      scrolled: Math.round(body.scrollTop),
      scrollable: body.scrollHeight > body.clientHeight + 40,
      offset: Math.round((row.top + row.height / 2) - (box.top + box.height / 2)),
      visible: row.top >= box.top && row.bottom <= box.bottom,
    }
  })
  console.log('  ' + JSON.stringify(placed))
  expect('목록이 굴러갈 만큼 길다', placed.scrollable, JSON.stringify(placed))
  expect('지금 자리가 보임', placed.name === '묶음 20' && placed.visible, JSON.stringify(placed))
  expect('가운데 즈음에 섬', Math.abs(placed.offset) < 60 && placed.scrolled > 0, JSON.stringify(placed))
  // 고를 수 없어 흐려지기만 하면 어디서 옮기는지가 도리어 눈에 안 띕니다. 음영과 테두리로 알립니다.
  const marked = await page.evaluate(() => {
    const here = document.querySelector('.move-item.is-here')
    const other = document.querySelector('.move-item:not(.is-here)')
    const style = (el) => ({ bg: getComputedStyle(el).backgroundColor, ring: getComputedStyle(el).boxShadow })
    return { here: style(here), other: style(other) }
  })
  console.log('  ' + JSON.stringify(marked))
  expect('지금 자리에 음영이 깔림', marked.here.bg !== marked.other.bg && marked.here.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(marked))
  expect('테두리도 둘림', marked.here.ring !== 'none' && marked.other.ring === 'none', JSON.stringify(marked))
  await page.locator('.sheet[aria-label="옮길 폴더 고르기"]').screenshot({ path: join(HERE, '..', 'shots', 'leave', '01-move.png') })
  await page.keyboard.press('Escape')
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
