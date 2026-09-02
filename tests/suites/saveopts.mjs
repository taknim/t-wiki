import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'saveopts'), { recursive: true })
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

const make = async (name, body) => {
  await page.click('.tree-root button[aria-label="새 문서"]')
  await page.waitForSelector('.dialog-input')
  await page.fill('.dialog-input', name)
  await page.click('.dialog button:has-text("만들기")')
  await page.waitForFunction((want) =>
    document.querySelector('.info-path')?.textContent === `/${want}`, name, { timeout: 8000 })
  await page.fill('.editor', body)
  await page.waitForTimeout(500)
}
/** 그 파일에서 벗어나야 정돈이 돕니다. */
const leave = async () => {
  await page.click('.tree-row:has-text("개발 환경")')
  await page.waitForTimeout(700)
}
const onDisk = (name) => page.evaluate(async (want) => {
  const handle = await window.__mockRoot.getFileHandle(want)
  return (await handle.getFile()).text()
}, name)
const setOption = async (label, on) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  const box = page.locator(`.checkbox:has-text("${label}") input`)
  if ((await box.isChecked()) !== on) await box.click()
  await page.waitForTimeout(200)
  await page.click('.sheet-close')
  await page.waitForTimeout(200)
}
const optionRows = () => page.evaluate(() =>
  [...document.querySelectorAll('.settings-section .checkbox')]
    .map((el) => ({ label: el.textContent.split('\n')[0].trim(), on: el.querySelector('input').checked }))
    .filter((b) => b.label.includes('줄 끝 공백') || b.label.includes('들여쓰기 다시 잡기')))

const MESSY_JSON = '{"a":[1,\n2]}   \n\n\n'
const MESSY_YAML = '가:\n\t나: 1  \n'

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree')

  step('1. 설정에 두 항목이 있고 기본은 꺼짐이다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  const boxes = await optionRows()
  console.log('  ' + JSON.stringify(boxes))
  expect('두 항목이 있음', boxes.length === 2, JSON.stringify(boxes))
  expect('둘 다 기본은 꺼짐', boxes.every((b) => !b.on), JSON.stringify(boxes))
  await page.screenshot({ path: join(HERE, 'shots-saveopts', '01-settings.png'),
    clip: { x: 300, y: 90, width: 820, height: 620 } })
  await page.click('.sheet-close')

  step('2. 기본값에서는 쓴 그대로 저장한다')
  await make('그대로.json', MESSY_JSON)
  await leave()
  const kept = await onDisk('그대로.json')
  console.log('  ' + JSON.stringify(kept))
  expect('JSON 을 다시 쓰지 않음', kept === MESSY_JSON, JSON.stringify(kept))
  await make('그대로.yaml', MESSY_YAML)
  await leave()
  expect('YAML 도 그대로', (await onDisk('그대로.yaml')) === MESSY_YAML,
    JSON.stringify(await onDisk('그대로.yaml')))

  step('3. 미리보기는 설정과 상관없이 정돈해 보여 준다')
  await page.click('.tree-row:has-text("그대로.json")')
  await page.waitForSelector('.code-preview', { timeout: 8000 })
  await page.waitForTimeout(400)
  const preview = await page.textContent('.code-preview')
  expect('미리보기는 펼쳐짐', preview.includes('\n  "a": [\n    1,'), JSON.stringify(preview))
  expect('그래도 파일은 그대로', (await onDisk('그대로.json')) === MESSY_JSON)

  step('4. 형식 정돈만 켜면 들여쓰기만 손본다')
  await setOption('들여쓰기 다시 잡기', true)
  await make('정돈.json', MESSY_JSON)
  await leave()
  const tidied = await onDisk('정돈.json')
  console.log('  ' + JSON.stringify(tidied))
  expect('JSON 이 정돈됨', tidied.includes('\n  "a": [\n    1,'), JSON.stringify(tidied))

  await make('정돈.yaml', MESSY_YAML)
  await leave()
  const tidiedYaml = await onDisk('정돈.yaml')
  console.log('  ' + JSON.stringify(tidiedYaml))
  expect('YAML 탭이 공백으로', tidiedYaml.includes('\n  나: 1'), JSON.stringify(tidiedYaml))
  expect('줄 끝 공백은 아직 남음', tidiedYaml.includes('1  \n'), JSON.stringify(tidiedYaml))

  step('5. 공백 지우기까지 켜면 줄 끝과 앞뒤를 정리한다')
  await setOption('줄 끝 공백', true)
  await make('공백.yaml', MESSY_YAML)
  await leave()
  const trimmed = await onDisk('공백.yaml')
  console.log('  ' + JSON.stringify(trimmed))
  expect('탭도 공백도 정리됨', trimmed === '가:\n  나: 1\n', JSON.stringify(trimmed))

  step('6. 마크다운의 줄바꿈 공백은 지우지 않는다')
  await make('줄바꿈.md', '첫 줄  \n둘째 줄\n\n\n')
  await leave()
  const md = await onDisk('줄바꿈.md')
  console.log('  ' + JSON.stringify(md))
  expect('줄바꿈용 공백은 남기고 뒤 빈 줄만 걷어냄', md === '첫 줄  \n둘째 줄\n', JSON.stringify(md))

  step('7. 설정이 다시 열어도 남는다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  const after = await optionRows()
  console.log('  ' + JSON.stringify(after))
  expect('둘 다 켜진 채', after.length === 2 && after.every((b) => b.on), JSON.stringify(after))
  await page.click('.sheet-close')

  step('8. 콘솔 오류')
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length > 0) fail('콘솔', real.join('\n      '))
  else ok('콘솔 오류 없음')
} catch (e) {
  fail('실행 중단', e.stack ?? e.message)
} finally {
  await browser.close()
}

console.log('\n' + '='.repeat(50))
if (problems.length === 0) console.log('전부 통과')
else { console.log('실패 ' + problems.length + '건'); problems.forEach((p) => console.log(' - ' + p)); process.exitCode = 1 }
