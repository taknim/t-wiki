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

/** 그림 뒤에 깔린 바탕. */
const canvas = () => page.evaluate(() => {
  const box = document.querySelector('.asset-canvas')
  if (!box) return null
  const style = getComputedStyle(box)
  const page = getComputedStyle(document.querySelector('.asset-view'))
  return {
    kind: [...box.classList].find((name) => name.startsWith('is-')) ?? null,
    color: style.backgroundColor,
    checkered: style.backgroundImage.includes('linear-gradient'),
    sameAsPage: style.backgroundColor === page.backgroundColor,
    pressed: [...document.querySelectorAll('.backdrop-switch button')]
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent),
  }
})

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

  step('7. 그림 뒤에는 바둑판이 깔린다')
  const board = await canvas()
  console.log('  ' + JSON.stringify(board))
  expect('바둑판이 기본', board?.kind === 'is-checker', JSON.stringify(board))
  expect('투명한 자리가 드러남', board?.checkered === true, JSON.stringify(board))
  expect('고른 것이 눌린 채로 보임', board?.pressed.join() === '바둑판', JSON.stringify(board))

  step('8. 어둡게로 돌리면 어두운 바탕이 깔린다')
  await page.click('.backdrop-switch button:text-is("어둡게")')
  await page.waitForTimeout(300)
  const dark = await canvas()
  console.log('  ' + JSON.stringify(dark))
  expect('어두운 바탕으로 바뀜', dark?.kind === 'is-dark', JSON.stringify(dark))
  expect('바둑판은 걷힘', dark?.checkered === false, JSON.stringify(dark))
  // 테마 바탕과 같은 색이면 묻히는 그림을 살릴 수 없습니다. 그러라고 만든 자리입니다.
  expect('화면 바탕과 다른 색', dark?.sameAsPage === false, JSON.stringify(dark))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imagepreview', '03-dark.png') })

  step('9. 새로고침해도 고른 바탕이 남는다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault()
  await pickImage()
  const stillDark = await canvas()
  console.log('  ' + JSON.stringify(stillDark))
  expect('어둡게가 그대로', stillDark?.kind === 'is-dark', JSON.stringify(stillDark))

  step('10. 미리보기를 끄면 바탕 고르는 줄도 사라진다')
  await setPreview(false)
  await pickImage()
  const gone = await page.locator('.backdrop-switch').count()
  expect('줄이 사라짐', gone === 0, String(gone))
  await setPreview(true)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
