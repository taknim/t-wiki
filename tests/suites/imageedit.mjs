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
  // 칸보다 큰 그림. 화면 맞춤이 뜻을 가지려면 줄여서 보일 만큼 커야 합니다.
  const big = document.createElement('canvas')
  big.width = 2000
  big.height = 1200
  big.getContext('2d').fillStyle = 'rgb(40, 130, 170)'
  big.getContext('2d').fillRect(0, 0, 2000, 1200)
  const put = (name, blob) => root._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: blob, _lastModified: Date.now() }))
  window.__seedImage = () => Promise.all([
    new Promise((done) => canvas.toBlob((blob) => { put('사진.png', blob); done() }, 'image/png')),
    new Promise((done) => big.toBlob((blob) => { put('큰 그림.png', blob); done() }, 'image/png')),
  ])
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

const names = () => page.evaluate(() => [...window.__mockRoot._children.keys()].filter((one) => /사진|자른/.test(one)))
const openEditor = async () => {
  await page.click('.doc-head button:has-text("수정")')
  await page.waitForSelector('.image-edit-frame img', { timeout: 5000 })
  await page.waitForTimeout(400)
}
const saveEdit = async () => {
  await page.click('.image-edit button:has-text("저장")')
  await page.waitForTimeout(1200)
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => window.__seedImage())
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  step('1. 그림을 고르면 제목 줄에 수정 단추와 배율 손잡이가 선다')
  await page.click('.tree-row:has-text("사진.png") .tree-name')
  await page.waitForSelector('.doc-head', { timeout: 8000 })
  expect('그림에는 있음', (await page.locator('.doc-head button:has-text("수정")').count()) === 1)
  expect('배율 손잡이는 그림 위에 있음', (await page.locator('.asset-canvas .zoom-control').count()) === 1)
  // 오른쪽 위 정보에 형식도 적습니다. PNG 냐 JPG 냐에 따라 투명·품질이 갈립니다.
  await page.waitForSelector('.asset-size', { timeout: 5000 })
  const info = (await page.textContent('.asset-size')).replace(/\s+/g, ' ')
  console.log('  ' + info)
  expect('형식이 적힘', info.startsWith('PNG'), info)
  expect('크기도 함께', info.includes('300 × 200px'), info)
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(500)
  expect('문서에는 없음', (await page.locator('.doc-head button:has-text("수정")').count()) === 0)

  /*
   * 큰 그림은 칸에 맞춰 줄여 보지만, 작은 그림이나 촘촘한 도표는 키워 봐야 합니다.
   * 보기 배율은 볼 때와 고칠 때 같은 손잡이를 씁니다.
   */
  /*
   * 배율 손잡이는 제목 줄이 아니라 **그림 위에** 떠 있습니다(문서의 맨 위·맨 아래 단추와
   * 같은 자리). 셈은 늘 지금 그려진 배율에서 한 걸음입니다.
   */
  step('2. 그림 위의 손잡이로 배율을 키우고 줄인다')
  await page.click('.tree-row:has-text("큰 그림") .tree-name')
  await page.waitForSelector('.asset-image', { timeout: 8000 })
  await page.waitForTimeout(500)
  const zoomed = () => page.evaluate(() => {
    const image = document.querySelector('.asset-image')
    const canvas = document.querySelector('.asset-canvas').getBoundingClientRect()
    const box = image.getBoundingClientRect()
    return {
      적힌: document.querySelector('.zoom-control .zoom-now').textContent,
      잰: Math.round((box.width / image.naturalWidth) * 100),
      // 칸보다 작으면 가운데에, 커지면 왼쪽 위부터 보여야 굴려서 끝까지 닿습니다.
      가운데: Math.abs((box.left - canvas.left) - (canvas.right - box.right)) < 3,
      왼쪽밖: box.left < canvas.left - 1,
    }
  })
  expect('손잡이가 그림 위에 있음', (await page.locator('.asset-canvas .zoom-control').count()) === 1)
  expect('제목 줄에는 없음', (await page.locator('.doc-head .zoom-control').count()) === 0)
  const fit = await zoomed()
  console.log('  맞춤: ' + JSON.stringify(fit))
  expect('맞춤은 줄여서 보여 줌', fit.잰 < 100 && fit.적힌 === `${fit.잰}%`, JSON.stringify(fit))
  expect('작으면 가운데에 놓임', fit.가운데 && !fit.왼쪽밖, JSON.stringify(fit))
  /*
   * 37% 처럼 어중간한 값에서 눌러도 바로 위 눈금으로 가야 합니다. 100% 부터 세었더니
   * 키우려고 눌렀는데 150% 로 건너뛰었습니다.
   */
  await page.click('.asset-canvas .zoom-control button[aria-label="확대"]')
  await page.waitForTimeout(300)
  const up = await zoomed()
  console.log('  확대: ' + JSON.stringify(up))
  expect('지금 배율에서 한 걸음 위로', up.잰 > fit.잰 && up.잰 <= 75, JSON.stringify(up))
  await page.click('.asset-canvas .zoom-control button[aria-label="축소"]')
  await page.waitForTimeout(300)
  const down = await zoomed()
  console.log('  축소: ' + JSON.stringify(down))
  expect('한 걸음 아래로', down.잰 < up.잰, JSON.stringify(down))
  // 배율을 정해 두었어도 칸보다 작으면 가운데에 있어야 합니다. 늘 왼쪽 위로 붙이면 허전합니다.
  expect('줄여 놓아도 가운데', down.가운데 && !down.왼쪽밖, JSON.stringify(down))
  // 원본 크기로. 칸보다 커지므로 왼쪽 위부터 보입니다.
  await page.click('.asset-canvas .zoom-control button[aria-label="원본 크기"]')
  await page.waitForTimeout(300)
  const actual = await zoomed()
  console.log('  원본: ' + JSON.stringify(actual))
  expect('원본 크기는 100%', actual.잰 === 100 && actual.적힌 === '100%', JSON.stringify(actual))
  expect('칸보다 크면 왼쪽 위부터', !actual.왼쪽밖, JSON.stringify(actual))
  await page.click('.asset-canvas .zoom-control button[aria-label="화면에 맞추기"]')
  await page.waitForTimeout(300)
  expect('다시 화면 맞춤', (await zoomed()).잰 === fit.잰, JSON.stringify(await zoomed()))

  step('2-1. 맨 글쇠로도 배율을 다룬다')
  await page.click('.asset-canvas')
  await page.keyboard.press('Digit1')
  await page.waitForTimeout(300)
  expect('1 은 원본 크기', (await zoomed()).잰 === 100, JSON.stringify(await zoomed()))
  await page.keyboard.press('Equal')
  await page.waitForTimeout(300)
  expect('= 는 확대', (await zoomed()).잰 === 150, JSON.stringify(await zoomed()))
  // ＋ 는 ⇧= 로 누릅니다. 어느 쪽으로 눌러도 같은 일이어야 합니다.
  await page.keyboard.press('Shift+Equal')
  await page.waitForTimeout(300)
  expect('＋(⇧=) 도 확대', (await zoomed()).잰 === 200, JSON.stringify(await zoomed()))
  await page.keyboard.press('Minus')
  await page.waitForTimeout(300)
  expect('− 는 축소', (await zoomed()).잰 === 150, JSON.stringify(await zoomed()))
  await page.keyboard.press('Digit0')
  await page.waitForTimeout(300)
  expect('0 은 화면 맞춤', (await zoomed()).잰 === fit.잰, JSON.stringify(await zoomed()))
  // 글을 치는 자리에서는 가로채지 않습니다. 검색 칸에 0 을 친다고 그림이 줄면 안 됩니다.
  await page.click('.search-input')
  await page.keyboard.type('0')
  await page.waitForTimeout(300)
  expect('검색 칸에 친 글쇠는 배율을 건드리지 않음', (await zoomed()).잰 === fit.잰,
    JSON.stringify(await zoomed()))
  await page.fill('.search-input', '')
  await page.waitForTimeout(300)

  step('3. 수정은 덮개 창이 아니라 본문 자리에서 열린다')
  await page.click('.tree-row:has-text("사진.png") .tree-name')
  await page.waitForSelector('.doc-head', { timeout: 8000 })
  await page.waitForTimeout(400)
  await openEditor()
  expect('본문 자리에 뜸', (await page.locator('.main .image-edit').count()) === 1)
  expect('덮개가 없음', (await page.locator('.overlay .image-edit').count()) === 0)
  expect('옆줄이 그대로 보임', (await page.locator('.tree').count()) === 1)
  expect('제목 줄이 수정 모드라고 알림', (await page.textContent('.doc-head .pill')) === '수정 모드',
    await page.textContent('.doc-head .pill'))
  expect('수정 중에는 수정 단추가 빠짐', (await page.locator('.doc-head button:has-text("수정")').count()) === 0)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imageedit', '02-mode.png') })
  await page.click('.image-edit button:has-text("취소")')
  await page.waitForTimeout(400)
  expect('취소하면 보기로 돌아감', (await page.locator('.asset-image').count()) === 1
    && (await page.textContent('.doc-head .pill')) === '읽기 전용', await page.textContent('.doc-head .pill'))

  step('4. 크기만 줄여 PNG 로 낸다')
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
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imageedit', '01-edit.png') })
  await saveEdit()
  const smaller = await madeFile('사진 (고침).png')
  console.log('  ' + JSON.stringify(smaller))
  expect('절반 크기 PNG 가 나옴', smaller?.kind === 'png' && smaller.size.width === 150 && smaller.size.height === 100,
    JSON.stringify(smaller))
  // 원본은 그대로 둡니다. 고친 것은 되돌릴 수 없습니다.
  const kept = await madeFile('사진.png')
  expect('원본은 그대로', kept?.size.width === 300 && kept.size.height === 200, JSON.stringify(kept))
  expect('만든 것을 곧바로 엶', (await page.textContent('.doc-head h1')) === '사진 (고침).png',
    await page.textContent('.doc-head h1'))

  step('5. 끌어서 자른 만큼만 나온다')
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
  const near = (got, want) => Math.abs(Number(got) - want) <= 2
  expect('자른 크기가 그대로 내놓을 크기', near(cropped.width, 100) && near(cropped.height, 80),
    JSON.stringify(cropped))
  // 이름을 달리해 둡니다. 같은 이름이면 덮어쓸지 묻는 길로 빠집니다(7번 걸음).
  await page.fill('.image-edit input[aria-label="파일 이름"]', '자른 것.png')
  await saveEdit()
  // 같은 이름이 이미 있으므로 번호가 붙습니다.
  const cut = await madeFile('자른 것.png')
  console.log('  ' + JSON.stringify(cut))
  expect('자른 만큼만 나옴', near(cut?.size.width, 100) && near(cut?.size.height, 80), JSON.stringify(cut))
  // 고른 자리는 빈 자리였으므로 칠해진 곳이 하나도 없어야 합니다.
  const inked = await page.evaluate(async () => {
    const blob = window.__mockRoot._children.get('자른 것.png')._data
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

  step('6. JPG 로 바꾸면 이름도 따라 바뀌고 투명한 자리는 희게 깔린다')
  await page.click('.tree-row:has-text("사진.png") >> nth=0')
  await page.waitForTimeout(400)
  await openEditor()
  await page.click('.image-edit .segmented button:has-text("JPG")')
  await page.waitForTimeout(200)
  expect('이름이 jpg 로 바뀜', (await page.inputValue('.image-edit input[aria-label="파일 이름"]')) === '사진 (고침).jpg',
    await page.inputValue('.image-edit input[aria-label="파일 이름"]'))
  expect('품질 자리가 나옴', (await page.locator('#image-quality').count()) === 1)
  await saveEdit()
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

  /*
   * 같은 이름으로 저장하면 덮어쓸지 먼저 묻습니다. 덮으면 되돌릴 수 없고, 문서에 끼워 넣은
   * 자리도 함께 바뀝니다. 물러서면 아무것도 쓰지 않고 수정 화면에 머뭅니다.
   */
  step('7. 같은 이름으로 저장하면 덮어쓸지 묻는다')
  await page.click('.tree-row:has-text("사진.png") >> nth=0')
  await page.waitForTimeout(400)
  await openEditor()
  await page.fill('#image-width', '60')
  await page.fill('.image-edit input[aria-label="파일 이름"]', '사진.png')
  await page.click('.image-edit button:has-text("저장")')
  await page.waitForSelector('.dialog', { timeout: 4000 })
  const asked = (await page.textContent('.dialog')).replace(/\s+/g, ' ')
  console.log('  ' + asked.slice(0, 100))
  expect('덮어쓴다고 알림', asked.includes('같은 이름이 이미 있습니다'), asked.slice(0, 60))
  expect('되돌릴 수 없다고 경고', asked.includes('되돌릴 수 없고'), asked.slice(0, 120))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  expect('물러서면 그대로 수정 화면', (await page.locator('.image-edit').count()) === 1)
  const kept2 = await madeFile('사진.png')
  expect('원본도 그대로', kept2?.size.width === 300, JSON.stringify(kept2))
  // 다시 눌러 이번에는 덮습니다.
  await page.click('.image-edit button:has-text("저장")')
  await page.waitForSelector('.dialog', { timeout: 4000 })
  await page.click('.dialog button:has-text("덮어쓰기")')
  await page.waitForTimeout(1500)
  const over = await madeFile('사진.png')
  console.log('  ' + JSON.stringify(over))
  expect('덮어쓴 크기로 바뀜', over?.size.width === 60 && over.size.height === 40, JSON.stringify(over))
  expect('수정 화면이 닫히고 그 파일을 봄', (await page.locator('.image-edit').count()) === 0
    && (await page.textContent('.doc-head h1')) === '사진.png', await page.textContent('.doc-head h1'))
  // 화면에 그려진 그림도 새것이어야 합니다. 덮었는데 옛 그림이 남으면 고친 줄 모릅니다.
  const drawn = await page.evaluate(() => document.querySelector('.asset-image')?.naturalWidth ?? 0)
  expect('보이는 그림도 새것', drawn === 60, String(drawn))

  /*
   * 문서에서 보기 모드를 돌리는 글쇠와 같은 것입니다. 둘 다 "지금 보고 있는 것을 다르게
   * 보는" 일이라 하나로 둡니다.
   */
  step('8. ⌘⇧E 로도 수정 모드를 여닫는다')
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+Shift+KeyE`)
  await page.waitForSelector('.image-edit', { timeout: 4000 })
  expect('글쇠로 수정 모드가 열림', (await page.textContent('.doc-head .pill')) === '수정 모드',
    await page.textContent('.doc-head .pill'))
  await page.keyboard.press(`${mod}+Shift+KeyE`)
  await page.waitForTimeout(400)
  expect('다시 누르면 보기로 돌아감', (await page.locator('.image-edit').count()) === 0
    && (await page.locator('.asset-image').count()) === 1)

  step('9. 취소하면 아무것도 만들지 않는다')
  const before = (await names()).length
  await openEditor()
  await page.fill('#image-width', '40')
  await page.click('.image-edit button:has-text("취소")')
  await page.waitForTimeout(500)
  expect('수정 화면이 닫힘', (await page.locator('.image-edit').count()) === 0)
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
