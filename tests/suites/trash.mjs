import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'trash'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1300, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.route('https://api.github.com/**', github.handler)
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(() => window.__installMockFs())

/** 가짜 폴더 안의 이름 목록. 경로를 따라 내려가 그 폴더의 아이들을 봅니다. */
const names = (dir = '') => page.evaluate((path) => {
  let node = window.__mockRoot
  for (const part of path.split('/').filter(Boolean)) node = node._children.get(part)
  return node ? [...node._children.keys()].sort() : null
}, dir)
const rows = () => page.evaluate(() =>
  [...document.querySelectorAll('.tree-row .tree-name')].map((one) => one.textContent))
const trashCount = () => page.evaluate(() => Number(document.querySelector('.trash-row-count')?.textContent))
const listed = () => page.evaluate(() =>
  [...document.querySelectorAll('.trash-item')].map((one) => ({
    name: one.querySelector('.trash-name').textContent,
    meta: one.querySelector('.trash-meta').textContent,
  })))
/** 가로로 긴 그림. 미리보기 칸에서 비율이 찌그러지지 않아야 합니다. */
const WIDE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="600">'
  + '<rect width="120" height="600" fill="#4a7"/></svg>'

const manifest = async () => JSON.parse(await page.evaluate(() => window.__vaultText('_t-wiki.trash/_index.json')))
/** 시험 도중 없앤 파일을 다시 심고 트리를 새로 읽습니다. */
const seed = async (path, text) => {
  await page.evaluate(([where, body]) => {
    const parts = where.split('/')
    const name = parts.pop()
    let dir = window.__mockRoot
    for (const part of parts) dir = dir._children.get(part)
    const sample = window.__mockRoot._children.get('첨부')
    dir._children.set(name, Object.assign(Object.create(Object.getPrototypeOf(sample._children.get('도표.svg'))),
      { kind: 'file', name, _data: body, _lastModified: Date.now() }))
  }, [path, text])
  await page.click('.tree-root button[aria-label="새로고침"]')
  await page.waitForTimeout(500)
}
const remove = async (label, how) => {
  await page.hover(`.tree-row:has-text("${label}")`)
  await page.click(`.tree-row:has-text("${label}") .tree-tools button[aria-label="삭제"]`)
  await page.waitForSelector('.dialog')
  await page.click(`.dialog button:has-text("${how}")`)
  await page.waitForTimeout(700)
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(400)

  step('1. 지우면 휴지통으로 옮길지 묻고, 옮기면 트리에서 사라진다')
  expect('처음엔 휴지통이 비어 있음', (await trashCount()) === 0)
  await page.click('.tree-row:has-text("회사") .tree-caret')
  await page.waitForTimeout(300)
  await page.hover('.tree-row:has-text("온보딩")')
  await page.click('.tree-row:has-text("온보딩") .tree-tools button[aria-label="삭제"]')
  await page.waitForSelector('.dialog')
  const asked = await page.evaluate(() =>
    [...document.querySelectorAll('.dialog button')].map((one) => one.textContent.trim()))
  console.log('  단추: ' + JSON.stringify(asked))
  expect('휴지통과 완전 삭제를 고르게 함',
    asked.includes('휴지통으로 이동') && asked.includes('완전 삭제') && asked.includes('취소'), JSON.stringify(asked))
  await page.click('.dialog button:has-text("휴지통으로 이동")')
  await page.waitForTimeout(700)
  expect('트리에서 사라짐', !(await rows()).includes('온보딩.md'), JSON.stringify(await rows()))
  expect('휴지통 셈이 1', (await trashCount()) === 1, String(await trashCount()))
  const stored = await manifest()
  console.log('  목록: ' + JSON.stringify(stored))
  expect('원래 자리가 적힘', stored.length === 1 && stored[0].path === '회사/온보딩.md' && stored[0].kind === 'file',
    JSON.stringify(stored))
  expect('옮긴 때가 적힘', Math.abs(Date.now() - stored[0].trashedAt) < 60_000, String(stored[0].trashedAt))
  const inTrash = await names(`_t-wiki.trash/${stored[0].id}`)
  expect('파일이 휴지통 칸 안에 있음', JSON.stringify(inTrash) === '["온보딩.md"]', JSON.stringify(inTrash))
  expect('원래 자리에는 없음', !(await names('회사')).includes('온보딩.md'), JSON.stringify(await names('회사')))

  step('2. 휴지통 화면에 원래 자리와 때가 보인다')
  // 아이콘이 글자의 밑줄에 앉아 한 픽셀씩 내려가 보이던 것. 가운데가 맞아야 합니다.
  await page.click('.trash-row')
  await page.waitForSelector('.trash-view', { timeout: 5000 })
  const iconAt = await page.evaluate(() => {
    const button = document.querySelector('.trash-head .btn')
    const icon = button.querySelector('.icon')
    const one = button.getBoundingClientRect()
    const other = icon.getBoundingClientRect()
    return Math.round(Math.abs((one.top + one.bottom) / 2 - (other.top + other.bottom) / 2))
  })
  console.log('  아이콘과 단추의 가운데 차이: ' + iconAt)
  expect('아이콘이 글자와 가운데를 맞춤', iconAt <= 1, String(iconAt))
  await page.click('.trash-row')
  await page.waitForSelector('.trash-view', { timeout: 5000 })
  const shown = await listed()
  console.log('  ' + JSON.stringify(shown))
  expect('지운 것이 보임', shown.length === 1 && shown[0].name === '온보딩.md', JSON.stringify(shown))
  expect('원래 폴더가 적힘', shown[0].meta.includes('/회사'), shown[0].meta)
  expect('때가 적힘', /\d{4}\. \d{2}\. \d{2}\./.test(shown[0].meta), shown[0].meta)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'trash', '01-view.png'),
    clip: { x: 0, y: 40, width: 1300, height: 420 } })

  /*
   * 되돌릴지 없앨지 정하려면 이름과 자리만으로는 모자랄 때가 있습니다(README.md 가 여럿).
   * 고치지는 못하고 앞부분만 읽습니다.
   */
  step('3. 미리보기로 무엇이었는지 앞부분만 본다')
  await page.click('.trash-item button:has-text("미리보기")')
  await page.waitForSelector('.trash-peek-text', { timeout: 5000 })
  const peeked = await page.textContent('.trash-peek-text')
  console.log('  ' + peeked.replace(/\s+/g, ' ').slice(0, 60))
  expect('글 앞부분이 보임', peeked.includes('온보딩'), peeked.slice(0, 60))
  // 짧은 글이어도 칸 키는 그대로입니다. 줄마다 키가 달라지면 목록이 들썩입니다.
  const textPeekHeight = await page.evaluate(() =>
    Math.round(document.querySelector('.trash-peek-text').getBoundingClientRect().height))
  console.log('  글 칸 키: ' + textPeekHeight)
  expect('고치는 칸은 없음', (await page.locator('.trash-view .editor').count()) === 0)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'trash', '02-peek.png'),
    clip: { x: 0, y: 40, width: 1300, height: 420 } })
  // 다시 누르면 접힙니다. 한 번에 한 줄만 펴 둡니다.
  await page.click('.trash-item button:has-text("미리보기")')
  await page.waitForTimeout(300)
  expect('다시 누르면 접힘', (await page.locator('.trash-peek').count()) === 0)

  /*
   * 엿보는 칸은 글이든 그림이든 폴더든 같은 키입니다. 그림은 그 안에서 제 비율대로 줄어듭니다.
   * 예전에는 그림에 곧바로 키만 물려, 세로로 쌓는 칸에서 가로로 늘어나 찌그러졌습니다.
   */
  step('4. 그림은 비율을 지킨 채 같은 키의 칸 안에 앉는다')
  await seed('넓은 그림.svg', WIDE_SVG)
  await remove('넓은 그림', '휴지통으로 이동')
  await page.click('.trash-row')
  await page.waitForSelector('.trash-view')
  await page.click('.trash-item:has-text("넓은 그림") button:has-text("미리보기")')
  await page.waitForSelector('.trash-peek-figure img', { timeout: 5000 })
  await page.waitForTimeout(400)
  const shot = await page.evaluate(() => {
    const img = document.querySelector('.trash-peek-image')
    const box = img.getBoundingClientRect()
    return {
      칸: Math.round((document.querySelector('.trash-peek-figure') ?? img).getBoundingClientRect().height),
      비율: Math.round((box.width / box.height) * 100) / 100,
      원본비율: Math.round((img.naturalWidth / img.naturalHeight) * 100) / 100,
      키: Math.round(box.height),
    }
  })
  console.log('  ' + JSON.stringify(shot))
  expect('그림이 제 비율 그대로', Math.abs(shot.비율 - shot.원본비율) < 0.05, JSON.stringify(shot))
  expect('칸을 넘지 않음', shot.키 <= shot.칸, JSON.stringify(shot))
  // 글이든 그림이든 같은 키입니다.
  expect('글 칸과 같은 키', shot.칸 === textPeekHeight, `${textPeekHeight} vs ${shot.칸}`)
  await page.click('.trash-item:has-text("넓은 그림") button:has-text("미리보기")')
  await page.waitForTimeout(200)
  await page.click('.trash-item:has-text("넓은 그림") button:has-text("완전 삭제")')
  await page.waitForSelector('.dialog', { timeout: 3000 })
  await page.click('.dialog button:has-text("완전 삭제")')
  await page.waitForTimeout(500)

  step('5. 복원하면 원래 자리로 돌아간다')
  await page.click('.trash-item button:has-text("복원")')
  await page.waitForTimeout(800)
  expect('원래 자리에 돌아옴', (await names('회사')).includes('온보딩.md'), JSON.stringify(await names('회사')))
  expect('휴지통이 비었음', (await trashCount()) === 0 && (await listed()).length === 0)
  expect('휴지통 칸이 치워짐', JSON.stringify(await names('_t-wiki.trash')) === '["_index.json"]',
    JSON.stringify(await names('_t-wiki.trash')))
  expect('트리에도 돌아옴', (await rows()).includes('온보딩.md'), JSON.stringify(await rows()))

  step('6. 폴더도 통째로 갔다 돌아온다')
  await remove('회고', '휴지통으로 이동')
  expect('폴더가 트리에서 사라짐', !(await rows()).includes('회고'), JSON.stringify(await rows()))
  const folderItem = (await manifest())[0]
  expect('폴더로 적힘', folderItem.kind === 'dir' && folderItem.path === '회고', JSON.stringify(folderItem))
  const inside = await names(`_t-wiki.trash/${folderItem.id}/회고`)
  expect('안엣것까지 함께 감', inside !== null && inside.includes('2026-08.md'), JSON.stringify(inside))
  await page.click('.trash-row')
  await page.waitForSelector('.trash-view')
  // 폴더는 안에 무엇이 들었는지를 대신 늘어놓습니다.
  await page.click('.trash-item button:has-text("미리보기")')
  await page.waitForSelector('.trash-peek-entries', { timeout: 5000 })
  const insideShown = await page.evaluate(() =>
    [...document.querySelectorAll('.trash-peek-entries li')].map((one) => one.textContent))
  console.log('  ' + JSON.stringify(insideShown))
  expect('폴더 안엣것이 보임', insideShown.includes('2026-08.md'), JSON.stringify(insideShown))
  await page.click('.trash-item button:has-text("미리보기")')
  await page.waitForTimeout(200)
  await page.click('.trash-item button:has-text("복원")')
  await page.waitForTimeout(800)
  expect('폴더가 돌아옴', (await names('회고'))?.includes('2026-08.md') ?? false, JSON.stringify(await names('회고')))

  step('7. 복원할 자리에 다른 것이 있으면 묻는다')
  await remove('휴가 정책', '휴지통으로 이동')
  // 같은 이름의 새 문서를 그 자리에 만들어 둡니다.
  await page.evaluate(() => {
    const dir = window.__mockRoot._children.get('회사')
    const sample = window.__mockRoot._children.get('개발 환경.md')
    dir._children.set('휴가 정책.md', Object.assign(Object.create(Object.getPrototypeOf(sample)),
      { kind: 'file', name: '휴가 정책.md', _data: '# 새로 쓴 것\n', _lastModified: Date.now() }))
  })
  await page.click('.trash-row')
  await page.waitForSelector('.trash-view')
  await page.click('.trash-item button:has-text("복원")')
  await page.waitForSelector('.dialog', { timeout: 5000 })
  const collide = await page.textContent('.dialog')
  expect('같은 이름이 있다고 알림', collide.includes('같은 이름이 있습니다'), collide.slice(0, 100))
  await page.click('.dialog button:has-text("취소")')
  await page.waitForTimeout(400)
  expect('취소하면 그대로', (await trashCount()) === 1
    && (await page.evaluate(() => window.__vaultText('회사/휴가 정책.md'))).startsWith('# 새로 쓴 것'))
  await page.click('.trash-item button:has-text("복원")')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("덮어쓰기")')
  await page.waitForTimeout(800)
  const restoredText = await page.evaluate(() => window.__vaultText('회사/휴가 정책.md'))
  expect('덮어쓰면 휴지통의 것이 돌아옴', restoredText.includes('연차'), restoredText)
  expect('휴지통이 비었음', (await trashCount()) === 0)

  step('8. 완전 삭제와 휴지통 비우기는 확인을 받고 없앤다')
  await remove('개발 환경', '휴지통으로 이동')
  await remove('휴가 정책', '휴지통으로 이동')
  await remove('온보딩', '완전 삭제')
  expect('완전 삭제는 휴지통에 들지 않음', (await trashCount()) === 2 && !(await names('회사')).includes('온보딩.md'))
  await page.click('.trash-row')
  await page.waitForSelector('.trash-view')
  await page.click('.trash-item:has-text("개발 환경") button:has-text("완전 삭제")')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("취소")')
  await page.waitForTimeout(300)
  expect('취소하면 남아 있음', (await listed()).length === 2)
  const purgeId = (await manifest()).find((one) => one.path === '개발 환경.md').id
  await page.click('.trash-item:has-text("개발 환경") button:has-text("완전 삭제")')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("완전 삭제")')
  await page.waitForTimeout(600)
  const afterPurge = await listed()
  expect('그것만 없어짐', afterPurge.length === 1 && afterPurge[0].name === '휴가 정책.md', JSON.stringify(afterPurge))
  expect('디스크에서도 없어짐', !(await names('_t-wiki.trash')).includes(purgeId), JSON.stringify(await names('_t-wiki.trash')))
  await page.click('button:has-text("휴지통 비우기")')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("휴지통 비우기")')
  await page.waitForTimeout(600)
  expect('비우면 다 없어짐', (await listed()).length === 0 && (await trashCount()) === 0)
  expect('칸도 다 치워짐', JSON.stringify(await names('_t-wiki.trash')) === '["_index.json"]',
    JSON.stringify(await names('_t-wiki.trash')))

  step('9. 폴더를 다시 열어도 휴지통이 남아 있다')
  // 앞에서 없앤 파일을 다시 심어 둡니다.
  await seed('회사/휴가 정책.md', '# 휴가 정책\n\n연차는 15일입니다.\n')
  await seed('개발 환경.md', '# 개발 환경\n\nNode 20 을 씁니다.\n')
  await remove('휴가 정책', '휴지통으로 이동')
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
  expect('다시 열어도 셈이 1', (await trashCount()) === 1, String(await trashCount()))
  expect('휴지통이 트리에 폴더로 나오지 않음', !(await rows()).some((one) => one.includes('_t-wiki')),
    JSON.stringify(await rows()))

  step('10. 휴지통은 동기화되지 않고, 설정을 켜면 오래된 것만 비운다')
  // 하나는 31일 전에 옮긴 것으로 꾸밉니다.
  await remove('개발 환경', '휴지통으로 이동')
  await page.evaluate(async () => {
    const file = window.__mockRoot._children.get('_t-wiki.trash')._children.get('_index.json')
    const items = JSON.parse(await (await file.getFile()).text())
    items.find((one) => one.path === '회사/휴가 정책.md').trashedAt = Date.now() - 31 * 86_400_000
    file._data = JSON.stringify(items)
    file._lastModified = Date.now()
  })
  // 저장소를 맞추되, 아직 저절로 비우기는 끕니다.
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(400)
  await page.click('.sheet-close')
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), undefined, { timeout: 30000 })
  await page.waitForTimeout(500)
  if (await page.locator('.sheet-close').count()) await page.click('.sheet-close')
  const uploaded = Object.keys(github.currentFiles())
  console.log('  올라간 것: ' + JSON.stringify(uploaded))
  expect('휴지통은 올라가지 않음', !uploaded.some((one) => one.includes('_t-wiki.trash')), JSON.stringify(uploaded))
  expect('설정을 끄면 오래된 것도 남음', (await trashCount()) === 2, String(await trashCount()))

  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav .settings-nav-item:text-is("휴지통")')
  await page.waitForTimeout(500)
  await page.click('.checkbox:has-text("옮긴 지 오래된") input')
  const days = await page.inputValue('#trash-days')
  expect('기본은 30일', days === '30', days)
  await page.click('.sheet-close')
  await page.click('.topbar button:has-text("GitHub 동기화")')
  await page.waitForFunction(() => !document.querySelector('.topbar button[disabled]'), undefined, { timeout: 30000 })
  await page.waitForTimeout(600)
  const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? null)
  console.log('  알림: ' + String(toast))
  if (await page.locator('.sheet-close').count()) await page.click('.sheet-close')
  const left = await manifest()
  console.log('  남은 것: ' + JSON.stringify(left.map((one) => one.path)))
  expect('31일 지난 것만 비워짐', left.length === 1 && left[0].path === '개발 환경.md', JSON.stringify(left))
  expect('완료 알림에 비운 셈이 실림', (toast ?? '').includes('휴지통에서 오래된 1개 비움'), String(toast))
  expect('휴지통 셈도 1', (await trashCount()) === 1, String(await trashCount()))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
