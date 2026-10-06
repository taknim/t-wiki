import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'tidyvault'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
/*
 * 밖에서 들어온 꼴을 지어 둡니다. 자모가 나뉜 이름(맥), 운영체제 살림 파일, 그리고
 * **모아 적은 이름이 이미 있는** 자리까지. 마지막 것은 덮어쓰지 않고 건너뛰어야 합니다.
 */
await page.addInitScript(() => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const file = (name, text) => Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: new Blob([text ?? 'x']), _lastModified: Date.now() })
  const put = (name, text) => root._children.set(name, file(name, text))

  put('밖에서 온 기록.txt'.normalize('NFD'), '자모가 나뉜 이름')
  // 묻는 칸을 넘치도록 넉넉히 심습니다. 모두 적히는지와 굴러가는지를 함께 가립니다.
  for (let at = 1; at <= 30; at += 1) put(`나뉜 이름 ${at}.md`.normalize('NFD'), '글')
  put('.DS_Store', '살림')
  put('._숨은 자취.txt', '살림')
  put('Thumbs.db', '살림')
  // 모아 적은 이름이 이미 있는 자리. 합치려 들면 남의 파일을 덮게 되므로 건너뜁니다.
  put('겹치는 글.md', '먼저 있던 것')
  put('겹치는 글.md'.normalize('NFD'), '나중에 들어온 것')
  // 폴더 이름도 나뉠 수 있습니다. 안엣것까지 함께 따라가야 합니다.
  const dir = Object.assign(Object.create(Object.getPrototypeOf(root)),
    { kind: 'directory', name: '자료 묶음'.normalize('NFD'), _children: new Map() })
  dir._children.set('안엣글.md', file('안엣글.md', '안에 있던 글'))
  dir._children.set('.DS_Store', file('.DS_Store', '살림'))
  root._children.set(dir.name, dir)
})

const names = () => page.evaluate(() =>
  [...window.__mockRoot._children.keys()].map((one) => ({ raw: one, nfc: one.normalize('NFC') })))
const openTidy = async () => {
  if (!(await page.locator('.settings-nav').count())) {
    await page.click('button[aria-label="설정"]')
    await page.waitForSelector('.settings-nav')
  }
  await page.click('.settings-nav button:has-text("폴더 정돈")')
  await page.waitForTimeout(300)
}
const told = () => page.evaluate(() =>
  document.querySelector('#set-tidy-vault .status')?.textContent ?? null)

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })

  step('1. 자모가 나뉜 이름을 찾아 몇 개인지 먼저 묻는다')
  await openTidy()
  await page.click('button:has-text("자소 분리된 이름 합치기")')
  await page.waitForSelector('.dialog', { timeout: 8000 })
  const asked = (await page.textContent('.dialog')).replace(/\s+/g, ' ')
  console.log('  ' + asked.slice(0, 110))
  expect('몇 개인지 적힘', /이름 \d+개를 모아 적을까요/.test(asked), asked.slice(0, 60))
  expect('무엇을 고칠지 보여 줌', asked.includes('밖에서 온 기록.txt'), asked.slice(0, 160))
  expect('건너뛸 수도 있다고 알림', asked.includes('같은 이름이 이미 있으면 건너뜁니다'), asked.slice(0, 200))
  /*
   * 몇 줄만 보여 주고 "그 밖에 N개" 로 접으면 정작 무엇이 바뀌는지 알 수 없습니다.
   * 다 적되 **목록 칸만** 굴립니다 — 설명은 굴린 뒤에도 그 자리에 남아야 합니다.
   */
  const listed = await page.evaluate(() => {
    const dialog = document.querySelector('.dialog')
    const box = dialog.querySelector('.dialog-list')
    const label = dialog.querySelector('.dialog-label')
    return {
      줄수: box.querySelectorAll('li').length,
      접음: dialog.textContent.includes('그 밖에'),
      굴러감: box.scrollHeight > box.clientHeight + 1,
      설명굴림: label.scrollHeight > label.clientHeight + 1,
      창너비: Math.round(dialog.getBoundingClientRect().width),
      창높이: Math.round(dialog.getBoundingClientRect().height),
    }
  })
  console.log('  ' + JSON.stringify(listed))
  expect('바뀔 것을 모두 적음', listed.줄수 >= 32, JSON.stringify(listed))
  expect('접어 두지 않음', listed.접음 === false, JSON.stringify(listed))
  expect('목록 칸만 굴러감', listed.굴러감 && listed.설명굴림 === false, JSON.stringify(listed))
  // 좁은 창에서는 경로가 꺾여 몇 개가 바뀌는지조차 세기 어려웠습니다.
  expect('목록이 든 창은 넓게 열림', listed.창너비 >= 700, JSON.stringify(listed))
  // 창이 화면 밖으로 자라면 단추를 누를 수 없습니다.
  expect('창은 화면 안에 머묾', listed.창높이 <= 900, JSON.stringify(listed))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'tidyvault', '01-ask.png'),
    clip: { x: 200, y: 90, width: 900, height: 520 } })

  step('2. 물러서면 아무것도 바뀌지 않는다')
  const before = await names()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect('이름이 그대로', JSON.stringify(await names()) === JSON.stringify(before), JSON.stringify(await names()))
  expect('한 일이 없다고 적지도 않음', (await told()) === null, String(await told()))

  step('3. 합치면 이름이 모아 적히고, 겹치는 것은 건너뛴다')
  await page.click('button:has-text("자소 분리된 이름 합치기")')
  await page.waitForSelector('.dialog', { timeout: 8000 })
  await page.click('.dialog button:has-text("합치기")')
  await page.waitForTimeout(800)
  const after = await names()
  console.log('  ' + JSON.stringify(after.map((one) => one.nfc)))
  const joined = after.find((one) => one.nfc === '밖에서 온 기록.txt')
  expect('나뉜 이름이 모아 적힘', joined !== undefined && joined.raw === joined.nfc, JSON.stringify(joined))
  // 겹치던 자리는 둘 다 남아 있어야 합니다. 덮어쓰면 먼저 있던 글이 사라집니다.
  const both = after.filter((one) => one.nfc === '겹치는 글.md')
  expect('겹치는 것은 건너뛰어 둘 다 남음', both.length === 2, JSON.stringify(both))
  const result = await told()
  console.log('  알림: ' + String(result))
  expect('몇 개를 했고 몇 개를 건너뛰었는지 적음',
    /\d+개를 합쳤습니다/.test(result ?? '') && result.includes('건너뛰었습니다'), String(result))
  expect('심어 둔 것이 모두 합쳐짐',
    after.filter((one) => /^나뉜 이름 \d+\.md$/.test(one.nfc) && one.raw === one.nfc).length === 30,
    JSON.stringify(after.map((one) => one.nfc)))
  // 폴더 이름도 모아 적히고 안엣것이 따라옵니다.
  const dir = after.find((one) => one.nfc === '자료 묶음')
  expect('폴더 이름도 모아 적힘', dir !== undefined && dir.raw === dir.nfc, JSON.stringify(dir))
  const inside = await page.evaluate(() =>
    [...(window.__mockRoot._children.get('자료 묶음')?._children.keys() ?? [])])
  expect('안엣것이 따라옴', inside.includes('안엣글.md'), JSON.stringify(inside))

  step('4. 살림 파일은 목록을 보여 주고 지운다')
  await page.click('button:has-text("쓸모없는 파일 지우기")')
  await page.waitForSelector('.dialog', { timeout: 8000 })
  const junkAsked = (await page.textContent('.dialog')).replace(/\s+/g, ' ')
  console.log('  ' + junkAsked.slice(0, 120))
  expect('무엇을 지울지 보여 줌', junkAsked.includes('.DS_Store'), junkAsked.slice(0, 120))
  expect('되돌릴 수 없다고 밝힘', junkAsked.includes('되돌릴 수 없습니다'), junkAsked.slice(0, 200))
  await page.click('.dialog button:has-text("지우기")')
  await page.waitForTimeout(800)
  const left = await names()
  console.log('  남은 것: ' + JSON.stringify(left.map((one) => one.nfc)))
  for (const junk of ['.DS_Store', 'Thumbs.db', '._숨은 자취.txt']) {
    expect(`${junk} 가 지워짐`, !left.some((one) => one.nfc === junk), JSON.stringify(left.map((one) => one.nfc)))
  }
  // 폴더 안의 살림 파일도 함께 지웁니다.
  const deepLeft = await page.evaluate(() =>
    [...(window.__mockRoot._children.get('자료 묶음')?._children.keys() ?? [])])
  expect('폴더 안의 살림 파일도 지워짐', !deepLeft.includes('.DS_Store'), JSON.stringify(deepLeft))
  expect('글은 그대로 남음', deepLeft.includes('안엣글.md'), JSON.stringify(deepLeft))

  step('5. 더 치울 것이 없으면 없다고 한다')
  await page.click('button:has-text("쓸모없는 파일 지우기")')
  await page.waitForTimeout(600)
  expect('없다고 알림', (await told() ?? '').includes('없습니다'), String(await told()))
  expect('묻지 않음', (await page.locator('.dialog').count()) === 0)
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
