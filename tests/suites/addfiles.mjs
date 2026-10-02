import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'addfiles'), { recursive: true })
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

const BODY = '# 밖에서 온 문서\n\n다른 곳에서 써 온 마크다운입니다.\n'

/** 파일 고르기 창은 자동화로 못 여니 칸에 곧바로 얹습니다. */
const drop = (name, text) => page.setInputFiles('#add-files', [
  { name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') },
])

const toast = async () => {
  const line = page.locator('.toast')
  await line.waitFor({ timeout: 3000 })
  return (await line.textContent()) ?? ''
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. 고르기 창이 마크다운을 걸러내지 않는다')
  const accept = await page.getAttribute('#add-files', 'accept')
  console.log('  accept: ' + accept)
  expect('.md 가 목록에 있음', (accept ?? '').split(',').includes('.md'), String(accept))

  step('2. 마크다운을 넣으면 트리에 나타난다')
  await drop('밖에서 온 문서.md', BODY)
  const first = await toast()
  console.log('  안내: ' + first)
  expect('추가했다고 알림', first.includes('1개 추가'), first)
  expect('거절하지 않음', !first.includes('지원하지 않는'), first)
  await page.waitForTimeout(400)
  const inTree = await page.locator('.tree-row:has-text("밖에서 온 문서")').count()
  expect('트리에 줄이 생김', inTree === 1, String(inTree))

  step('3. 넣은 문서가 내용을 그대로 지닌 채 열린다')
  const seen = await page.evaluate(() => document.querySelector('.doc-body')?.innerText ?? '')
  expect('본문이 화면에 있음', seen.includes('다른 곳에서 써 온 마크다운'), seen.slice(0, 120))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'addfiles', '01-added.png') })

  /*
   * 화면만 보면 색인이 채워졌다는 것까지만 압니다. 자동 저장이 지날 만큼 기다린 뒤
   * 파일 쪽을 한 번 더 열어, 넣는 길에서 내용이 새지 않았는지 봅니다.
   */
  step('4. 파일에도 내용이 그대로 들어간다')
  await page.waitForTimeout(1600)
  const onDisk = await page.evaluate(() => window.__vaultText('밖에서 온 문서.md'))
  console.log('  파일: ' + JSON.stringify(onDisk))
  expect('파일에 본문이 남음', (onDisk ?? '').includes('다른 곳에서 써 온 마크다운'), String(onDisk))

  step('5. 같은 이름을 또 넣으면 덮지 않고 옆에 둔다')
  await drop('밖에서 온 문서.md', BODY)
  await toast()
  await page.waitForTimeout(500)
  const twice = await page.locator('.tree-row:has-text("밖에서 온 문서")').count()
  expect('줄이 둘로 늘어남', twice === 2, String(twice))

  /*
   * 받지 않을 형식으로 가립니다. 실행 파일은 문서에 곁들일 것이 아니라 앞으로도 받지
   * 않습니다 — 압축(zip·7z)을 보기로 썼다가 그것들을 받게 되면서 이 걸음이 두 번 무너졌습니다.
   */
  step('6. 모르는 형식은 여전히 물리친다')
  await drop('프로그램.exe', 'MZ')
  const third = await toast()
  console.log('  안내: ' + third)
  expect('지원하지 않는다고 알림', third.includes('지원하지 않는 형식'), third)
  await page.waitForTimeout(400)
  const other = await page.locator('.tree-row:has-text("프로그램")').count()
  expect('트리에 들이지 않음', other === 0, String(other))

  step('6-1. 압축(zip)은 받는다')
  await drop('자료 묶음.zip', 'PK\x05\x06')
  await toast()
  await page.waitForTimeout(500)
  const zip = await page.locator('.tree-row:has-text("자료 묶음")').count()
  expect('트리에 들어옴', zip === 1, String(zip))
  /*
   * 받는 형식을 한 문단으로 이어 적었더니 문서·압축·개발 소스가 한 덩어리로 흘러,
   * 어디까지가 어느 갈래인지 알 수 없었습니다. 갈래를 갈라 세웁니다.
   */
  step('7. 받는 형식은 접어 두고, 눌러서 갈래별로 편다')
  await page.click('.tree-row:has-text("회사") .tree-name')
  await page.waitForSelector('.folder-types', { timeout: 5000 })
  /*
   * 목록을 놓는 자리 안에 펼쳐 두었더니 칸을 가득 메워, 정작 파일을 놓을 자리가 눈에
   * 들어오지 않았습니다. 밖으로 빼고 접어 둡니다.
   */
  const folded = await page.evaluate(() => ({
    펴짐: document.querySelector('.folder-drop-types') !== null,
    단추: document.querySelector('.folder-types button')?.textContent.trim() ?? null,
    놓는자리안: document.querySelector('.folder-drop .folder-drop-types') !== null,
  }))
  console.log('  ' + JSON.stringify(folded))
  expect('처음에는 접혀 있음', folded.펴짐 === false, JSON.stringify(folded))
  expect('여는 단추가 있음', folded.단추 === '첨부 가능 파일 목록', String(folded.단추))
  expect('놓는 자리 밖에 있음', folded.놓는자리안 === false, JSON.stringify(folded))
  /*
   * 꺾쇠는 **다음에 누르면 일어날 일**을 가리킵니다 — 접혀 있으면 아래, 펴져 있으면 위.
   * 돌린 각으로 잽니다(90도 = 아래, -90도 = 위).
   */
  const spin = () => page.evaluate(() =>
    getComputedStyle(document.querySelector('.folder-types .icon')).transform)
  const closed = await spin()
  console.log('  접힘: ' + closed)
  // rotate(90deg) 은 matrix(0, 1, -1, 0, …) 로 잽니다.
  expect('접혀 있으면 아래를 가리킴', closed.startsWith('matrix(0, 1, -1, 0'), closed)
  await page.click('.folder-types button')
  await page.waitForSelector('.folder-drop-types', { timeout: 5000 })
  const groups = await page.evaluate(() => {
    const box = document.querySelector('.folder-drop-types')
    return {
      칸: [...box.querySelectorAll('dt')].map((one) => one.textContent),
      갈래: [...box.querySelectorAll('li strong')].map((one) => one.textContent),
      압축줄: [...box.querySelectorAll('li')].map((one) => one.textContent).find((one) => one.startsWith('압축')),
      마크다운줄: box.querySelector('dd').textContent.replace(/\s+/g, ' '),
    }
  })
  console.log('  ' + JSON.stringify(groups))
  expect('위키 문서와 첨부를 가름',
    JSON.stringify(groups.칸) === JSON.stringify(['위키 문서', '첨부']), JSON.stringify(groups.칸))
  expect('첨부를 넷으로 가름',
    JSON.stringify(groups.갈래) === JSON.stringify(['이미지', '문서', '압축', '개발 소스']), JSON.stringify(groups.갈래))
  // "코드" 만으로는 무슨 코드인지 알 수 없습니다.
  expect('개발 소스라고 적음', groups.갈래.includes('개발 소스'), JSON.stringify(groups.갈래))
  expect('압축 갈래에 zip·rar·7z·alz 가 모두', ['zip', 'rar', '7z', 'alz'].every((one) => groups.압축줄.includes(one)),
    String(groups.압축줄))
  expect('나눠 담은 조각도 알림', groups.압축줄.includes('나눠 담은 조각'), String(groups.압축줄))
  // 마크다운은 첨부가 아니라 위키의 본체라, 왜 따로인지까지 적습니다.
  expect('마크다운이 왜 따로인지 적음', groups.마크다운줄.includes('크기 제한 없이'), groups.마크다운줄)
  // 문서 갈래에 압축이나 개발 소스가 섞이지 않아야 합니다.
  const mixed = await page.evaluate(() => {
    const docs = [...document.querySelectorAll('.folder-drop-types li')]
      .map((one) => one.textContent).find((one) => one.startsWith('문서'))
    return { zip: docs.includes('zip'), code: docs.includes('sql') }
  })
  expect('문서에 압축·개발 소스가 섞이지 않음', !mixed.zip && !mixed.code, JSON.stringify(mixed))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'addfiles', '01-types.png'),
    clip: { x: 430, y: 40, width: 870, height: 400 } })
  // 꺾쇠는 부드럽게 돕니다. 도는 중에 재면 중간 각이 잡힙니다.
  await page.waitForTimeout(300)
  const opened = await spin()
  console.log('  펴짐: ' + opened)
  expect('펴지면 위를 가리킴', opened.startsWith('matrix(0, -1, 1, 0'), opened)
  // 다시 누르면 접힙니다.
  await page.click('.folder-types button')
  await page.waitForTimeout(200)
  expect('다시 누르면 접힘', (await page.locator('.folder-drop-types').count()) === 0)

} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
