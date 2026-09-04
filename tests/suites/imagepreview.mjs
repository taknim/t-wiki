import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'imagepreview'), { recursive: true })
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
/** 씨앗으로 심어 둔 그림. 폴더를 펴야 보입니다. */
const pickImage = async () => {
  if (!(await page.locator('.tree-row:has-text("도표")').count())) {
    await page.click('.tree-row:has-text("첨부")')
    await page.waitForTimeout(300)
  }
  await page.click('.tree-row:has-text("도표")')
  await page.waitForTimeout(600)
}
const setPreview = async (on) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  const box = page.locator('.checkbox:has-text("고른 이미지를") input')
  if ((await box.isChecked()) !== on) await box.click()
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)
}

/** 그림 자리에 무엇이 있는지. */
const shown = () => page.evaluate(() => {
  const img = document.querySelector('.asset-image')
  const note = document.querySelector('.asset-note')
  return {
    image: img ? img.getAttribute('src').slice(0, 5) : null,
    note: note ? note.textContent.replace(/\s+/g, ' ').trim() : null,
  }
})

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await openVault()

  step('1. 기본은 켜짐이라 고른 이미지가 그려진다')
  await pickImage()
  const first = await shown()
  console.log('  ' + JSON.stringify(first))
  expect('그림이 뜸', first.image === 'blob:', JSON.stringify(first))
  expect('안내는 없음', first.note === null, JSON.stringify(first))

  step('2. 끄면 그 자리에서 안내로 바뀐다')
  await setPreview(false)
  const off = await shown()
  console.log('  ' + JSON.stringify(off))
  expect('그림이 사라짐', off.image === null, JSON.stringify(off))
  expect('안내가 나옴', (off.note ?? '').includes('이미지 미리보기'), JSON.stringify(off))
  expect('가는 길을 알려 줌',
    (off.note ?? '').includes('설정 → 일반 → 이미지 미리보기'), JSON.stringify(off))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imagepreview', '01-off.png') })

  step('3. 껐다 다른 이미지를 골라도 그대로 안내다')
  await page.click('.tree-row:has-text("개발 환경")')
  await page.waitForTimeout(400)
  await pickImage()
  const again = await shown()
  console.log('  ' + JSON.stringify(again))
  expect('다시 골라도 안내', again.image === null && again.note !== null, JSON.stringify(again))

  step('4. 새로고침해도 꺼진 채로 열린다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault()
  await pickImage()
  const kept = await shown()
  console.log('  ' + JSON.stringify(kept))
  expect('여전히 꺼짐', kept.image === null && kept.note !== null, JSON.stringify(kept))

  step('5. 꺼도 문서 안에 넣은 그림은 그대로 나온다')
  await page.click('.tree-root button[aria-label="새 문서"]')
  await page.waitForSelector('.dialog-input')
  await page.fill('.dialog-input', '그림 문서')
  await page.click('.dialog button:has-text("만들기")')
  await page.waitForFunction(() =>
    document.querySelector('.info-path')?.textContent === '/그림 문서.md', null, { timeout: 8000 })
  await page.fill('.editor', '# 그림\n\n![도표](첨부/도표.svg)\n')
  await page.waitForTimeout(1200)
  const inDoc = await page.evaluate(() => {
    const img = document.querySelector('.preview img')
    return img ? img.getAttribute('src').slice(0, 5) : null
  })
  console.log('  본문 그림: ' + inDoc)
  expect('본문 그림은 그려짐', inDoc === 'blob:', String(inDoc))

  step('6. 다시 켜면 돌아온다')
  await setPreview(true)
  await pickImage()
  const back = await shown()
  console.log('  ' + JSON.stringify(back))
  expect('그림이 돌아옴', back.image === 'blob:', JSON.stringify(back))
  expect('안내는 사라짐', back.note === null, JSON.stringify(back))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imagepreview', '02-on.png') })
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
