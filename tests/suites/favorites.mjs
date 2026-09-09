import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'favorites'), { recursive: true })
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
  const first = window.__mockRoot
  const other = Object.create(Object.getPrototypeOf(first))
  Object.assign(other, { kind: 'directory', name: '다른 폴더', _children: new Map() })
  window.__vaults = { first, other }
  window.__pick = 'first'
  window.showDirectoryPicker = async () => window.__vaults[window.__pick]
})

/** 옆줄은 탭 하나만 그립니다. 접혀 있으면 접힌 쪽 단추로 폅니다. */
const showTab = async (name) => {
  if (await page.locator('.sidebar-tablist').count()) {
    await page.click(`.sidebar-tablist button:has-text("${name}")`)
  } else {
    await page.click(`.sidebar-rail-tabs button[aria-label="${name}"]`)
  }
  await page.waitForTimeout(300)
}
const openVault = async (w) => {
  await page.evaluate((x) => { window.__pick = x; window.__mockRoot = window.__vaults[x] }, w)
  await page.click('button:has-text("폴더 열기")')
  // 트리는 폴더 탭에서만 그려집니다. 어느 탭으로 열리든 서는 것을 기다립니다.
  await page.waitForSelector('.sidebar-tabs', { timeout: 10000 })
  await page.waitForTimeout(500)
}
const closeVault = async () => {
  if (await page.locator('.sheet-close').count()) { await page.click('.sheet-close'); await page.waitForTimeout(200) }
  // 폴더 닫기는 트리 뿌리 줄에 있습니다.
  await showTab('폴더')
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const star = async (label) => {
  await showTab('폴더')
  await page.hover(`.tree-row:has-text("${label}")`)
  await page.click(`.tree-row:has-text("${label}") .tree-tools button[aria-label^="즐겨찾기"]`)
  await page.waitForTimeout(400)
}
const listed = async () => {
  await showTab('즐겨찾기')
  return page.evaluate(() =>
    [...document.querySelectorAll('.favorites-name')].map((n) => n.textContent))
}
/** 지금 탭에 무엇이 그려져 있는지. */
const pane = () => page.evaluate(() => ({
  favorites: document.querySelectorAll('.favorites-list li').length,
  tree: document.querySelectorAll('.tree-row').length,
  search: document.querySelectorAll('.search-input').length,
  placeholder: document.querySelector('.search-input')?.getAttribute('placeholder') ?? null,
  empty: document.querySelector('.panel-empty')?.textContent ?? null,
}))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await openVault('first')

  step('1. 담아 둔 것이 없으면 왜 비었는지 알려 준다')
  await showTab('즐겨찾기')
  const blank = await pane()
  console.log('  ' + JSON.stringify(blank))
  expect('목록이 없음', blank.favorites === 0, JSON.stringify(blank))
  expect('빈 까닭이 적혀 있음', (blank.empty ?? '').includes('담아 둔 것이 없습니다'),
    JSON.stringify(blank))

  step('2. 문서를 담으면 위쪽에 나온다')
  await star('개발 환경')
  const one = await listed()
  console.log('  ' + JSON.stringify(one))
  expect('목록에 나옴', JSON.stringify(one) === '["개발 환경.md"]', JSON.stringify(one))
  await showTab('폴더')
  expect('트리 줄에도 별이 붙음',
    (await page.locator('.tree-row:has-text("개발 환경") .tree-star').count()) === 1)

  step('3. 폴더도 담긴다')
  await star('회사')
  const two = await listed()
  console.log('  ' + JSON.stringify(two))
  expect('둘이 됨', two.length === 2, JSON.stringify(two))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'favorites', '01-list.png'),
    clip: { x: 0, y: 40, width: 470, height: 320 } })

  step('4. 눌러서 바로 연다')
  await showTab('즐겨찾기')
  await page.click('.favorites-item:has-text("개발 환경.md")')
  await page.waitForSelector('.editor', { timeout: 8000 })
  expect('그 문서가 열림', (await page.textContent('.info-path')).trim() === '/개발 환경.md',
    await page.textContent('.info-path'))
  await showTab('즐겨찾기')
  await page.click('.favorites-item:has-text("회사")')
  await page.waitForFunction(() => document.querySelector('.info-kind')?.textContent === '폴더',
    { timeout: 8000 })
  expect('폴더도 열림', (await page.textContent('.info-path')).trim() === '/회사',
    await page.textContent('.info-path'))

  step('5. 폴더를 닫았다 다시 열어도 남는다')
  await closeVault()
  await openVault('first')
  await page.waitForTimeout(400)
  const kept = await listed()
  console.log('  ' + JSON.stringify(kept))
  expect('그대로 있음', kept.length === 2, JSON.stringify(kept))

  step('6. 폴더마다 따로다')
  await closeVault()
  await openVault('other')
  await showTab('즐겨찾기')
  expect('다른 폴더에는 없음', (await page.locator('.favorites-list li').count()) === 0)
  await closeVault()
  await openVault('first')
  expect('원래 폴더에는 그대로', (await listed()).length === 2)

  step('7. 이름을 바꾸면 따라간다')
  await showTab('폴더')
  await page.hover('.tree-row:has-text("개발 환경")')
  await page.click('.tree-row:has-text("개발 환경") .tree-tools button[aria-label="이름 바꾸기"]')
  await page.waitForSelector('.dialog-input')
  await page.fill('.dialog-input', '개발 안내.md')
  await page.click('.dialog button:has-text("바꾸기")')
  await page.waitForTimeout(800)
  const renamed = await listed()
  console.log('  ' + JSON.stringify(renamed))
  expect('바뀐 이름으로 남음', renamed.includes('개발 안내.md'), JSON.stringify(renamed))
  expect('옛 이름은 사라짐', !renamed.includes('개발 환경.md'), JSON.stringify(renamed))

  step('8. 지우면 함께 빠진다')
  await showTab('폴더')
  await page.hover('.tree-row:has-text("개발 안내")')
  await page.click('.tree-row:has-text("개발 안내") .tree-tools button[aria-label="삭제"]')
  await page.waitForSelector('.dialog')
  await page.click('.dialog button:has-text("삭제")')
  await page.waitForTimeout(800)
  const afterDelete = await listed()
  console.log('  ' + JSON.stringify(afterDelete))
  expect('목록에서 빠짐', !afterDelete.includes('개발 안내.md'), JSON.stringify(afterDelete))

  step('9. 목록에서 바로 뺄 수 있다')
  await showTab('즐겨찾기')
  await page.click('.favorites-drop')
  await page.waitForTimeout(400)
  const emptied = await pane()
  expect('마지막 하나를 빼면 빈 안내가 남음',
    emptied.favorites === 0 && emptied.empty !== null, JSON.stringify(emptied))
  await showTab('폴더')
  expect('트리의 별도 꺼짐', (await page.locator('.tree-star').count()) === 0)

  step('10. 탭을 고르면 그 쪽만 보인다')
  /*
   * 한 화면에 둘을 같이 두지 않습니다. 좁은 칸을 나눠 쓰면 양쪽 다 몇 줄씩만 보입니다.
   * 찾는 칸은 두 탭에 다 있지만 하는 일이 다릅니다. 그쪽은 search 묶음에서 봅니다.
   */
  await star('회사')
  await star('회고')
  await showTab('즐겨찾기')
  const onFav = await pane()
  console.log('  즐겨찾기 탭: ' + JSON.stringify(onFav))
  expect('즐겨찾기가 보임', onFav.favorites > 0, JSON.stringify(onFav))
  expect('트리는 안 보임', onFav.tree === 0, JSON.stringify(onFav))
  expect('찾는 칸은 즐겨찾기용', onFav.placeholder === '즐겨찾기에서 찾기', JSON.stringify(onFav))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'favorites', '02-tab-favorites.png'),
    clip: { x: 0, y: 40, width: 470, height: 360 } })

  await showTab('폴더')
  const onTree = await pane()
  console.log('  폴더 탭:     ' + JSON.stringify(onTree))
  expect('트리가 보임', onTree.tree > 0, JSON.stringify(onTree))
  expect('즐겨찾기는 안 보임', onTree.favorites === 0, JSON.stringify(onTree))
  expect('찾는 칸은 문서 검색용', onTree.placeholder === '문서 검색', JSON.stringify(onTree))

  step('11. 많이 담아도 제 칸 안에서 굴러간다')
  await page.setViewportSize({ width: 1400, height: 400 })
  // 담을 것이 넉넉해야 넘칩니다. 폴더를 펴서 안쪽 문서까지 꺼내 둡니다.
  for (const label of ['첨부', '회고', '회사']) {
    await page.click(`.tree-row:has-text("${label}") .tree-caret`).catch(() => {})
    await page.waitForTimeout(150)
  }
  const names = await page.evaluate(() =>
    [...document.querySelectorAll('.tree-row:not(.tree-root) .tree-name')].map((n) => n.textContent))
  for (const name of names.slice(0, 8)) {
    await page.hover(`.tree-row:has-text("${name}")`).catch(() => {})
    await page.click(`.tree-row:has-text("${name}") .tree-tools button[aria-label="즐겨찾기에 담기"]`)
      .catch(() => {})
    await page.waitForTimeout(120)
  }
  await showTab('즐겨찾기')
  const scrolls = await page.evaluate(() => {
    const over = (el) => Boolean(el) && el.scrollHeight > el.clientHeight + 1
    return {
      pane: over(document.querySelector('.sidebar-scroll')),
      outer: over(document.querySelector('.sidebar-panes')),
      tabsVisible: Boolean(document.querySelector('.sidebar-tablist')),
    }
  })
  console.log('  ' + JSON.stringify(scrolls))
  expect('칸 안에서 굴러감', scrolls.pane, JSON.stringify(scrolls))
  expect('바깥은 굴러가지 않음', !scrolls.outer, JSON.stringify(scrolls))
  expect('탭 줄은 붙박이로 남음', scrolls.tabsVisible, JSON.stringify(scrolls))
  await page.setViewportSize({ width: 1400, height: 920 })

  step('12. 접으면 탭 단추만 남고, 누르면 펴면서 그 탭으로 간다')
  await page.click('.sidebar-toggle')
  await page.waitForTimeout(400)
  const railed = await page.evaluate(() => ({
    rail: document.querySelectorAll('.sidebar-rail-tabs button').length,
    tablist: document.querySelectorAll('.sidebar-tablist').length,
    search: document.querySelectorAll('.search-input').length,
    width: Math.round(document.querySelector('.sidebar').getBoundingClientRect().width),
  }))
  console.log('  접힘: ' + JSON.stringify(railed))
  expect('탭 단추 둘이 섬', railed.rail === 2, JSON.stringify(railed))
  expect('펼친 탭 줄은 사라짐', railed.tablist === 0, JSON.stringify(railed))
  expect('검색란도 사라짐', railed.search === 0, JSON.stringify(railed))
  expect('폭이 단추만큼으로 줄어듦', railed.width < 80, String(railed.width))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'favorites', '03-rail.png'),
    clip: { x: 0, y: 40, width: 200, height: 260 } })

  await page.click('.sidebar-rail-tabs button[aria-label="폴더"]')
  await page.waitForTimeout(400)
  const toTree = await page.evaluate(() => ({
    active: document.querySelector('.sidebar-tablist button[aria-selected="true"]')?.textContent,
    tree: document.querySelectorAll('.tree-row').length,
  }))
  console.log('  폴더 단추: ' + JSON.stringify(toTree))
  expect('펴면서 폴더 탭으로 감', toTree.active === '폴더', JSON.stringify(toTree))
  expect('트리가 바로 보임', toTree.tree > 0, JSON.stringify(toTree))

  await page.click('.sidebar-toggle')
  await page.waitForTimeout(400)
  await page.click('.sidebar-rail-tabs button[aria-label="즐겨찾기"]')
  await page.waitForTimeout(400)
  const toFav = await page.evaluate(() => ({
    active: document.querySelector('.sidebar-tablist button[aria-selected="true"]')?.textContent,
    favorites: document.querySelectorAll('.favorites-list li').length,
  }))
  console.log('  즐겨찾기 단추: ' + JSON.stringify(toFav))
  expect('펴면서 즐겨찾기 탭으로 감', toFav.active === '즐겨찾기', JSON.stringify(toFav))
  expect('목록이 바로 보임', toFav.favorites > 0, JSON.stringify(toFav))

  step('13. 새로고침해도 고른 탭으로 열린다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault('first')
  const remembered = await page.evaluate(() =>
    document.querySelector('.sidebar-tablist button[aria-selected="true"]')?.textContent)
  console.log('  ' + String(remembered))
  expect('즐겨찾기 탭으로 열림', remembered === '즐겨찾기', String(remembered))
  // 이 시험대의 목 폴더는 새로고침하면 새로 생깁니다. 볼 것이 있어야 하니 하나 담습니다.
  await star('개발 환경')

  step('14. 폴더 안 파일에 적히고 트리에는 안 보인다')
  const onDisk = await page.evaluate(async () => {
    const names = [...window.__mockRoot._children.keys()]
    let body = null
    try {
      const handle = await window.__mockRoot.getFileHandle('_t-wiki.favorites.json')
      body = await (await handle.getFile()).text()
    } catch { /* 없으면 null */ }
    return { names, body }
  })
  console.log('  폴더 안: ' + JSON.stringify(onDisk.names))
  console.log('  파일 내용: ' + String(onDisk.body).replace(/\s+/g, ' '))
  expect('파일이 만들어짐', onDisk.names.includes('_t-wiki.favorites.json'),
    JSON.stringify(onDisk.names))
  expect('담아 둔 것이 적혀 있음', Array.isArray(JSON.parse(onDisk.body ?? 'null')),
    String(onDisk.body))
  expect('트리에는 보이지 않음',
    (await page.locator('.tree-row:has-text("_t-wiki.favorites")').count()) === 0)

  step('15. 브라우저에 아무것도 없어도 폴더 안 파일에서 읽어 온다')
  /*
   * 브라우저 저장소를 비워 딴 기기에서 온 것처럼 만듭니다. 새로고침은 하지 않습니다.
   * 이 시험대의 목 폴더는 새로고침하면 새로 생겨, 정작 봐야 할 파일이 사라집니다.
   */
  await page.evaluate(async () => {
    await new Promise((done) => {
      const req = indexedDB.deleteDatabase('keyval-store')
      req.onsuccess = () => done(); req.onerror = () => done(); req.onblocked = () => done()
    })
  })
  await closeVault()
  await openVault('first')
  await page.waitForTimeout(600)
  const carried = await listed()
  console.log('  ' + JSON.stringify(carried))
  expect('파일에서 읽어 옴', carried.length > 0, JSON.stringify(carried))

  step('16. 담긴 것마다 이름 아래에 어디에 있는 것인지 붙는다')
  await showTab('폴더')
  // 폴더가 펴져 있는지는 앞 걸음에 따라 다릅니다. 아이가 보일 때까지 두드립니다.
  for (let tries = 0; tries < 3; tries += 1) {
    if (await page.locator('.tree-row:has-text("온보딩")').count()) break
    await page.click('.tree-row:has-text("회사") .tree-caret')
    await page.waitForTimeout(400)
  }
  await star('온보딩')
  await showTab('즐겨찾기')
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.favorites-list li')].map((li) => {
      const name = li.querySelector('.favorites-name')
      const path = li.querySelector('.favorites-path')
      return {
        name: name?.textContent ?? null,
        path: path?.textContent ?? null,
        // 툴팁은 걷어냈습니다. 두 줄에 이미 다 적혀 있습니다.
        tip: li.querySelector('.favorites-item')?.getAttribute('data-tip') ?? null,
        // 눈에 덜 띄어야 이름을 가리지 않습니다. 색이 갈리는지만 봅니다.
        dimmer: path
          ? getComputedStyle(path).color !== getComputedStyle(name).color
          : null,
      }
    }))
  console.log('  ' + JSON.stringify(rows))
  const nested = rows.find((row) => row.name === '온보딩.md')
  expect('폴더 안 문서는 경로가 붙음', nested?.path === '/회사/온보딩.md', JSON.stringify(nested))
  expect('이름보다 흐림', nested?.dimmer === true, JSON.stringify(nested))
  const top = rows.find((row) => row.name === '개발 환경.md')
  expect('최상위 것에도 붙음', top?.path === '/개발 환경.md', JSON.stringify(top))
  expect('하나도 빠지지 않음', rows.every((row) => row.path), JSON.stringify(rows))
  expect('툴팁은 걷어냄', rows.every((row) => row.tip === null), JSON.stringify(rows))

  // 폴더도 담아 봅니다. 파일만 되고 폴더는 빠지는 일이 없어야 합니다.
  await star('회고')
  await showTab('즐겨찾기')
  const withDir = await page.evaluate(() =>
    [...document.querySelectorAll('.favorites-list li')].map((li) => ({
      name: li.querySelector('.favorites-name')?.textContent ?? null,
      path: li.querySelector('.favorites-path')?.textContent ?? null,
    })))
  console.log('  ' + JSON.stringify(withDir))
  const dir = withDir.find((row) => row.name === '회고')
  expect('폴더에도 붙음', dir?.path === '/회고', JSON.stringify(dir))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'favorites', '04-path.png'),
    clip: { x: 0, y: 40, width: 460, height: 320 } })

  step('17. 끌어다 놓아 차례를 바꾼다')
  await showTab('즐겨찾기')
  const order = await listed()
  console.log('  처음: ' + JSON.stringify(order))
  const rows2 = page.locator('.favorites-list li')
  const count = await rows2.count()
  expect('셋 이상 담겨 있음', count >= 3, String(count))

  // 맨 아래 줄을 맨 윗줄의 위쪽 절반에 떨어뜨립니다. 그러면 그 앞에 끼어듭니다.
  await rows2.nth(count - 1).dragTo(rows2.nth(0), { targetPosition: { x: 30, y: 3 } })
  await page.waitForTimeout(500)
  const lifted = await listed()
  console.log('  올린 뒤: ' + JSON.stringify(lifted))
  expect('맨 아래가 맨 위로 옴', lifted[0] === order[count - 1], JSON.stringify(lifted))
  expect('나머지 차례는 그대로',
    JSON.stringify(lifted.slice(1)) === JSON.stringify(order.slice(0, count - 1)),
    JSON.stringify(lifted))

  // 아래쪽 절반에 놓으면 그 뒤로 갑니다.
  await rows2.nth(0).dragTo(rows2.nth(1), { targetPosition: { x: 30, y: 34 } })
  await page.waitForTimeout(500)
  const swapped = await listed()
  console.log('  내린 뒤: ' + JSON.stringify(swapped))
  expect('첫 줄이 둘째 뒤로 감',
    swapped[0] === lifted[1] && swapped[1] === lifted[0], JSON.stringify(swapped))

  step('18. 바꾼 차례가 파일에 적히고 폴더를 다시 열어도 남는다')
  const written = await page.evaluate(async () => {
    const handle = await window.__mockRoot.getFileHandle('_t-wiki.favorites.json')
    return (await handle.getFile()).text()
  })
  const saved = JSON.parse(written)
  console.log('  파일: ' + JSON.stringify(saved))
  expect('파일의 차례도 화면과 같음',
    saved.map((one) => one.split('/').pop()).join() === swapped.join(), written)
  await closeVault()
  await openVault('first')
  const reopened = await listed()
  console.log('  다시 연 뒤: ' + JSON.stringify(reopened))
  expect('다시 열어도 그 차례', JSON.stringify(reopened) === JSON.stringify(swapped),
    JSON.stringify(reopened))

  step('19. 끌지 않고 자판으로도 옮긴다')
  await page.click('.favorites-list li:first-child .favorites-item')
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForTimeout(400)
  const byKey = await listed()
  console.log('  ' + JSON.stringify(byKey))
  expect('한 칸 내려감', byKey[0] === reopened[1] && byKey[1] === reopened[0],
    JSON.stringify(byKey))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'favorites', '05-order.png'),
    clip: { x: 0, y: 40, width: 460, height: 320 } })

  /*
   * 걸러 보는 중에는 화면의 줄과 목록의 번호가 어긋납니다.
   * 번호로 옮기면 가려져 있던 줄이 엉뚱하게 끌려 나옵니다.
   */
  step('20. 걸러 본 채로 옮겨도 가려진 줄은 제자리에 남는다')
  await page.fill('.search-input', '.md')
  await page.waitForTimeout(400)
  const pair = page.locator('.favorites-list li')
  const showing = await pair.count()
  expect('두 줄만 보임', showing === 2, String(showing))
  await pair.nth(1).dragTo(pair.nth(0), { targetPosition: { x: 30, y: 3 } })
  await page.waitForTimeout(500)
  await page.fill('.search-input', '')
  await page.waitForTimeout(400)
  const all = await listed()
  console.log('  ' + JSON.stringify(all))
  expect('가려졌던 줄은 제자리', all[0] === byKey[0], JSON.stringify(all))
  expect('보이던 둘만 자리를 바꿈', all[1] === byKey[2] && all[2] === byKey[1],
    JSON.stringify(all))

  step('21. 콘솔 오류')
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
