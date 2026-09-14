import { chromium } from 'playwright'
import { createGitHubMock } from '../github-mock.mjs'
import { DOCX_B64, XLSX_B64 } from '../office-fixtures.mjs'
import { createServer } from 'node:http'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
mkdirSync(join(HERE, '..', 'shots', 'csp'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

/*
 * 머리말은 개발 서버가 아니라 배포된 파일에 붙습니다. 그래서 이 묶음만은
 * 빌드 결과를 직접 띄우고, 붙일 머리말도 public/_headers 에서 그대로 읽어 옵니다.
 * 여기에 적어 두면 진짜 배포와 어긋나도 시험은 통과해 버립니다.
 */
const headersOf = (block) => {
  const lines = readFileSync(join(ROOT, 'public', '_headers'), 'utf8').split('\n')
  const at = lines.indexOf(block)
  const found = {}
  for (const line of lines.slice(at + 1)) {
    if (!line.startsWith('  ')) break
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) continue
    const colon = trimmed.indexOf(':')
    found[trimmed.slice(0, colon)] = trimmed.slice(colon + 1).trim()
  }
  return found
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
}

execSync('npm run build', { cwd: ROOT, stdio: 'ignore' })
const headers = headersOf('/*')
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname)
  const file = join(ROOT, 'dist', path === '/' ? 'index.html' : path)
  if (!existsSync(file) || !file.startsWith(join(ROOT, 'dist'))) {
    response.writeHead(404).end('없음')
    return
  }
  response.writeHead(200, {
    ...headers,
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
  })
  response.end(readFileSync(file))
})
await new Promise((done) => server.listen(0, done))
const APP = `http://localhost:${server.address().port}`

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.route('https://api.github.com/**', github.handler)
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(({ xlsx, docx }) => {
  window.__installMockFs()
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const make = (name, data) => Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: data, _lastModified: Date.now() },
  )
  // 오피스 미리보기는 벌을 따로 내려받아 돌립니다. 울타리에 걸리는지 여기서 봅니다.
  const bytes = (b64) => Uint8Array.from(atob(b64), (one) => one.charCodeAt(0))
  root._children.set('판매표.xlsx', make('판매표.xlsx', bytes(xlsx)))
  root._children.set('안내문.docx', make('안내문.docx', bytes(docx)))
  // 막힐 만한 것을 한 문서에 모아 둡니다. 그림·다이어그램·수식. 문서 안 <style> 은 걷어내야 합니다.
  root._children.set('모둠.md', make('모둠.md',
    '# 모둠\n\n```mermaid\ngraph TD;\n  가-->나;\n```\n\n$$E = mc^2$$\n\n'
    + '![도표](첨부/도표.svg)\n\n<style>.doc-head h1 { letter-spacing: 1px; }</style>\n'))
  root._children.set('쪽.html', make('쪽.html', '<h1>안녕</h1><p id="here">여기</p>'))

  // 막힌 것이 있으면 브라우저가 이 사건을 올립니다. 콘솔만 보면 놓칩니다.
  window.__csp = []
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__csp.push(`${event.violatedDirective} <- ${event.blockedURI}`)
  })
}, { xlsx: XLSX_B64, docx: DOCX_B64 })

try {
  step('1. 머리말이 실제로 붙어 나간다')
  const response = await page.goto(APP, { waitUntil: 'domcontentloaded' })
  const sent = response.headers()['content-security-policy'] ?? null
  console.log('  ' + String(sent).slice(0, 90) + '…')
  expect('CSP 가 응답에 있음', typeof sent === 'string' && sent.length > 0, String(sent))
  expect('바깥 스크립트를 막음', String(sent).includes("script-src 'self'"), String(sent))
  expect('나가는 곳을 좁힘', String(sent).includes('https://api.github.com'), String(sent))
  expect('남의 페이지에 못 끼움', String(sent).includes("frame-ancestors 'none'"), String(sent))
  expect('끼워 넣는 코드를 막음', !String(sent).includes("script-src 'self' 'unsafe-inline'"),
    String(sent))

  step('2. 앱이 그대로 뜬다')
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
  ok('폴더가 열림')

  step('3. 그림·다이어그램·수식이 모두 그려진다')
  await page.click('.tree-row:has-text("모둠")')
  await page.waitForTimeout(2500)
  const drawn = await page.evaluate(() => ({
    diagram: document.querySelectorAll('.preview .mermaid-figure svg').length,
    math: document.querySelectorAll('.preview .katex').length,
    // 주소만 보면 막혀도 그대로 붙어 있습니다. 정말 그려졌는지는 폭으로 가립니다.
    image: document.querySelector('.preview img')?.naturalWidth ?? 0,
    // 문서가 스스로 데려온 스타일. mermaid 도 제 스타일을 넣으므로 내용으로 가립니다.
    styled: [...document.querySelectorAll('.preview style')]
      .some((one) => one.textContent.includes('letter-spacing')),
    // 걷어낸 자취가 글자로 새어 나오지도 않아야 합니다.
    leaked: document.querySelector('.preview').textContent.includes('letter-spacing'),
    // 그 스타일이 앱 화면에 걸리지 않았는지도 봅니다.
    spacing: getComputedStyle(document.querySelector('.doc-head h1')).letterSpacing,
  }))
  console.log('  ' + JSON.stringify(drawn))
  expect('다이어그램이 그려짐', drawn.diagram === 1, JSON.stringify(drawn))
  expect('수식이 그려짐', drawn.math > 0, JSON.stringify(drawn))
  expect('볼트 안 그림이 뜸', drawn.image > 0, JSON.stringify(drawn))
  /*
   * 저장소를 같이 쓰는 사람이 넣은 CSS 가 앱 화면을 덮거나 가짜 안내를 그릴 수 있습니다.
   * 문서 안 <style> 은 걷어내고, 앱 화면에 걸리지도 않아야 합니다.
   */
  expect('문서 안 스타일은 걷어냄', drawn.styled === false && !drawn.leaked, JSON.stringify(drawn))
  expect('앱 화면에 걸리지 않음', drawn.spacing !== '1px', JSON.stringify(drawn))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'csp', '01-doc.png') })

  step('4. HTML 첨부 미리보기도 그려진다')
  await page.click('.tree-row:has-text("쪽.html")')
  await page.waitForTimeout(1200)
  const framed = await page.frameLocator('.html-frame').locator('#here').textContent()
  console.log('  틀 안: ' + String(framed))
  expect('틀 안이 그려짐', framed === '여기', String(framed))

  /*
   * 동기화는 이 앱의 본일입니다. connect-src 를 잘못 좁히면 여기서만 막히는데,
   * 화면에는 그저 실패로 보입니다. 가짜 저장소를 세워 실제로 한 번 돌려 봅니다.
   */
  /*
   * 오피스 미리보기는 큰 벌을 그때그때 내려받습니다. 그 안에서 eval 이나 new Function 을
   * 쓰면 script-src 에 걸려 조용히 죽습니다. 실제로 열어 봐야 압니다.
   */
  step('5. 오피스 미리보기도 울타리 안에서 돈다')
  await page.click('.tree-row:has-text("판매표")')
  await page.waitForSelector('.data-table', { timeout: 15000 })
  const cells = await page.evaluate(() =>
    document.querySelectorAll('.data-table tbody tr').length)
  expect('엑셀이 표로 그려짐', cells === 3, String(cells))
  await page.click('.tree-row:has-text("안내문")')
  await page.waitForSelector('.text-preview.markdown-body', { timeout: 15000 })
  const word = await page.evaluate(() =>
    document.querySelector('.text-preview.markdown-body h1')?.textContent ?? null)
  expect('워드가 글로 그려짐', word === '워드 제목', String(word))

  step('6. 저장소와 주고받기도 막히지 않는다')
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(400)
  await page.click('button:has-text("지금 동기화")')
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')]
      .find((one) => /지금 동기화|동기화 중/.test(one.textContent))
    return button && !button.disabled && button.textContent.includes('지금 동기화')
  }, { timeout: 25000 })
  await page.waitForTimeout(800)
  const synced = await page.evaluate(() => {
    const line = [...document.querySelectorAll('.hint')]
      .find((one) => one.textContent.includes('마지막 동기화'))
    return line?.textContent.trim() ?? null
  })
  console.log('  ' + String(synced))
  expect('동기화가 끝까지 감', !String(synced).includes('아직 없습니다'), String(synced))
  const landed = Object.keys(github.currentFiles())
  console.log('  저장소: ' + JSON.stringify(landed))
  expect('저장소에 올라감', landed.length > 0, JSON.stringify(landed))

  step('7. 막힌 것이 하나도 없다')
  const blocked = await page.evaluate(() => window.__csp)
  console.log('  ' + JSON.stringify(blocked))
  expect('CSP 에 걸린 것이 없음', blocked.length === 0, JSON.stringify(blocked))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
  server.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
