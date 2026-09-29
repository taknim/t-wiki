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
  /*
   * 맞춤 배율이 눈금 가장자리에 걸리는 그림. 칸 너비 416(여백 뺀 값)에서 41.6% 가 되어
   * 내리면 41%, 굴림대(15px 남짓)가 서 있는 채로 재면 40% 가 됩니다. 굴림대를 빼고 재는지
   * 가리는 데 씁니다.
   */
  const edge = document.createElement('canvas')
  edge.width = 1000
  edge.height = 600
  edge.getContext('2d').fillStyle = 'rgb(120, 90, 160)'
  edge.getContext('2d').fillRect(0, 0, 1000, 600)
  /*
   * 방향을 눈으로 가릴 수 있는 그림. 200 × 100 에서 **왼쪽 위 네모만** 칠하고 나머지는
   * 비워 둡니다. 돌리거나 뒤집으면 칠한 자리가 어디로 갔는지로 가릴 수 있습니다.
   * 네 귀퉁이를 다 칠하면 어느 것이 어디로 갔는지 되짚기 어려워 한 곳만 칠합니다.
   */
  const facing = document.createElement('canvas')
  facing.width = 200
  facing.height = 100
  const mark = facing.getContext('2d')
  mark.fillStyle = 'rgb(220, 40, 40)'
  mark.fillRect(0, 0, 100, 50)
  window.__seedImage = () => Promise.all([
    new Promise((done) => canvas.toBlob((blob) => { put('사진.png', blob); done() }, 'image/png')),
    new Promise((done) => big.toBlob((blob) => { put('큰 그림.png', blob); done() }, 'image/png')),
    new Promise((done) => edge.toBlob((blob) => { put('가장자리.png', blob); done() }, 'image/png')),
    new Promise((done) => facing.toBlob((blob) => { put('방향.png', blob); done() }, 'image/png')),
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

/** 만들어진 그림의 한 점 색. 방향이 바뀌었는지는 칠한 자리가 어디로 갔는지로 가립니다. */
const pixelAt = (name, x, y) => page.evaluate(async (where) => {
  const blob = window.__mockRoot._children.get(where.name)._data
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  bitmap.close()
  const [r, g, b, a] = canvas.getContext('2d').getImageData(where.x, where.y, 1, 1).data
  return { r, g, b, a }
}, { name, x, y })
/** 칠해진 점인지(붉게 칠한 자리) / 빈 점인지. */
const painted = (dot) => dot.a > 200 && dot.r > 180 && dot.g < 90
const blank = (dot) => dot.a < 20

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
  expect('배율 손잡이는 그림 위에 있음', (await page.locator('.asset-view > .zoom-control').count()) === 1)
  // 굴러가는 칸 안에 두면 그림을 옮길 때 함께 밀려납니다.
  expect('굴러가는 칸 밖에 있음', (await page.locator('.asset-canvas .zoom-control').count()) === 0)
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
  expect('손잡이가 그림 위에 있음', (await page.locator('.asset-view > .zoom-control').count()) === 1)
  expect('제목 줄에는 없음', (await page.locator('.doc-head .zoom-control').count()) === 0)
  const fit = await zoomed()
  console.log('  맞춤: ' + JSON.stringify(fit))
  expect('맞춤은 줄여서 보여 줌', fit.잰 < 100 && fit.적힌 === `${fit.잰}%`, JSON.stringify(fit))
  expect('작으면 가운데에 놓임', fit.가운데 && !fit.왼쪽밖, JSON.stringify(fit))
  /*
   * 37% 처럼 어중간한 값에서 눌러도 바로 위 눈금으로 가야 합니다. 100% 부터 세었더니
   * 키우려고 눌렀는데 150% 로 건너뛰었습니다.
   */
  await page.click('.asset-view > .zoom-control button[aria-label="확대"]')
  await page.waitForTimeout(300)
  const up = await zoomed()
  console.log('  확대: ' + JSON.stringify(up))
  expect('지금 배율에서 한 걸음 위로', up.잰 > fit.잰 && up.잰 <= 75, JSON.stringify(up))
  await page.click('.asset-view > .zoom-control button[aria-label="축소"]')
  await page.waitForTimeout(300)
  const down = await zoomed()
  console.log('  축소: ' + JSON.stringify(down))
  expect('한 걸음 아래로', down.잰 < up.잰, JSON.stringify(down))
  // 배율을 정해 두었어도 칸보다 작으면 가운데에 있어야 합니다. 늘 왼쪽 위로 붙이면 허전합니다.
  expect('줄여 놓아도 가운데', down.가운데 && !down.왼쪽밖, JSON.stringify(down))
  // 원본 크기로. 칸보다 커지므로 왼쪽 위부터 보입니다.
  await page.click('.asset-view > .zoom-control button[aria-label="원본 크기"]')
  await page.waitForTimeout(300)
  const actual = await zoomed()
  console.log('  원본: ' + JSON.stringify(actual))
  expect('원본 크기는 100%', actual.잰 === 100 && actual.적힌 === '100%', JSON.stringify(actual))
  expect('칸보다 크면 왼쪽 위부터', !actual.왼쪽밖, JSON.stringify(actual))
  await page.click('.asset-view > .zoom-control button[aria-label="화면에 맞추기"]')
  await page.waitForTimeout(300)
  expect('다시 화면 맞춤', (await zoomed()).잰 === fit.잰, JSON.stringify(await zoomed()))

  step('2-1. 맨 글쇠로도 배율을 다룬다')
  await page.click('.asset-canvas')
  await page.keyboard.press('Digit1')
  await page.waitForTimeout(300)
  expect('1 은 원본 크기', (await zoomed()).잰 === 100, JSON.stringify(await zoomed()))
  await page.keyboard.press('Equal')
  await page.waitForTimeout(300)
  expect('= 는 확대', (await zoomed()).잰 === 125, JSON.stringify(await zoomed()))
  // ＋ 는 ⇧= 로 누릅니다. 어느 쪽으로 눌러도 같은 일이어야 합니다.
  await page.keyboard.press('Shift+Equal')
  await page.waitForTimeout(300)
  expect('＋(⇧=) 도 확대', (await zoomed()).잰 === 150, JSON.stringify(await zoomed()))
  await page.keyboard.press('Minus')
  await page.waitForTimeout(300)
  expect('− 는 축소', (await zoomed()).잰 === 125, JSON.stringify(await zoomed()))
  await page.keyboard.press('Digit0')
  await page.waitForTimeout(300)
  expect('0 은 화면 맞춤', (await zoomed()).잰 === fit.잰, JSON.stringify(await zoomed()))
  /*
   * 단계로는 닿지 않는 값(110% 같은)을 쓰려면 적어 넣습니다. 손잡이의 배율을 눌러도,
   * Z 를 눌러도 같은 창이 뜹니다.
   */
  await page.keyboard.press('KeyZ')
  await page.waitForSelector('.dialog-field input', { timeout: 4000 })
  expect('지금 배율이 미리 적혀 있음', (await page.inputValue('.dialog-field input')) === String(fit.잰),
    await page.inputValue('.dialog-field input'))
  /*
   * 단위는 칸 **뒤에** 섭니다. 위에 얹었더니 숫자와 떨어져 어디에 걸리는 말인지 흐렸습니다.
   * 칸 뒤에 있는지는 자리를 재서 가립니다.
   */
  const unit = await page.evaluate(() => {
    const box = document.querySelector('.dialog-field input').getBoundingClientRect()
    const mark = document.querySelector('.dialog-field-suffix')
    if (!mark) return null
    const at = mark.getBoundingClientRect()
    return { 글: mark.textContent, 뒤에: at.left >= box.right - 1, 같은줄: Math.abs(at.top - box.top) < 20 }
  })
  console.log('  단위: ' + JSON.stringify(unit))
  expect('% 가 칸 뒤 같은 줄에 섬', unit?.글 === '%' && unit.뒤에 && unit.같은줄, JSON.stringify(unit))
  await page.fill('.dialog-field input', '110')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  expect('적어 넣은 배율로 감', (await zoomed()).잰 === 110, JSON.stringify(await zoomed()))
  // 끝을 넘겨 적으면 가까운 끝으로 맞춥니다.
  await page.click('.asset-view .zoom-now')
  await page.waitForSelector('.dialog-field input', { timeout: 4000 })
  await page.fill('.dialog-field input', '900')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  expect('300% 를 넘지 않음', (await zoomed()).잰 === 300, JSON.stringify(await zoomed()))
  await page.click('.asset-view .zoom-now')
  await page.waitForSelector('.dialog-field input', { timeout: 4000 })
  await page.fill('.dialog-field input', '1')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  expect('10% 아래로는 안 감', (await zoomed()).잰 === 10, JSON.stringify(await zoomed()))
  // 물러서면 보던 그대로.
  await page.click('.asset-view .zoom-now')
  await page.waitForSelector('.dialog-field input', { timeout: 4000 })
  await page.fill('.dialog-field input', '200')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect('물러서면 그대로', (await zoomed()).잰 === 10, JSON.stringify(await zoomed()))
  await page.keyboard.press('Digit0')
  await page.waitForTimeout(300)
  // 글을 치는 자리에서는 가로채지 않습니다. 검색 칸에 0 을 친다고 그림이 줄면 안 됩니다.
  await page.click('.search-input')
  await page.keyboard.type('0')
  await page.waitForTimeout(300)
  expect('검색 칸에 친 글쇠는 배율을 건드리지 않음', (await zoomed()).잰 === fit.잰,
    JSON.stringify(await zoomed()))
  await page.fill('.search-input', '')
  await page.waitForTimeout(300)

  /*
   * 100% 로 열었더니 큰 그림은 한 귀퉁이만 보여 어디를 고르는지 알 수 없었고, 작은 그림은
   * 너른 칸 한가운데 조그맣게 놓여 픽셀을 집어내기 어려웠습니다.
   */
  /*
   * 크게 키워 놓으면 보기 모드에서도 굴림대를 잡아야 했습니다. 수정 화면과 같은 길로
   * 스페이스를 누른 채 끌어 옮깁니다.
   */
  step('2-1-2. 보기 모드에서도 스페이스를 누른 채 끌어 옮긴다')
  await page.click('.tree-row:has-text("큰 그림") .tree-name')
  await page.waitForSelector('.asset-image', { timeout: 8000 })
  await page.waitForTimeout(400)
  await page.click('.asset-view > .zoom-control button[aria-label="원본 크기"]')
  await page.waitForTimeout(300)
  const canvasAt = () => page.evaluate(() => {
    const box = document.querySelector('.asset-canvas')
    return {
      굴린자리: [Math.round(box.scrollLeft), Math.round(box.scrollTop)],
      굴릴것: [box.scrollWidth - box.clientWidth, box.scrollHeight - box.clientHeight],
      손모양: getComputedStyle(box).cursor,
    }
  })
  const seen = await canvasAt()
  console.log('  보기 모드: ' + JSON.stringify(seen))
  expect('원본 크기에서는 굴릴 것이 있음', seen.굴릴것[0] > 0, JSON.stringify(seen))
  const knobBefore = await page.evaluate(() => {
    const knob = document.querySelector('.zoom-control').getBoundingClientRect()
    return [Math.round(knob.left), Math.round(knob.top)]
  })
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  expect('누르면 손 모양', (await canvasAt()).손모양 === 'grab', JSON.stringify(await canvasAt()))
  const canvasBox = await page.locator('.asset-canvas').boundingBox()
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + canvasBox.width / 2 - 80, canvasBox.y + canvasBox.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await page.waitForTimeout(300)
  const panned = await canvasAt()
  console.log('  옮긴 뒤: ' + JSON.stringify(panned))
  /*
   * 손잡이는 굴러가는 칸 밖에 있어야 합니다. 안에 두었더니 그림을 옮길 때 함께 밀려 나가
   * 손잡이를 쫓아가야 했습니다.
   */
  const knobAfter = await page.evaluate(() => {
    const knob = document.querySelector('.zoom-control').getBoundingClientRect()
    const canvas = document.querySelector('.asset-canvas').getBoundingClientRect()
    return {
      자리: [Math.round(knob.left), Math.round(knob.top)],
      // 그림 칸의 오른쪽 아래에 붙어 있어야 합니다(본문 전체가 아니라).
      칸안: knob.right <= canvas.right + 2 && knob.bottom <= canvas.bottom + 2
        && knob.left >= canvas.left - 2,
    }
  })
  console.log('  손잡이: ' + JSON.stringify({ knobBefore, knobAfter }))
  expect('옮겨도 손잡이는 제자리', JSON.stringify(knobAfter.자리) === JSON.stringify(knobBefore),
    JSON.stringify({ knobBefore, knobAfter }))
  expect('손잡이가 그림 칸에 붙어 있음', knobAfter.칸안, JSON.stringify(knobAfter))
  // 손이 간 만큼(80px 남짓) 따라와야 합니다. 몇 픽셀만 움직였다면 옮긴 것이 아닙니다.
  expect('끌면 손이 간 만큼 옮겨짐', panned.굴린자리[0] >= 70, JSON.stringify({ seen, panned }))
  expect('떼면 손 모양이 걷힘', panned.손모양 !== 'grab', JSON.stringify(panned))
  // 화면 맞춤으로 돌려 놓습니다. 옮길 것이 없을 때는 스페이스를 가로채지 않습니다.
  await page.click('.asset-view > .zoom-control button[aria-label="화면에 맞추기"]')
  await page.waitForTimeout(300)

  step('2-2. 수정 화면은 칸에 꽉 차는 배율로 열린다')
  await page.click('.tree-row:has-text("큰 그림") .tree-name')
  await page.waitForSelector('.asset-image', { timeout: 8000 })
  await page.waitForTimeout(400)
  await openEditor()
  const opened = await page.evaluate(() => {
    const image = document.querySelector('.image-edit-frame img')
    const box = document.querySelector('.image-edit-stage')
    const drawn = image.getBoundingClientRect()
    return {
      적힌: document.querySelector('.image-edit .zoom-now').textContent,
      그림: [Math.round(drawn.width), Math.round(drawn.height)],
      칸: [box.clientWidth, box.clientHeight],
      넘침: box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1,
    }
  })
  console.log('  ' + JSON.stringify(opened))
  expect('100% 가 아니라 줄여서 엶', opened.적힌 !== '100%', JSON.stringify(opened))
  expect('칸 안에 다 들어옴', !opened.넘침, JSON.stringify(opened))
  /*
   * 한 쪽은 칸을 거의 채워야 "꽉 차게" 맞춘 것입니다. 여백(16px씩)을 빼고 재고,
   * 배율은 1% 눈금으로 내림하므로 그만큼의 헐거움은 봐 줍니다.
   */
  const room = [opened.칸[0] - 32, opened.칸[1] - 32]
  const fill = Math.max(opened.그림[0] / room[0], opened.그림[1] / room[1])
  console.log('  채운 몫: ' + Math.round(fill * 100) + '%')
  expect('한 쪽이 칸을 거의 채움', fill >= 0.9 && fill <= 1, String(fill))
  /*
   * 크게 키워 보다가 다시 한눈에 담고 싶을 때가 있습니다. 수정 화면에도 화면 맞춤을 둡니다.
   * 보기 모드와 달리 값으로 남습니다 — 잘라 낼 자리를 재려면 배율이 또렷한 값이어야 합니다.
   */
  await page.click('.image-edit .zoom-control button[aria-label="원본 크기"]')
  await page.waitForTimeout(300)
  const atFull = await page.evaluate(() => document.querySelector('.image-edit .zoom-now').textContent)
  await page.click('.image-edit .zoom-control button[aria-label="화면에 맞추기"]')
  await page.waitForTimeout(300)
  const refit = await page.evaluate(() => {
    const image = document.querySelector('.image-edit-frame img')
    const box = document.querySelector('.image-edit-stage')
    return {
      적힌: document.querySelector('.image-edit .zoom-now').textContent,
      넘침: box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1,
      채움: Math.max(image.getBoundingClientRect().width / (box.clientWidth - 32),
        image.getBoundingClientRect().height / (box.clientHeight - 32)),
    }
  })
  console.log('  ' + JSON.stringify({ atFull, refit }))
  expect('수정 화면에도 화면 맞춤이 있음', (await page.locator('.image-edit .zoom-control button[aria-label="화면에 맞추기"]').count()) === 1)
  expect('누르면 다시 칸에 꽉 참', !refit.넘침 && refit.채움 >= 0.9 && refit.적힌 !== atFull,
    JSON.stringify({ atFull, refit }))
  /*
   * 맞춤 배율로 보고 있으면 단추가 켜져 있어야 합니다(원본 크기 단추처럼).
   * 그리고 거듭 눌러도 같은 값이어야 합니다 — 칸을 굴림대 안쪽으로 재었더니 굴림대가
   * 섰다 없어졌다 하며 46% 와 47% 사이를 오갔습니다.
   */
  const fitOn = () => page.evaluate(() =>
    document.querySelector('.image-edit .zoom-control button[aria-label="화면에 맞추기"]')
      .getAttribute('aria-pressed'))
  expect('맞춤으로 보는 중이면 단추가 켜짐', (await fitOn()) === 'true', String(await fitOn()))
  const again = []
  for (let at = 0; at < 4; at += 1) {
    await page.click('.image-edit .zoom-control button[aria-label="화면에 맞추기"]')
    await page.waitForTimeout(250)
    again.push(await page.evaluate(() => document.querySelector('.image-edit .zoom-now').textContent))
  }
  console.log('  거듭 누른 배율: ' + JSON.stringify(again))
  expect('거듭 눌러도 같은 배율', new Set(again).size === 1 && again[0] === refit.적힌,
    JSON.stringify({ refit: refit.적힌, again }))
  // 배율을 바꾸면 다시 꺼집니다.
  await page.click('.image-edit .zoom-control button[aria-label="확대"]')
  await page.waitForTimeout(250)
  expect('다른 배율로 가면 꺼짐', (await fitOn()) === 'false', String(await fitOn()))

  await page.click('.image-edit button:has-text("취소")')
  await page.waitForTimeout(400)

  /*
   * 맞춤을 거듭 눌러도, 크게 키워 둔 뒤에 눌러도 같은 값이어야 합니다.
   *
   * 칸을 굴림대 안쪽(clientWidth)으로 재면 굴림대가 섰느냐에 따라 한 눈금씩 달라져
   * 46% 와 47% 를 오갑니다. 지금은 테두리까지(getBoundingClientRect) 재므로 굴림대와
   * 상관이 없습니다. 이 시험대의 맥은 굴림대를 글 위에 띄워(자리를 먹지 않아) 그 오작동이
   * 드러나지 않으므로, 여기서는 "거듭 눌러도 한 값" 만 지킵니다.
   */
  step('2-3. 맞춤은 거듭 눌러도 같은 배율이다')
  await page.click('.tree-row:has-text("가장자리") .tree-name')
  await page.waitForSelector('.asset-image', { timeout: 8000 })
  await page.waitForTimeout(400)
  await openEditor()
  const fitLabel = () => page.evaluate(() => document.querySelector('.image-edit .zoom-now').textContent)
  const opened2 = await fitLabel()
  // 먼저 크게 키워 굴림대를 세워 둡니다.
  await page.evaluate(() => { document.querySelector('.image-edit-stage').scrollTop = 0 })
  for (let at = 0; at < 8; at += 1) {
    await page.click('.image-edit .zoom-control button[aria-label="확대"]')
    await page.waitForTimeout(120)
  }
  const rolls = await page.evaluate(() => {
    const box = document.querySelector('.image-edit-stage')
    return box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1
  })
  expect('키워 두면 굴림대가 섬', rolls, String(rolls))
  const pressed = []
  for (let at = 0; at < 3; at += 1) {
    await page.click('.image-edit .zoom-control button[aria-label="화면에 맞추기"]')
    await page.waitForTimeout(250)
    pressed.push(await fitLabel())
  }
  console.log('  열 때 ' + opened2 + ' · 거듭 누름 ' + JSON.stringify(pressed))
  expect('거듭 눌러도 한 값', new Set(pressed).size === 1, JSON.stringify(pressed))
  expect('열 때 잡은 값과도 같음', pressed[0] === opened2, `${opened2} vs ${pressed[0]}`)
  await page.click('.image-edit button:has-text("취소")')
  await page.waitForTimeout(400)

  /*
   * 볼 때 쓰던 글쇠가 고칠 때 듣지 않으면 손이 멈칫합니다. 같은 그림을 같은 자리에서
   * 보고 있는데 글쇠만 달라질 까닭이 없습니다.
   */
  step('2-4. 고치는 중에도 글쇠로 배율을 다루고 저장·취소한다')
  await openEditor()
  const shown = () => page.evaluate(() => document.querySelector('.image-edit .zoom-now').textContent)
  const openedAt = await shown()
  await page.click('.image-edit-stage')
  await page.keyboard.press('Digit1')
  await page.waitForTimeout(250)
  expect('1 은 원본 크기', (await shown()) === '100%', String(await shown()))
  await page.keyboard.press('Equal')
  await page.waitForTimeout(250)
  expect('= 는 확대', (await shown()) === '125%', String(await shown()))
  await page.keyboard.press('Minus')
  await page.waitForTimeout(250)
  expect('− 는 축소', (await shown()) === '100%', String(await shown()))
  await page.keyboard.press('Digit0')
  await page.waitForTimeout(250)
  expect('0 은 화면 맞춤', (await shown()) === openedAt, `${openedAt} vs ${await shown()}`)
  await page.keyboard.press('KeyZ')
  await page.waitForSelector('.dialog-field input', { timeout: 4000 })
  await page.fill('.dialog-field input', '150')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  expect('Z 로 적어 넣기', (await shown()) === '150%', String(await shown()))
  // 글을 치는 자리에서는 가로채지 않습니다. 너비 칸에 0 을 친다고 배율이 바뀌면 안 됩니다.
  await page.click('#image-width')
  await page.keyboard.press('Digit0')
  await page.waitForTimeout(250)
  expect('칸에 친 글쇠는 배율을 건드리지 않음', (await shown()) === '150%', String(await shown()))
  // Esc 로 그만둡니다. 아무것도 만들지 않습니다.
  const madeBefore = (await names()).length
  await page.click('.image-edit-stage')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect('Esc 로 그만둠', (await page.locator('.image-edit').count()) === 0)
  expect('만들어진 것이 없음', (await names()).length === madeBefore, JSON.stringify(await names()))
  // ⌘S 로 저장합니다.
  await openEditor()
  await page.fill('.image-edit input[aria-label="파일 이름"]', '사진_글쇠.png')
  await page.click('.image-edit-stage')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyS' : 'Control+KeyS')
  await page.waitForTimeout(1500)
  expect('⌘S 로 저장됨', (await names()).includes('사진_글쇠.png'), JSON.stringify(await names()))
  expect('저장하면 수정 화면이 닫힘', (await page.locator('.image-edit').count()) === 0)

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
  const smaller = await madeFile('사진_modified.png')
  console.log('  ' + JSON.stringify(smaller))
  expect('절반 크기 PNG 가 나옴', smaller?.kind === 'png' && smaller.size.width === 150 && smaller.size.height === 100,
    JSON.stringify(smaller))
  // 원본은 그대로 둡니다. 고친 것은 되돌릴 수 없습니다.
  const kept = await madeFile('사진.png')
  expect('원본은 그대로', kept?.size.width === 300 && kept.size.height === 200, JSON.stringify(kept))
  expect('만든 것을 곧바로 엶', (await page.textContent('.doc-head h1')) === '사진_modified.png',
    await page.textContent('.doc-head h1'))

  /*
   * 크게 키워 놓으면 그림이 칸보다 커집니다. 폭을 칸에 묶어 두었더니 거기서 더 키워지지
   * 않아 크게 보며 고를 수가 없었고, 보이는 데까지만 고를 수 있었습니다.
   */
  step('4-1. 칸보다 크게 키워 가로로 굴려 가며 고른다')
  // 칸보다 큰 그림으로 봅니다. 작은 그림은 아무리 키워도 칸을 넘지 못합니다.
  await page.click('.tree-row:has-text("큰 그림") .tree-name')
  await page.waitForSelector('.asset-image', { timeout: 8000 })
  await page.waitForTimeout(400)
  await openEditor()
  const stageSize = () => page.evaluate(() => {
    const image = document.querySelector('.image-edit-frame img')
    const box = document.querySelector('.image-edit-stage')
    return {
      그림폭: Math.round(image.getBoundingClientRect().width),
      칸폭: box.clientWidth,
      굴릴것: box.scrollWidth - box.clientWidth,
      굴린자리: Math.round(box.scrollLeft),
    }
  })
  const small = await stageSize()
  for (let at = 0; at < 3; at += 1) {
    await page.click('.image-edit .zoom-control button[aria-label="확대"]')
    await page.waitForTimeout(200)
  }
  const grown = await stageSize()
  console.log('  ' + JSON.stringify({ small, grown }))
  expect('칸 너비를 넘겨 커짐', grown.그림폭 > small.그림폭 && grown.그림폭 > grown.칸폭,
    JSON.stringify(grown))
  expect('넘친 만큼 가로로 굴러감', grown.굴릴것 > 0, JSON.stringify(grown))
  /*
   * 잡은 손으로는 굴림대를 만질 수 없고 놓으면 거기서 끝납니다. 칸 가장자리까지 끌고
   * 가면 저절로 굴러가며 이어서 고를 수 있어야 합니다.
   */
  const stageBox = await page.locator('.image-edit-stage').boundingBox()
  await page.mouse.move(stageBox.x + 30, stageBox.y + 30)
  await page.mouse.down()
  await page.mouse.move(stageBox.x + stageBox.width - 8, stageBox.y + stageBox.height / 2, { steps: 10 })
  await page.waitForTimeout(800)
  const rolled = await stageSize()
  console.log('  끌고 있는 중: ' + JSON.stringify(rolled))
  expect('가장자리에서 저절로 굴러감', rolled.굴린자리 > 0, JSON.stringify(rolled))
  await page.mouse.up()
  await page.waitForTimeout(300)
  const wide = Number(await page.inputValue('#image-width'))
  console.log('  고른 너비: ' + wide)
  // 보이는 칸(200% 에서 224 픽셀 남짓)보다 넓게 골렸어야 굴려 가며 고른 것입니다.
  // 보이는 칸은 그림의 몇 분의 일입니다. 그보다 넓게 골랐다면 굴려 가며 고른 것입니다.
  const visible = Math.round(rolled.칸폭 * (2000 / rolled.그림폭))
  expect('보이던 자리보다 넓게 고름', wide > visible, `${wide} > ${visible}`)
  await page.click('.image-edit button:has-text("취소")')
  await page.waitForTimeout(400)

  /*
   * 한 번에 딱 맞게 끄는 일은 드뭅니다. 조금 넓거나 좁게 고른 것을 다시 그리지 않고
   * 변과 꼭지점을 잡아 고칠 수 있어야 합니다.
   */
  step('4-2. 고른 자리를 변과 꼭지점으로 늘인다')
  await page.click('.tree-row:has-text("사진.png") .tree-name')
  await page.waitForSelector('.asset-image', { timeout: 8000 })
  await page.waitForTimeout(400)
  await openEditor()
  // 화면 픽셀과 그림 픽셀을 1:1 로 맞춰 놓고 잽니다.
  await page.click('.image-edit .zoom-control button[aria-label="원본 크기"]')
  await page.waitForTimeout(300)
  const picked = await page.locator('.image-edit-frame img').boundingBox()
  await page.mouse.move(picked.x + 60, picked.y + 40)
  await page.mouse.down()
  await page.mouse.move(picked.x + 160, picked.y + 120, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const box = () => page.evaluate(() => ({
    width: Number(document.querySelector('#image-width').value),
    height: Number(document.querySelector('#image-height').value),
  }))
  const first = await box()
  console.log('  처음 고른 것: ' + JSON.stringify(first))
  expect('손잡이가 여덟 개', (await page.locator('.crop-grip').count()) === 8)
  expect('고른 자리를 지우는 단추가 섬', (await page.locator('.image-edit button:has-text("선택 영역 해제")').count()) === 1)

  /*
   * 오른쪽 단추는 브라우저에 넘깁니다. pointerdown 은 어느 단추든 똑같이 오므로, 가리지
   * 않았더니 메뉴를 부르려던 손이 고른 자리를 통째로 지워 버렸습니다.
   * (진짜 오른쪽 누르기는 시험을 멈추는 메뉴를 띄우므로 사건만 지어 보냅니다.)
   */
  const rightDrag = await page.evaluate(() => {
    const frame = document.querySelector('.image-edit-frame')
    const view = frame.getBoundingClientRect()
    const send = (type, x, y) => frame.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 9, isPrimary: true, button: 2, buttons: 2,
      clientX: view.left + x, clientY: view.top + y,
    }))
    send('pointerdown', 10, 10)
    send('pointermove', 60, 50)
    send('pointerup', 60, 50)
    return {
      width: Number(document.querySelector('#image-width').value),
      height: Number(document.querySelector('#image-height').value),
    }
  })
  console.log('  오른쪽 단추로 끈 뒤: ' + JSON.stringify(rightDrag))
  expect('오른쪽 단추로는 고르지 않음', rightDrag.width === first.width && rightDrag.height === first.height,
    JSON.stringify(rightDrag))

  /** 손잡이를 잡아 그만큼 끕니다. */
  const pull = async (grip, dx, dy) => {
    const at = await page.locator(`.crop-grip-${grip}`).boundingBox()
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
    await page.mouse.down()
    await page.mouse.move(at.x + at.width / 2 + dx, at.y + at.height / 2 + dy, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    return box()
  }

  const wider = await pull('e', 50, 0)
  console.log('  오른쪽 변: ' + JSON.stringify(wider))
  expect('변을 잡으면 그 축만 바뀜', wider.width > first.width && wider.height === first.height,
    JSON.stringify(wider))
  const taller = await pull('s', 0, 40)
  console.log('  아래 변: ' + JSON.stringify(taller))
  expect('아래 변은 높이만', taller.height > wider.height && taller.width === wider.width,
    JSON.stringify(taller))
  const bigger = await pull('nw', -30, -20)
  console.log('  왼쪽 위 꼭지점: ' + JSON.stringify(bigger))
  expect('꼭지점은 두 축이 함께', bigger.width > taller.width && bigger.height > taller.height,
    JSON.stringify(bigger))
  // 줄이는 쪽으로도 움직입니다.
  const narrowed = await pull('w', 40, 0)
  console.log('  왼쪽 변 안으로: ' + JSON.stringify(narrowed))
  expect('안으로 밀면 줄어듦', narrowed.width < bigger.width && narrowed.height === bigger.height,
    JSON.stringify(narrowed))
  /*
   * 크기는 맞는데 자리만 조금 어긋나는 일이 잦습니다. 안쪽을 잡으면 크기를 그대로 두고
   * 자리만 옮기고, 바깥을 그냥 누르면 고르기를 그만둡니다.
   */
  const spot = () => page.evaluate(() => {
    const mark = document.querySelector('.image-edit-crop')
    const frame = document.querySelector('.image-edit-frame').getBoundingClientRect()
    if (!mark) return null
    const at = mark.getBoundingClientRect()
    return { left: Math.round(at.left - frame.left), top: Math.round(at.top - frame.top),
      width: Math.round(at.width), height: Math.round(at.height) }
  })
  // 앞 걸음에서 키우고 옮겨 두었으므로 1:1 · 처음 자리로 돌려놓고 잽니다.
  await page.click('.image-edit .zoom-control button[aria-label="원본 크기"]')
  await page.evaluate(() => {
    const box = document.querySelector('.image-edit-stage')
    box.scrollLeft = 0
    box.scrollTop = 0
  })
  await page.waitForTimeout(300)
  const frameBox = await page.locator('.image-edit-frame img').boundingBox()
  const wasAt = await spot()
  await page.mouse.move(frameBox.x + wasAt.left + wasAt.width / 2, frameBox.y + wasAt.top + wasAt.height / 2)
  await page.waitForTimeout(200)
  const cursorInside = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.image-edit-frame')).cursor)
  expect('안쪽에서는 옮기는 손 모양', cursorInside === 'move', cursorInside)
  await page.mouse.down()
  await page.mouse.move(frameBox.x + wasAt.left + wasAt.width / 2 + 40,
    frameBox.y + wasAt.top + wasAt.height / 2 + 30, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const nowAt = await spot()
  console.log('  옮기기: ' + JSON.stringify({ wasAt, nowAt }))
  expect('안쪽을 끌면 자리가 옮겨짐', nowAt.left > wasAt.left && nowAt.top > wasAt.top,
    JSON.stringify({ wasAt, nowAt }))
  expect('크기는 그대로', nowAt.width === wasAt.width && nowAt.height === wasAt.height,
    JSON.stringify({ wasAt, nowAt }))
  // 바깥을 그냥 누르면 고른 자리가 풀립니다(끌면 새로 고르는 것이라 그대로 둡니다).
  await page.mouse.move(frameBox.x + 8, frameBox.y + frameBox.height - 8)
  await page.waitForTimeout(150)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(300)
  expect('바깥을 누르면 풀림', (await spot()) === null, JSON.stringify(await spot()))
  // 다시 하나 골라 두고 아래 걸음으로 넘어갑니다.
  await page.mouse.move(frameBox.x + 60, frameBox.y + 40)
  await page.mouse.down()
  await page.mouse.move(frameBox.x + 160, frameBox.y + 120, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  // 지우면 고른 자리가 없어지고 그림 전체 크기로 돌아옵니다.
  /*
   * 크게 키워 놓으면 굴림대를 잡아 옮겨야 하는데, 그림 위에서는 끌기가 곧 고르기라
   * 굴림대까지 손을 옮겨야 했습니다. 스페이스를 누르고 있는 동안에는 끌어 옮깁니다.
   */
  const stageAt = () => page.evaluate(() => {
    const box = document.querySelector('.image-edit-stage')
    return {
      굴린자리: [Math.round(box.scrollLeft), Math.round(box.scrollTop)],
      손모양: getComputedStyle(document.querySelector('.image-edit-frame')).cursor,
    }
  })
  // 칸을 넘칠 만큼 키워 둡니다. 다 들어오는 그림은 옮길 것이 없습니다.
  for (let at = 0; at < 6; at += 1) {
    await page.click('.image-edit .zoom-control button[aria-label="확대"]')
    await page.waitForTimeout(150)
  }
  const beforePan = await page.evaluate(() => {
    const box = document.querySelector('.image-edit-stage')
    return {
      굴린자리: [Math.round(box.scrollLeft), Math.round(box.scrollTop)],
      굴릴것: [box.scrollWidth - box.clientWidth, box.scrollHeight - box.clientHeight],
      손모양: getComputedStyle(document.querySelector('.image-edit-frame')).cursor,
    }
  })
  console.log('  옮기기 전: ' + JSON.stringify(beforePan))
  const held = await box()
  /*
   * 브라우저는 스페이스를 "한 화면 내리기" 로 씁니다. 수정 화면이 열려 있는 동안에는
   * 그 일이 일어나지 않아야 합니다 — 고르던 자리가 화면 밖으로 밀려납니다.
   * 손이 그림 위에 있든 없든 가로채는지 보려고, 일부러 손잡이 칸에 손을 둔 채 누릅니다.
   */
  const panel = await page.locator('.image-edit-panel').boundingBox()
  await page.mouse.move(panel.x + panel.width / 2, panel.y + 40)
  await page.waitForTimeout(150)
  // 스페이스가 한 화면을 내리는 칸은 손이 놓인 자리에 따라 다릅니다. 굴러갈 만한 곳을 모두 봅니다.
  const scrolls = () => page.evaluate(() => ['.image-edit-stage', '.image-edit-panel', '.main']
    .map((one) => Math.round(document.querySelector(one)?.scrollTop ?? 0)))
  const rolledBefore = await scrolls()
  /*
   * 브라우저가 한 화면을 내리기 전에 막았는지는 사건에 적혀 옵니다.
   * 굴린 자리만 견주면 마침 굴릴 것이 없을 때 막지 않고도 통과합니다.
   */
  await page.evaluate(() => {
    window.__spaceStopped = null
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') window.__spaceStopped = event.defaultPrevented
    })
  })
  await page.keyboard.down('Space')
  await page.waitForTimeout(250)
  const stillThere = await scrolls()
  expect('스페이스의 기본 동작(한 화면 내리기)을 막음',
    (await page.evaluate(() => window.__spaceStopped)) === true,
    String(await page.evaluate(() => window.__spaceStopped)))
  expect('화면이 내려가지 않음', JSON.stringify(stillThere) === JSON.stringify(rolledBefore),
    JSON.stringify({ rolledBefore, stillThere }))
  await page.keyboard.up('Space')
  await page.waitForTimeout(150)
  const overImage = await page.locator('.image-edit-stage').boundingBox()
  await page.mouse.move(overImage.x + overImage.width / 2, overImage.y + overImage.height / 2)
  await page.waitForTimeout(150)
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  const holding = await stageAt()
  console.log('  스페이스: ' + JSON.stringify(holding))
  expect('누르면 손 모양으로 바뀜', holding.손모양 === 'grab', JSON.stringify(holding))
  const stageBox2 = await page.locator('.image-edit-stage').boundingBox()
  await page.mouse.move(stageBox2.x + stageBox2.width / 2, stageBox2.y + stageBox2.height / 2)
  await page.mouse.down()
  await page.mouse.move(stageBox2.x + stageBox2.width / 2 - 90, stageBox2.y + stageBox2.height / 2 - 60, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await page.waitForTimeout(300)
  const moved = await stageAt()
  console.log('  옮긴 뒤: ' + JSON.stringify(moved))
  // 세로로는 다 들어와 굴릴 것이 없을 수 있습니다. 굴릴 것이 있는 축만 봅니다.
  expect('끌면 그림이 옮겨짐', moved.굴린자리[0] > beforePan.굴린자리[0],
    JSON.stringify({ beforePan, moved }))
  // 고른 칸 안이면 옮기는 손 모양일 수 있습니다. 옮기는 자리가 아니게 된 것만 봅니다.
  expect('떼면 옮기는 손 모양이 걷힘', moved.손모양 !== 'grab' && moved.손모양 !== 'grabbing',
    JSON.stringify(moved))
  // 옮기는 동안 고른 자리는 건드리지 않습니다.
  expect('고른 자리는 그대로', JSON.stringify(await box()) === JSON.stringify(held),
    JSON.stringify([held, await box()]))

  await page.click('.image-edit button:has-text("선택 영역 해제")')
  await page.waitForTimeout(300)
  const cleared = await box()
  console.log('  해제한 뒤: ' + JSON.stringify(cleared))
  expect('덮개가 걷힘', (await page.locator('.image-edit-crop').count()) === 0)
  expect('그림 전체 크기로 돌아감', cleared.width === 300 && cleared.height === 200, JSON.stringify(cleared))
  await page.click('.image-edit button:has-text("취소")')
  await page.waitForTimeout(400)

  /*
   * 폰으로 찍은 그림이 옆으로 누워 있거나 거울에 비친 듯 뒤집혀 있는 일이 흔합니다.
   * 돌리기·뒤집기는 **보이는 대로** 셈해야 합니다 — 화면에서 오른쪽으로 돌린 것이 파일에서
   * 왼쪽으로 돌아가 있으면 두 번 고쳐야 합니다.
   */
  step('4-3. 돌리고 뒤집으면 내놓는 그림도 그 방향으로 나온다')
  await page.click('.tree-row:has-text("방향.png") .tree-name')
  await page.waitForSelector('.asset-image', { timeout: 8000 })
  await page.waitForTimeout(400)
  await openEditor()
  const facing = () => page.evaluate(() => {
    const canvas = document.querySelector('.image-edit-canvas')
    const box = canvas.getBoundingClientRect()
    return {
      width: document.querySelector('#image-width').value,
      height: document.querySelector('#image-height').value,
      적힌방향: document.querySelector('.image-edit .turn-now').textContent.trim(),
      변환: document.querySelector('.image-edit-frame img').style.transform,
      칸: [Math.round(box.width), Math.round(box.height)],
      덮개: document.querySelector('.image-edit-crop') !== null,
    }
  })
  const upright = await facing()
  console.log('  열 때: ' + JSON.stringify(upright))
  expect('처음에는 손대지 않은 방향', upright.적힌방향 === '그대로', upright.적힌방향)

  /*
   * 단추는 한데 모으고, 눌러서 바뀐 것은 그 **아래 줄**에 적습니다. 단추 옆에 붙여 두었더니
   * 마지막 단추의 이름처럼 읽혔습니다.
   */
  const laidOut = await page.evaluate(() => {
    const group = document.querySelector('.image-edit .turn-group')
    const now = document.querySelector('.image-edit .turn-now')
    return {
      같은줄: now.closest('.row') !== null,
      // DOCUMENT_POSITION_FOLLOWING(4): 단추보다 뒤(아래)에 있음
      아래: (group.compareDocumentPosition(now) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    }
  })
  console.log('  배치: ' + JSON.stringify(laidOut))
  expect('바뀐 내용은 단추와 같은 줄에 있지 않음', laidOut.같은줄 === false, JSON.stringify(laidOut))
  expect('바뀐 내용은 단추 아래에 적힘', laidOut.아래, JSON.stringify(laidOut))

  /*
   * 돌리기 아이콘의 화살 **머리는 획의 끝**에 붙고, 몸통은 지나온 쪽으로 뻗어야 합니다.
   * 머리를 획의 시작에 붙였더니(12시에서 오른쪽을 가리키는데 획은 3시·6시·9시로 뻗음)
   * 눈에는 반시계로 읽혀, 왼쪽·오른쪽 단추가 서로 바뀐 것처럼 보였습니다.
   */
  const arrowOf = (label) => page.evaluate((which) => {
    const [arc, head] = document.querySelectorAll(`.turn-group button[aria-label="${which}"] svg path`)
    const end = arc.getPointAtLength(arc.getTotalLength())
    // 몸통의 한가운데. 270도 획이라 머리(12시)에서 가장 먼 자리입니다.
    const belly = arc.getPointAtLength(arc.getTotalLength() / 2)
    // 화살촉은 꺾쇠 둘이라 길이의 한가운데가 곧 뾰족한 끝입니다.
    const tip = head.getPointAtLength(head.getTotalLength() / 2)
    const round = (dot) => [Math.round(dot.x * 10) / 10, Math.round(dot.y * 10) / 10]
    return { 획끝: round(end), 몸통: round(belly), 머리: round(tip) }
  }, label)
  for (const [label, side] of [['오른쪽으로 90도 돌리기', -1], ['왼쪽으로 90도 돌리기', 1]]) {
    const drawn = await arrowOf(label)
    console.log('  ' + label + ': ' + JSON.stringify(drawn))
    const gap = Math.hypot(drawn.획끝[0] - drawn.머리[0], drawn.획끝[1] - drawn.머리[1])
    expect(label + ' — 머리가 획의 끝에 붙음', gap < 1, String(Math.round(gap * 10) / 10))
    // 오른쪽으로 돌리는 획은 왼쪽 아래를 지나 올라오고, 왼쪽으로 돌리는 획은 오른쪽 아래를 지납니다.
    expect(label + ' — 몸통이 지나온 쪽에 있음',
      (side < 0 ? drawn.몸통[0] < 8 : drawn.몸통[0] > 8) && drawn.몸통[1] > 8, JSON.stringify(drawn.몸통))
  }
  expect('내놓을 크기는 본디 크기', `${upright.width}x${upright.height}` === '200x100',
    JSON.stringify(upright))
  expect('되돌리기 단추는 아직 없음',
    (await page.locator('.image-edit button:has-text("되돌리기")').count()) === 0)

  // 먼저 한 자리를 골라 둡니다. 돌리면 그 자리는 뜻을 잃으므로 함께 풀려야 합니다.
  const facingBox = await page.locator('.image-edit-frame img').boundingBox()
  await page.mouse.move(facingBox.x + 10, facingBox.y + 10)
  await page.mouse.down()
  await page.mouse.move(facingBox.x + facingBox.width * 0.5, facingBox.y + facingBox.height * 0.5, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  expect('고른 자리가 생김', (await facing()).덮개)

  await page.click('.image-edit button[aria-label="오른쪽으로 90도 돌리기"]')
  await page.waitForTimeout(400)
  const turned = await facing()
  console.log('  오른쪽으로 한 번: ' + JSON.stringify(turned))
  expect('적힌 방향이 바뀜', turned.적힌방향 === '오른쪽으로 90°', turned.적힌방향)
  expect('가로와 세로가 바뀜', `${turned.width}x${turned.height}` === '100x200', JSON.stringify(turned))
  expect('그림도 돌아감', turned.변환.includes('rotate(90deg)'), turned.변환)
  // 칸이 함께 서지 않으면 돌린 그림이 옆으로 삐져나가 잘립니다.
  expect('칸도 세로로 섬', turned.칸[1] > turned.칸[0], JSON.stringify(turned.칸))
  expect('고른 자리는 풀림', turned.덮개 === false, JSON.stringify(turned))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imageedit', '03-turn.png') })
  await page.fill('.image-edit input[aria-label="파일 이름"]', '돌린 것.png')
  await saveEdit()
  const spun = await madeFile('돌린 것.png')
  console.log('  ' + JSON.stringify(spun))
  expect('세로로 선 그림이 나옴', spun?.size.width === 100 && spun.size.height === 200, JSON.stringify(spun))
  /*
   * 왼쪽 위에 있던 자리는 오른쪽으로 돌리면 오른쪽 위로 갑니다. 왼쪽 위가 그대로 남아
   * 있으면 크기만 바꾸고 그림은 그대로 그린 것입니다(크기만 보면 놓칩니다).
   */
  const rightTop = await pixelAt('돌린 것.png', 75, 50)
  const leftTop = await pixelAt('돌린 것.png', 25, 50)
  console.log('  오른쪽 위 ' + JSON.stringify(rightTop) + ' · 왼쪽 위 ' + JSON.stringify(leftTop))
  expect('칠한 자리가 오른쪽 위로 감', painted(rightTop), JSON.stringify(rightTop))
  expect('왼쪽 위는 비어 있음', blank(leftTop), JSON.stringify(leftTop))

  // 좌우 뒤집기. 크기는 그대로고 칠한 자리만 오른쪽으로 갑니다.
  await page.click('.tree-row:has-text("방향.png") .tree-name')
  await page.waitForTimeout(400)
  await openEditor()
  await page.click('.image-edit button[aria-label="좌우 뒤집기"]')
  await page.waitForTimeout(300)
  const flipped = await facing()
  console.log('  좌우 뒤집음: ' + JSON.stringify(flipped))
  expect('적힌 방향이 바뀜', flipped.적힌방향 === '좌우 뒤집음', flipped.적힌방향)
  expect('크기는 그대로', `${flipped.width}x${flipped.height}` === '200x100', JSON.stringify(flipped))
  expect('단추가 켜짐', (await page.getAttribute('.image-edit button[aria-label="좌우 뒤집기"]', 'aria-pressed')) === 'true')
  await page.fill('.image-edit input[aria-label="파일 이름"]', '좌우.png')
  await saveEdit()
  const mirrored = await madeFile('좌우.png')
  expect('크기는 그대로 나옴', mirrored?.size.width === 200 && mirrored.size.height === 100,
    JSON.stringify(mirrored))
  expect('칠한 자리가 오른쪽으로 감', painted(await pixelAt('좌우.png', 150, 25)),
    JSON.stringify(await pixelAt('좌우.png', 150, 25)))
  expect('왼쪽은 비워짐', blank(await pixelAt('좌우.png', 50, 25)),
    JSON.stringify(await pixelAt('좌우.png', 50, 25)))

  // 상하 뒤집기. 칠한 자리가 아래로 내려갑니다.
  await page.click('.tree-row:has-text("방향.png") .tree-name')
  await page.waitForTimeout(400)
  await openEditor()
  await page.click('.image-edit button[aria-label="상하 뒤집기"]')
  await page.waitForTimeout(300)
  expect('적힌 방향이 바뀜', (await facing()).적힌방향 === '상하 뒤집음', (await facing()).적힌방향)
  await page.fill('.image-edit input[aria-label="파일 이름"]', '상하.png')
  await saveEdit()
  expect('칠한 자리가 아래로 감', painted(await pixelAt('상하.png', 25, 75)),
    JSON.stringify(await pixelAt('상하.png', 25, 75)))
  expect('위쪽은 비워짐', blank(await pixelAt('상하.png', 25, 25)),
    JSON.stringify(await pixelAt('상하.png', 25, 25)))

  /*
   * 두 번 돌리면 180도, 되돌리기 한 번으로 모두 풀립니다. 돌리기를 거꾸로 세어 가며
   * 풀게 하면 몇 번 눌렀는지 세어야 합니다.
   */
  await page.click('.tree-row:has-text("방향.png") .tree-name')
  await page.waitForTimeout(400)
  await openEditor()
  await page.click('.image-edit button[aria-label="오른쪽으로 90도 돌리기"]')
  await page.waitForTimeout(200)
  await page.click('.image-edit button[aria-label="오른쪽으로 90도 돌리기"]')
  await page.waitForTimeout(200)
  await page.click('.image-edit button[aria-label="좌우 뒤집기"]')
  await page.waitForTimeout(300)
  const twice = await facing()
  console.log('  두 번 돌리고 뒤집음: ' + JSON.stringify(twice))
  expect('두 번 돌리면 180도', twice.적힌방향 === '오른쪽으로 180° · 좌우 뒤집음', twice.적힌방향)
  expect('180도면 가로세로는 그대로', `${twice.width}x${twice.height}` === '200x100', JSON.stringify(twice))
  await page.click('.image-edit button:has-text("되돌리기")')
  await page.waitForTimeout(300)
  const undone = await facing()
  console.log('  되돌린 뒤: ' + JSON.stringify(undone))
  expect('한 번에 다 풀림', undone.적힌방향 === '그대로', undone.적힌방향)
  expect('크기도 돌아옴', `${undone.width}x${undone.height}` === '200x100', JSON.stringify(undone))
  expect('변환도 걷힘', !undone.변환.includes('rotate(90deg)') && !undone.변환.includes('-1'), undone.변환)
  await page.click('.image-edit button:has-text("취소")')
  await page.waitForTimeout(400)

  /*
   * 인화지나 화면에 맞춰 넣을 그림은 비가 정해져 있습니다. 눈으로 맞춰 끌면 늘 한두 픽셀이
   * 어긋나고, 어긋난 것은 넣어 보기 전에는 보이지 않습니다.
   */
  step('4-4. 비율을 씌우면 그 비로만 골라진다')
  await page.click('.tree-row:has-text("사진.png") >> nth=0')
  await page.waitForTimeout(400)
  await openEditor()
  await page.click('.image-edit .zoom-control button[aria-label="원본 크기"]')
  await page.waitForTimeout(300)
  const sides = () => page.evaluate(() => ({
    width: Number(document.querySelector('#image-width').value),
    height: Number(document.querySelector('#image-height').value),
  }))
  const dragBox = async (dx, dy) => {
    const at = await page.locator('.image-edit-frame img').boundingBox()
    await page.mouse.move(at.x + 20, at.y + 20)
    await page.mouse.down()
    await page.mouse.move(at.x + 20 + dx, at.y + 20 + dy, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(250)
  }
  const holds = (got, ratio) => Math.abs(got.width - got.height * ratio) <= 2

  await page.click('.ratio-group button:has-text("16:9")')
  await page.waitForTimeout(200)
  // 세로로 짧게 끌어도 가로에 맞춰 16:9 가 됩니다(손끝을 덮는 쪽).
  await dragBox(160, 20)
  const laidWide = await sides()
  console.log('  16:9 로 끌기: ' + JSON.stringify(laidWide))
  expect('끈 자리가 16:9 로 잡힘', holds(laidWide, 16 / 9), JSON.stringify(laidWide))

  // 긴 쪽을 세로로 바꾸면 딱지의 글도 나올 그대로(9:16) 바뀌고, 이미 고른 자리도 다시 잡힙니다.
  await page.click('.image-edit .segmented button:has-text("세로")')
  await page.waitForTimeout(300)
  const stood = await sides()
  const label = await page.textContent('.ratio-group .is-active')
  console.log('  세우면: ' + JSON.stringify(stood) + ' · 딱지 ' + label)
  expect('딱지도 나올 그대로 바뀜', label.trim() === '9:16', label)
  expect('고른 자리가 9:16 으로 다시 잡힘', holds(stood, 9 / 16), JSON.stringify(stood))
  expect('세로가 더 김', stood.height > stood.width, JSON.stringify(stood))

  // 자유로 돌리면 끈 대로 골라집니다.
  await page.click('.ratio-group button:has-text("자유")')
  await page.waitForTimeout(200)
  await dragBox(120, 30)
  const free = await sides()
  console.log('  자유: ' + JSON.stringify(free))
  expect('자유는 끈 대로', Math.abs(free.width - 120) <= 3 && Math.abs(free.height - 30) <= 3,
    JSON.stringify(free))

  // 씌운 비율은 내놓는 파일까지 이어집니다. 화면에서만 맞고 파일이 어긋나면 헛일입니다.
  await page.click('.image-edit .segmented button:has-text("가로")')
  await page.waitForTimeout(200)
  await page.click('.ratio-group button:has-text("1:1")')
  await page.waitForTimeout(200)
  await dragBox(140, 60)
  const square = await sides()
  console.log('  1:1: ' + JSON.stringify(square))
  expect('1:1 은 네모반듯', Math.abs(square.width - square.height) <= 1, JSON.stringify(square))
  await page.fill('.image-edit input[aria-label="파일 이름"]', '네모.png')
  await saveEdit()
  const evened = await madeFile('네모.png')
  console.log('  ' + JSON.stringify(evened))
  expect('나온 파일도 네모반듯', Math.abs(evened.size.width - evened.size.height) <= 1,
    JSON.stringify(evened))

  step('5. 끌어서 자른 만큼만 나온다')
  await page.click('.tree-row:has-text("사진.png") >> nth=0')
  await page.waitForTimeout(400)
  await openEditor()
  await page.click('.image-edit .zoom-control button[aria-label="원본 크기"]')
  await page.waitForTimeout(300)
  const frame = await page.locator('.image-edit-frame img').boundingBox()
  /*
   * 그림은 왼쪽 절반만 칠해져 있습니다. **오른쪽(빈 자리)만** 끌어 고르면, 자른 자리를
   * 실제로 쓰는지 색으로 가릴 수 있습니다. 크기만 맞춰서는 통째로 그려도 같은 수가 나옵니다.
   */
  /*
   * 잘라내기는 픽셀 단위로 맞추는 일인데, 아래 칸의 숫자를 보려면 눈이 손에서 멀리
   * 떠나야 했습니다. 손가락 옆에 짚은 자리와 고른 크기를 적어 줍니다.
   */
  const note = () => page.evaluate(() => document.querySelector('.image-edit-readout')?.textContent ?? null)
  await page.mouse.move(frame.x + frame.width * 0.6, frame.y + 20)
  await page.waitForTimeout(200)
  const pointedAt = await note()
  console.log('  짚은 자리: ' + String(pointedAt))
  expect('누르기 전에는 짚은 자리(x, y)', /^\d+, \d+$/.test(pointedAt ?? ''), String(pointedAt))
  await page.mouse.down()
  await page.mouse.move(frame.x + frame.width * 0.6 + 100, frame.y + 100, { steps: 8 })
  await page.waitForTimeout(200)
  const sizing = await note()
  console.log('  고르는 중: ' + String(sizing))
  expect('고르는 중에는 크기(너비 × 높이)', /^\d+ × \d+$/.test(sizing ?? ''), String(sizing))
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
  expect('이름이 jpg 로 바뀜', (await page.inputValue('.image-edit input[aria-label="파일 이름"]')) === '사진_modified.jpg',
    await page.inputValue('.image-edit input[aria-label="파일 이름"]'))
  expect('품질 자리가 나옴', (await page.locator('#image-quality').count()) === 1)
  await saveEdit()
  const jpg = await madeFile('사진_modified.jpg')
  console.log('  ' + JSON.stringify(jpg))
  expect('JPG 로 나옴', jpg?.kind === 'jpg', JSON.stringify(jpg))
  expect('크기는 그대로', jpg?.size.width === 300 && jpg.size.height === 200, JSON.stringify(jpg))
  /*
   * JPG 에는 투명이 없습니다. 그냥 그리면 투명한 자리가 검게 나오므로 흰 바탕을 먼저 깝니다.
   * 오른쪽 절반(투명하던 자리)의 색을 찍어 봅니다.
   */
  const corner = await page.evaluate(async () => {
    const blob = window.__mockRoot._children.get('사진_modified.jpg')._data
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
