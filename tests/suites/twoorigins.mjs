import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []

/*
 * 도메인이 다르면 브라우저 저장소가 통째로 갈립니다. 설정도 기준점도 서로 못 봅니다.
 * 그 상황을 따로 떼어 낸 브라우저 자리 두 곳으로 흉내 냅니다.
 */
const openSite = async (folderName, seedFile) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 920 } })
  await context.route('https://api.github.com/**', github.handler)
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`${folderName}: ${e.message}`))
  await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
  await page.addInitScript(([name, seed]) => {
    window.__installMockFs()
    if (name !== '내 위키') {
      const fresh = Object.create(Object.getPrototypeOf(window.__mockRoot))
      Object.assign(fresh, { kind: 'directory', name, _children: new Map() })
      if (seed) {
        const file = Object.create(Object.getPrototypeOf([...window.__mockRoot._children.values()][0]))
        Object.assign(file, { kind: 'file', name: seed, _data: `# ${seed}\n`, _lastModified: Date.now() })
        fresh._children.set(seed, file)
      }
      window.__mockRoot = fresh
    }
    window.showDirectoryPicker = async () => window.__mockRoot
  }, [folderName, seedFile ?? null])
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
  return { context, page }
}

const configure = async (page) => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  const box = page.locator('.checkbox:has-text("반대쪽에서도 지우기") input')
  if (!(await box.isChecked())) await box.click()   // 가장 위험한 설정으로 둡니다
  await page.waitForTimeout(300)
  await page.click('.sheet-close')
}
const sync = async (page) => {
  await page.waitForFunction(() => !document.querySelector('.toast'), { timeout: 15000 }).catch(() => {})
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), { timeout: 30000 })
  await page.waitForTimeout(800)
}
const files = () => Object.keys(github.currentFiles()).sort()

try {
  step('1. 도메인 A 에서 폴더를 저장소에 올린다')
  const a = await openSite('내 위키')
  await configure(a.page)
  await sync(a.page)
  const stocked = files()
  console.log('  저장소: ' + JSON.stringify(stocked))
  expect('저장소가 채워짐', stocked.length >= 5, JSON.stringify(stocked))

  step('2. 도메인 B 에서 새 폴더를 열고 새 파일 하나를 만든다')
  const b = await openSite('다른 폴더', '메모.md')
  const bLocal = await b.page.evaluate(() => [...window.__mockRoot._children.keys()])
  console.log('  B 폴더 안: ' + JSON.stringify(bLocal))
  expect('B 에는 새 파일 하나만 있음', JSON.stringify(bLocal) === '["메모.md"]', JSON.stringify(bLocal))
  // 저장소가 갈려 있는지 확인합니다. 갈려 있어야 남의 설정을 물려받지 않습니다.
  const bBlank = await b.page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('mdwiki:')).length)
  console.log('  B 의 브라우저 저장소에 남은 취향: ' + bBlank + '개')

  step('3. B 에서 동기화해도 저장소의 파일이 지워지지 않는다')
  await configure(b.page)
  const before = files()
  await sync(b.page)
  const after = files()
  console.log('  동기화 뒤: ' + JSON.stringify(after))
  const lost = before.filter((path) => !after.includes(path))
  expect('있던 파일이 하나도 사라지지 않음', lost.length === 0, '사라짐: ' + JSON.stringify(lost))
  expect('B 의 새 파일은 올라감', after.includes('메모.md'), JSON.stringify(after))

  step('4. B 폴더로 저장소 내용이 내려온다')
  const bAfter = await b.page.evaluate(() => {
    const walk = (dir, prefix, out) => {
      for (const [name, child] of dir._children) {
        const path = prefix ? `${prefix}/${name}` : name
        if (child.kind === 'directory') walk(child, path, out)
        else out.push(path)
      }
      return out
    }
    return walk(window.__mockRoot, '', []).sort()
  })
  console.log('  B 폴더: ' + JSON.stringify(bAfter))
  expect('저장소에 있던 것이 내려옴', before.every((path) => bAfter.includes(path)),
    JSON.stringify(before.filter((p) => !bAfter.includes(p))))

  step('5. A 로 돌아가 동기화해도 그대로다')
  await sync(a.page)
  const finalFiles = files()
  console.log('  마지막 저장소: ' + JSON.stringify(finalFiles))
  expect('A 에서도 지워지지 않음', before.every((path) => finalFiles.includes(path)),
    JSON.stringify(before.filter((p) => !finalFiles.includes(p))))

  step('6. 콘솔 오류')
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
