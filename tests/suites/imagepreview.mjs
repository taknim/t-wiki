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
await page.addInitScript(() => {
  window.__installMockFs()
  // 줄여 그리는 회차를 보려면 칸보다 넓은 그림이 있어야 합니다.
  const attach = window.__mockRoot._children.get('첨부')
  const sample = attach._children.get('도표.svg')
  attach._children.set('큰그림.svg', Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    {
      kind: 'file',
      name: '큰그림.svg',
      _lastModified: Date.now(),
      _data: '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="500">'
        + '<rect width="2000" height="500" fill="#2f6feb"/></svg>',
    },
  ))
})

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

/**
 * 바탕 고르는 단추마다 제 색을 입었는지, 그 위의 글자가 읽히는지.
 * 대비비는 WCAG 셈법 그대로입니다. 4.5 아래면 작은 글씨가 바탕에 묻힙니다.
 */
const backdropButtons = () => page.evaluate(() =>
  [...document.querySelectorAll('.backdrop-switch button')].map((button) => {
    const style = getComputedStyle(button)
    const lum = (color) => {
      const [r, g, b] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
      const one = (v) => {
        const x = v / 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * one(r) + 0.7152 * one(g) + 0.0722 * one(b)
    }
    const back = lum(style.backgroundColor)
    const front = lum(style.color)
    const ratio = (Math.max(back, front) + 0.05) / (Math.min(back, front) + 0.05)
    return {
      label: button.textContent.trim(),
      back: style.backgroundColor,
      picked: button.getAttribute('aria-pressed') === 'true',
      ratio: Math.round(ratio * 10) / 10,
    }
  }))

/** 그림 뒤에 깔린 바탕. 고르는 줄은 제목 줄에 있습니다. */
const canvas = () => page.evaluate(() => {
  const box = document.querySelector('.asset-canvas')
  if (!box) return null
  const style = getComputedStyle(box)
  const page = getComputedStyle(document.querySelector('.asset-view'))
  return {
    kind: [...box.classList].find((name) => name.startsWith('is-')) ?? null,
    color: style.backgroundColor,
    sameAsPage: style.backgroundColor === page.backgroundColor,
    pressed: [...document.querySelectorAll('.backdrop-switch button')]
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent),
    // 제목과 윗변이 같으면 한 줄에 나란히 선 것입니다.
    besideTitle: (() => {
      const title = document.querySelector('.doc-head h1')
      const tools = document.querySelector('.doc-head .backdrop-switch')
      if (!title || !tools) return false
      const a = title.getBoundingClientRect()
      const b = tools.getBoundingClientRect()
      return b.top < a.bottom && b.bottom > a.top && b.left > a.right
    })(),
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

  step('7. 처음에는 본디 바탕 그대로다')
  const plain = await canvas()
  console.log('  ' + JSON.stringify(plain))
  expect('기존이 기본', plain?.kind === 'is-theme', JSON.stringify(plain))
  expect('화면 바탕과 같은 색', plain?.sameAsPage === true, JSON.stringify(plain))
  expect('고른 것이 눌린 채로 보임', plain?.pressed.join() === '기존', JSON.stringify(plain))
  // 보기 모드와 같은 자리입니다. 그림 위에 따로 한 줄을 더 쓰지 않습니다.
  expect('제목과 같은 줄에 섬', plain?.besideTitle === true, JSON.stringify(plain))

  const filled = await page.evaluate(() => {
    const view = document.querySelector('.asset-view')
    const box = document.querySelector('.asset-canvas')
    const a = view.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    return {
      // 네 모서리가 맞닿아야 여백도 테두리도 없는 것입니다.
      gaps: [b.top - a.top, b.left - a.left, a.right - b.right, a.bottom - b.bottom]
        .map((one) => Math.round(one)),
      border: getComputedStyle(box).borderTopWidth,
      labels: [...document.querySelectorAll('.backdrop-switch button')]
        .map((button) => button.textContent.trim()),
      // 색조각 넷만 서 있으면 무엇을 고르는 자리인지 알 수 없습니다.
      lead: document.querySelector('.doc-head .head-tool .head-tool-label')?.textContent ?? null,
    }
  })
  console.log('  ' + JSON.stringify(filled))
  expect('칸을 가득 채움', filled.gaps.every((gap) => gap === 0), JSON.stringify(filled.gaps))
  expect('테두리 없음', filled.border === '0px', filled.border)
  const buttons = await backdropButtons()
  console.log('  ' + JSON.stringify(buttons))
  expect('단추가 넷', buttons.length === 4, JSON.stringify(buttons))
  // 기존은 테마 색이라 밝은 테마에서는 밝게와 같은 흰색일 수 있습니다. 나머지 셋만 봅니다.
  expect('단추마다 제 바탕색을 입음',
    new Set(buttons.slice(1).map((one) => one.back)).size === 3, JSON.stringify(buttons))
  expect('글자가 그 바탕 위에서 읽힘',
    buttons.every((one) => one.ratio >= 4.5), JSON.stringify(buttons))
  expect('이름도 함께 적힘', filled.labels.join() === '기존,밝게,중간,어둡게',
    JSON.stringify(filled.labels))
  expect('앞에 무엇을 고르는지 적힘', filled.lead === '배경', String(filled.lead))

  const marked = await page.evaluate(() => {
    const image = document.querySelector('.asset-image')
    const style = getComputedStyle(image)
    const label = document.querySelector('.asset-size')
    const box = document.querySelector('.asset-canvas').getBoundingClientRect()
    const at = label?.getBoundingClientRect()
    return {
      outline: style.outlineWidth,
      ring: style.boxShadow,
      size: label?.querySelector('.asset-size-now')?.textContent.trim() ?? null,
      origin: label?.querySelector('.asset-size-origin')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      // 칸의 오른쪽 위 구석에 붙어 있어야 합니다.
      corner: at ? Math.round(box.right - at.right) < 30 && Math.round(at.top - box.top) < 30 : false,
    }
  })
  console.log('  ' + JSON.stringify(marked))
  expect('그림에 테두리가 둘림', marked.outline !== '0px', JSON.stringify(marked))
  expect('밝은 테도 함께 둘림', marked.ring !== 'none', JSON.stringify(marked))
  expect('크기가 픽셀로 적힘', /^\d+ × \d+px$/.test(marked.size ?? ''), String(marked.size))
  expect('오른쪽 위 구석에 있음', marked.corner === true, JSON.stringify(marked))
  // 줄지 않은 그림에까지 본디 크기를 적으면 같은 숫자가 두 번 적힙니다.
  expect('줄지 않았으면 본디 크기는 안 적음', marked.origin === null, String(marked.origin))

  step('4-2. 줄여 그린 그림에는 본디 크기와 몇 할인지 함께 적는다')
  await page.click('.tree-row:has-text("큰그림")')
  await page.waitForTimeout(800)
  const big = await page.evaluate(() => {
    const image = document.querySelector('.asset-image')
    const now = document.querySelector('.asset-size-now')?.textContent.trim() ?? null
    const origin = document.querySelector('.asset-size-origin')?.textContent
      .replace(/\s+/g, ' ').trim() ?? null
    return { now, origin, width: Math.round(image.getBoundingClientRect().width), natural: image.naturalWidth }
  })
  console.log('  ' + JSON.stringify(big))
  expect('본디 크기가 함께 적힘', /^원본 2000 × 500px · \d+%$/.test(big.origin ?? ''),
    String(big.origin))
  expect('지금 크기는 그려진 그대로', big.now === `${big.width} × ${Math.round(big.width / 4)}px`,
    `${big.now} vs ${big.width}`)
  expect('본디보다 작게 그려짐', big.width < big.natural, JSON.stringify(big))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imagepreview', '04-size.png'),
    clip: { x: 430, y: 60, width: 970, height: 220 } })
  await pickImage()

  step('8. 밝게·중간·어둡게는 저마다 다른 색을 깐다')
  const painted = {}
  for (const label of ['밝게', '중간', '어둡게']) {
    await page.click(`.backdrop-switch button:text-is("${label}")`)
    await page.waitForTimeout(250)
    painted[label] = await canvas()
  }
  console.log('  ' + JSON.stringify(painted))
  expect('밝게는 흰 바탕', painted['밝게']?.color === 'rgb(255, 255, 255)', JSON.stringify(painted['밝게']))
  expect('어둡게는 어두운 바탕', painted['어둡게']?.kind === 'is-dark', JSON.stringify(painted['어둡게']))
  // 중간은 말 그대로 가운데라야 합니다. 한쪽으로 붙으면 둘 중 하나가 쓸모없어집니다.
  const grey = (painted['중간']?.color.match(/\d+/g) ?? []).map(Number)
  console.log('  중간: ' + JSON.stringify(grey))
  expect('중간은 회색', grey.length >= 3 && Math.max(...grey.slice(0, 3)) - Math.min(...grey.slice(0, 3)) < 24,
    JSON.stringify(grey))
  expect('중간은 밝게와 어둡게 사이', grey[0] > 90 && grey[0] < 190, JSON.stringify(grey))
  const distinct = new Set(['밝게', '중간', '어둡게'].map((label) => painted[label]?.color))
  expect('셋이 서로 다른 색', distinct.size === 3, [...distinct].join(' / '))
  // 밝은 테마에서 흰 로고가 묻히는 것을 살리는 자리입니다. 화면과 같은 색이면 헛일입니다.
  expect('어둡게는 화면 바탕과 다른 색', painted['어둡게']?.sameAsPage === false,
    JSON.stringify(painted['어둡게']))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'imagepreview', '03-dark.png') })

  /*
   * 테마를 따라가면 테마와 색이 비슷해 묻히는 그림을 살릴 수 없습니다.
   * 화면을 어둡게 돌려 놓고도 세 벌의 색이 그대로인지 봅니다.
   */
  step('9. 밝기를 어둡게 돌려도 고른 바탕색은 그대로다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.click('[aria-label="밝기"] button:text-is("어둡게")')
  await page.waitForTimeout(400)
  await page.click('.sheet-close')
  await page.waitForTimeout(400)
  const inDark = await canvas()
  console.log('  ' + JSON.stringify(inDark))
  expect('어둡게 바탕이 그대로', inDark?.color === painted['어둡게']?.color,
    inDark?.color + ' vs ' + painted['어둡게']?.color)
  // 테마가 바뀌면 "기존" 단추의 바탕도 따라 어두워집니다. 글자가 따라가지 않으면 묻힙니다.
  const darkButtons = await backdropButtons()
  console.log('  ' + JSON.stringify(darkButtons))
  expect('어두운 테마에서도 글자가 읽힘',
    darkButtons.every((one) => one.ratio >= 4.5), JSON.stringify(darkButtons))
  expect('기존 단추도 함께 어두워짐',
    darkButtons[0].back !== buttons[0].back, JSON.stringify(darkButtons[0]))

  step('10. 기존을 고르면 어두워진 화면을 그대로 따른다')
  await page.click('.backdrop-switch button:text-is("기존")')
  await page.waitForTimeout(300)
  const followed = await canvas()
  console.log('  ' + JSON.stringify(followed))
  expect('화면 바탕을 따라감', followed?.sameAsPage === true, JSON.stringify(followed))
  expect('밝을 때의 흰색이 아님', followed?.color !== 'rgb(255, 255, 255)', JSON.stringify(followed))
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("모양")')
  await page.click('[aria-label="밝기"] button:text-is("시스템 따름")')
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
  await page.waitForTimeout(300)
  await page.click('.backdrop-switch button:text-is("어둡게")')
  await page.waitForTimeout(300)

  step('11. 새로고침해도 고른 바탕이 남는다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault()
  await pickImage()
  const stillDark = await canvas()
  console.log('  ' + JSON.stringify(stillDark))
  expect('어둡게가 그대로', stillDark?.kind === 'is-dark', JSON.stringify(stillDark))

  step('12. 미리보기를 끄면 바탕 고르는 줄도 사라진다')
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
