import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'imageedit'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
/*
 * 300 × 200 짜리 그림을 하나 지어 둡니다. 왼쪽 절반만 칠하고 오른쪽은 투명하게 두어,
 * JPG 로 낼 때 투명한 자리가 흰 바탕으로 깔리는지도 함께 볼 수 있습니다.
 */
await page.addInitScript(() => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const canvas = document.createElement('canvas')
  canvas.width = 300
  canvas.height = 200
  const paper = canvas.getContext('2d')
  paper.fillStyle = 'rgb(0, 128, 255)'
  paper.fillRect(0, 0, 150, 200)
  window.__seedImage = () => new Promise((done) => canvas.toBlob((blob) => {
    root._children.set('사진.png', Object.assign(Object.create(Object.getPrototypeOf(sample)),
      { kind: 'file', name: '사진.png', _data: blob, _lastModified: Date.now() }))
    done()
  }, 'image/png'))
})

/** 만들어진 파일의 크기와 형식. 흉내 폴더에는 MIME 이 없으므로 첫 바이트로 가립니다. */
const madeFile = (name) => page.evaluate(async (which) => {
  const blob = window.__mockRoot._children.get(which)?._data
  if (!blob) return null
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  const bitmap = await createImageBitmap(blob)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return {
    size,
    bytes: blob.size,
    // PNG 는 89 50 4E 47, JPG 는 FF D8 로 시작합니다.
    kind: head[0] === 0x89 && head[1] === 0x50 ? 'png' : head[0] === 0xff && head[1] === 0xd8 ? 'jpg' : '?',
  }
}, name)

const names = () => page.evaluate(() => [...window.__mockRoot._children.keys()].filter((one) => one.includes('사진')))
const openEditor = async () => {
  await page.click('.doc-head button:has-text("고치기")')
  await page.waitForSelector('.image-edit-frame img', { timeout: 5000 })
  await page.waitForTimeout(400)
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => window.__seedImage())
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  step('1. 그림을 고르면 제목 줄에 고치기 단추가 선다')
  await page.click('.tree-row:has-text("사진.png") .tree-name')
  await page.waitForSelector('.doc-head', { timeout: 8000 })
  expect('그림에는 있음', (await page.locator('.doc-head button:has-text("고치기")').count()) === 1)
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(500)
  expect('문서에는 없음', (await page.locator('.doc-head button:has-text("고치기")').count()) === 0)

  step('2. 크기만 줄여 PNG 로 낸다')
  await page.click('.tree-row:has-text("사진.png") .tree-name')
  await page.waitForSelector('.doc-head', { timeout: 8000 })
  await openEditor()
  const offered = await page.evaluate(() => [
    document.querySelector('#image-width').value, document.querySelector('#image-height').value,
  ])
  expect('본디 크기가 미리 적혀 있음', offered.join('x') === '300x200', JSON.stringify(offered))
  await page.fill('#image-width', '150')
  await page.waitForTimeout(200)
  // 비율을 지키므로 높이는 저절로 따라옵니다.
  expect('높이가 비율대로 따라옴', (await page.inputValue('#image-height')) === '100',
    await page.inputValue('#image-height'))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imageedit', '01-sheet.png') })
  await page.click('.image-edit button:has-text("새 파일로 저장")')
  await page.waitForTimeout(1200)
  const smaller = await madeFile('사진 (고침).png')
  console.log('  ' + JSON.stringify(smaller))
  expect('절반 크기 PNG 가 나옴', smaller?.kind === 'png' && smaller.size.width === 150 && smaller.size.height === 100,
    JSON.stringify(smaller))
  // 원본은 그대로 둡니다. 고친 것은 되돌릴 수 없습니다.
  const kept = await madeFile('사진.png')
  expect('원본은 그대로', kept?.size.width === 300 && kept.size.height === 200, JSON.stringify(kept))
  expect('만든 것을 곧바로 엶', (await page.textContent('.doc-head h1')) === '사진 (고침).png',
    await page.textContent('.doc-head h1'))

  step('3. 끌어서 자른 만큼만 나온다')
  await page.click('.tree-row:has-text("사진.png") >> nth=0')
  await page.waitForTimeout(400)
  await openEditor()
  const frame = await page.locator('.image-edit-frame img').boundingBox()
  /*
   * 그림은 왼쪽 절반만 칠해져 있습니다. **오른쪽(빈 자리)만** 끌어 고르면, 자른 자리를
   * 실제로 쓰는지 색으로 가릴 수 있습니다. 크기만 맞춰서는 통째로 그려도 같은 수가 나옵니다.
   */
  await page.mouse.move(frame.x + frame.width * 0.6, frame.y + 20)
  await page.mouse.down()
  await page.mouse.move(frame.x + frame.width * 0.6 + 100, frame.y + 100, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const cropped = await page.evaluate(() => ({
    width: document.querySelector('#image-width').value,
    height: document.querySelector('#image-height').value,
    overlay: document.querySelector('.image-edit-crop') !== null,
  }))
  console.log('  ' + JSON.stringify(cropped))
  expect('고른 자리가 덮개로 보임', cropped.overlay)
  expect('자른 크기가 그대로 내놓을 크기', cropped.width === '100' && cropped.height === '80',
    JSON.stringify(cropped))
  await page.click('.image-edit button:has-text("새 파일로 저장")')
  await page.waitForTimeout(1200)
  // 같은 이름이 이미 있으므로 번호가 붙습니다.
  const cut = await madeFile('사진 (고침) (2).png')
  console.log('  ' + JSON.stringify(cut))
  expect('자른 만큼만 나옴', cut?.size.width === 100 && cut.size.height === 80, JSON.stringify(cut))
  expect('같은 이름이면 번호를 붙임', (await names()).includes('사진 (고침) (2).png'), JSON.stringify(await names()))
  // 고른 자리는 빈 자리였으므로 칠해진 곳이 하나도 없어야 합니다.
  const inked = await page.evaluate(async () => {
    const blob = window.__mockRoot._children.get('사진 (고침) (2).png')._data
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    bitmap.close()
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let painted = 0
    for (let at = 3; at < pixels.length; at += 4) if (pixels[at] > 10) painted += 1
    return painted
  })
  console.log('  칠해진 점: ' + inked)
  expect('고른 자리(빈 쪽)만 잘려 나옴', inked === 0, String(inked))

  step('4. JPG 로 바꾸면 이름도 따라 바뀌고 투명한 자리는 희게 깔린다')
  await page.click('.tree-row:has-text("사진.png") >> nth=0')
  await page.waitForTimeout(400)
  await openEditor()
  await page.click('.image-edit .segmented button:has-text("JPG")')
  await page.waitForTimeout(200)
  expect('이름이 jpg 로 바뀜', (await page.inputValue('.image-edit input[aria-label="새 파일 이름"]')) === '사진 (고침).jpg',
    await page.inputValue('.image-edit input[aria-label="새 파일 이름"]'))
  expect('품질 자리가 나옴', (await page.locator('#image-quality').count()) === 1)
  await page.click('.image-edit button:has-text("새 파일로 저장")')
  await page.waitForTimeout(1500)
  const jpg = await madeFile('사진 (고침).jpg')
  console.log('  ' + JSON.stringify(jpg))
  expect('JPG 로 나옴', jpg?.kind === 'jpg', JSON.stringify(jpg))
  expect('크기는 그대로', jpg?.size.width === 300 && jpg.size.height === 200, JSON.stringify(jpg))
  /*
   * JPG 에는 투명이 없습니다. 그냥 그리면 투명한 자리가 검게 나오므로 흰 바탕을 먼저 깝니다.
   * 오른쪽 절반(투명하던 자리)의 색을 찍어 봅니다.
   */
  const corner = await page.evaluate(async () => {
    const blob = window.__mockRoot._children.get('사진 (고침).jpg')._data
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    bitmap.close()
    const [r, g, b] = canvas.getContext('2d').getImageData(canvas.width - 5, 5, 1, 1).data
    return [r, g, b]
  })
  console.log('  투명하던 자리: ' + JSON.stringify(corner))
  expect('투명한 자리가 희게 깔림', corner.every((one) => one > 240), JSON.stringify(corner))

  step('5. 닫으면 아무것도 만들지 않는다')
  const before = (await names()).length
  await page.click('.tree-row:has-text("사진.png") >> nth=0')
  await page.waitForTimeout(400)
  await openEditor()
  await page.fill('#image-width', '40')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  expect('창이 닫힘', (await page.locator('.image-edit').count()) === 0)
  expect('만들어진 것이 없음', (await names()).length === before, JSON.stringify(await names()))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
