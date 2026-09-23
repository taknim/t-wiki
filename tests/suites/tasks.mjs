import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'tasks'), { recursive: true })
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
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  /*
   * 온갖 꼴의 할 일 줄을 한 문서에 모아 둡니다.
   * 앞머리가 달려 있어, 뗀 만큼 자리를 밀지 않으면 엉뚱한 줄이 바뀝니다.
   * 코드 블록 안의 것은 네모로 그려지지 않으므로 셈에서도 빠져야 합니다.
   */
  root._children.set('할 일.md', Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    {
      kind: 'file',
      name: '할 일.md',
      _data: ['---', 'title: 할 일', '---', '', '# 할 일', '',
        '- [ ] 첫째', '- [x] 둘째', '  - [ ] 안쪽', '',
        // 코드 블록을 사이에 끼워 둡니다. 셈에서 빼지 않으면 뒤엣것의 차례가 밀립니다.
        '```', '- [ ] 코드 안', '```', '',
        '> - [ ] 인용 안', '', '1. [ ] 번호 매긴 것', ''].join('\n'),
      _lastModified: Date.now(),
    },
  ))
})

const boxes = () => page.evaluate(() =>
  [...document.querySelectorAll('.preview input.task-check')].map((one) => one.checked))
const saved = () => page.evaluate(() => window.__vaultText('할 일.md'))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.click('.tree-row:has-text("할 일") .tree-name')
  await page.waitForTimeout(700)
  await page.click('.mode-switch button[aria-label="미리보기"]')
  await page.waitForTimeout(700)

  step('1. 네모가 눌릴 수 있게 그려진다')
  const drawn = await page.evaluate(() =>
    [...document.querySelectorAll('.preview input.task-check')].map((one) => ({
      checked: one.checked, disabled: one.disabled,
    })))
  console.log('  ' + JSON.stringify(drawn))
  // 코드 블록 안의 것은 빠지고 다섯입니다.
  expect('다섯 개가 그려짐', drawn.length === 5, JSON.stringify(drawn))
  expect('눌리지 않게 잠겨 있지 않음',
    drawn.every((one) => !one.disabled), JSON.stringify(drawn))
  expect('원문대로 켜져 있음',
    JSON.stringify(drawn.map((one) => one.checked)) === '[false,true,false,false,false]',
    JSON.stringify(drawn))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'tasks', '01-list.png'),
    clip: { x: 300, y: 60, width: 700, height: 380 } })

  step('2. 누르면 원문이 [x] 로 바뀌고 저장된다')
  await page.click('.preview input.task-check >> nth=0')
  await page.waitForTimeout(1600)
  const first = await saved()
  console.log('  ' + JSON.stringify(await boxes()))
  expect('그 줄이 켜짐', first.includes('- [x] 첫째'), first)
  expect('다른 줄은 그대로', first.includes('  - [ ] 안쪽'), first)
  // 앞머리를 뗀 만큼 자리를 밀지 않으면 앞머리 쪽 글자가 망가집니다.
  expect('앞머리는 그대로', first.startsWith('---\ntitle: 할 일\n---\n'), first)
  expect('저장까지 됨', (await page.evaluate(() =>
    document.querySelector('.doc-head .pill:not(.pill-save)')?.textContent ?? '')) === '저장됨')

  step('3. 켜진 것을 다시 누르면 꺼진다')
  await page.click('.preview input.task-check >> nth=1')
  await page.waitForTimeout(1600)
  const second = await saved()
  console.log('  ' + JSON.stringify(await boxes()))
  expect('둘째가 꺼짐', second.includes('- [ ] 둘째'), second)
  expect('첫째는 켜진 채', second.includes('- [x] 첫째'), second)

  /*
   * 인용 안, 번호 매긴 목록, 코드 블록. 그린 차례와 원문에 적힌 차례가 어긋나면
   * 엉뚱한 줄이 바뀝니다. 네 번째 네모는 인용 안의 것입니다.
   */
  step('4. 인용·번호 목록도 제 줄이 바뀐다')
  await page.click('.preview input.task-check >> nth=3')
  await page.waitForTimeout(1600)
  const third = await saved()
  console.log('  ' + JSON.stringify(await boxes()))
  expect('인용 안의 줄이 켜짐', third.includes('> - [x] 인용 안'), third)
  await page.click('.preview input.task-check >> nth=4')
  await page.waitForTimeout(1600)
  const fourth = await saved()
  expect('번호 매긴 줄도 켜짐', fourth.includes('1. [x] 번호 매긴 것'), fourth)
  expect('코드 블록 안은 그대로', fourth.includes('```\n- [ ] 코드 안\n```'), fourth)

  step('5. 편집기에도 그대로 비친다')
  await page.click('.mode-switch button[aria-label="나란히"]')
  await page.waitForTimeout(700)
  const inEditor = await page.evaluate(() => document.querySelector('.main .editor').value)
  expect('편집기 글도 바뀌어 있음',
    inEditor.includes('- [x] 첫째') && inEditor.includes('1. [x] 번호 매긴 것'), inEditor)

  step('6. 네모가 든 줄에는 점을 찍지 않는다')
  const marker = await page.evaluate(() => {
    const li = document.querySelector('.preview li:has(> .task-check)')
    return getComputedStyle(li).listStyleType
  })
  console.log('  ' + String(marker))
  expect('점이 없음', marker === 'none', String(marker))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
