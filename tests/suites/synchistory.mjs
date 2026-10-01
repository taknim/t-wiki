import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'synchistory'), { recursive: true })
const problems = []
const step = (n) => console.log('\n>>> ' + n)
const ok = (n) => console.log('  ok  ' + n)
const fail = (n, d) => { problems.push(n); console.log('FAIL  ' + n + '\n      ' + d) }
const expect = (n, c, d = '') => (c ? ok(n) : fail(n, d))

const github = createGitHubMock()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.route('https://api.github.com/**', github.handler)
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

const openVault = async (which) => {
  await page.evaluate((x) => { window.__pick = x; window.__mockRoot = window.__vaults[x] }, which)
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
}
const closeVault = async () => {
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const openSync = async () => {
  if (!(await page.locator('.settings-nav').count())) {
    await page.click('button[aria-label="설정"]')
    await page.waitForSelector('.settings-nav')
  }
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(300)
}
const configure = async (repo) => {
  await openSync()
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', repo)
  await page.waitForTimeout(400)
}
const syncNow = async () => {
  await page.click('button:has-text("지금 동기화")')
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((n) => /지금 동기화|동기화 중/.test(n.textContent))
    return b && !b.disabled && b.textContent.includes('지금 동기화')
  }, { timeout: 25000 })
  await page.waitForTimeout(800)
}
const openHistory = async () => {
  await page.click('button:has-text("지난 결과 보기")')
  await page.waitForSelector('[aria-label="지난 동기화 결과"]', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const closeSheet = async () => {
  await page.click('[aria-label="지난 동기화 결과"] .sheet-close')
  await page.waitForTimeout(300)
}

/** 목록에 늘어선 회차들. */
const rows = () => page.evaluate(() => [...document.querySelectorAll('.run')].map((li) => ({
  when: li.querySelector('.run-when')?.textContent ?? '',
  trigger: li.querySelector('.run-trigger')?.textContent ?? '',
  sum: li.querySelector('.run-sum')?.textContent ?? '',
})))

/** 펼친 회차의 첫 줄. 커밋 이름은 이 줄 안에 있어야 합니다. */
const firstLine = () => page.evaluate(() => {
  const row = document.querySelector('.run .plan li')
  if (!row) return null
  const path = row.querySelector('.plan-path')
  const reason = row.querySelector('.plan-reason')
  const link = row.querySelector('.plan-reason .commit-link')
  return {
    path: path?.textContent ?? '',
    reason: reason?.textContent ?? '',
    sha: link?.textContent ?? null,
    href: link?.getAttribute('href') ?? null,
    target: link?.getAttribute('target') ?? null,
    rel: link?.getAttribute('rel') ?? null,
    // 경로와 까닭의 윗변이 같으면 한 줄에 나란히 선 것입니다.
    sameLine: path && reason
      ? Math.abs(path.getBoundingClientRect().top - reason.getBoundingClientRect().top) < 4
      : false,
  }
})

const detailLink = () => page.evaluate(() => {
  const a = [...document.querySelectorAll('.sheet a.btn')].find((n) => n.textContent.includes('자세히 보기'))
  return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null
})

/*
 * 백 건 넘게 쌓인 상태를 진짜로 만들려면 백 번을 돌려야 합니다.
 * 대신 저장된 자리에 채워 넣고, 다음 한 회차가 넘치는 것을 버리는지 봅니다.
 */
const stuffHistory = (count) => page.evaluate(async (n) => {
  const db = await new Promise((res, rej) => {
    const request = indexedDB.open('keyval-store')
    request.onsuccess = () => res(request.result)
    request.onerror = () => rej(request.error)
  })
  const read = () => new Promise((res, rej) => {
    const request = db.transaction('keyval', 'readonly').objectStore('keyval').get('mdwiki:sync-history')
    request.onsuccess = () => res(request.result)
    request.onerror = () => rej(request.error)
  })
  const store = await read()
  const key = Object.keys(store)[0]
  const filler = Array.from({ length: n }, (_, i) => ({
    at: 1000 + i, trigger: 'auto', commitSha: null, error: null, log: [], cut: 0,
  }))
  store[key] = [...store[key], ...filler]
  const total = store[key].length
  await new Promise((res, rej) => {
    const tx = db.transaction('keyval', 'readwrite')
    tx.objectStore('keyval').put(store, 'mdwiki:sync-history')
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
  return total
}, count)

/** 손으로 지은 회차 하나를 맨 앞에 끼워 넣습니다. 지운 줄까지 갖춘 회차를 만들려면 이 편이 빠릅니다. */
const seedRun = (run) => page.evaluate(async (one) => {
  const db = await new Promise((res, rej) => {
    const request = indexedDB.open('keyval-store')
    request.onsuccess = () => res(request.result)
    request.onerror = () => rej(request.error)
  })
  const store = await new Promise((res, rej) => {
    const request = db.transaction('keyval', 'readonly').objectStore('keyval').get('mdwiki:sync-history')
    request.onsuccess = () => res(request.result)
    request.onerror = () => rej(request.error)
  })
  const key = Object.keys(store)[0]
  store[key] = [one, ...store[key]]
  await new Promise((res, rej) => {
    const tx = db.transaction('keyval', 'readwrite')
    tx.objectStore('keyval').put(store, 'mdwiki:sync-history')
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}, run)

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 아직 돌린 적이 없으면 볼 것도 없다')
  await openVault('first')
  await configure('wiki')
  const idle = await page.locator('button:has-text("지난 결과 보기")').isDisabled()
  expect('단추가 잠겨 있음', idle, String(idle))

  step('2. 한 번 돌리면 그 회차가 남는다')
  await syncNow()
  await openHistory()
  const one = await rows()
  console.log('  ' + JSON.stringify(one))
  expect('한 줄이 생김', one.length === 1, JSON.stringify(one))
  expect('무엇이 올라갔는지 적힘', /올림 \d+/.test(one[0].sum), JSON.stringify(one[0]))
  expect('직접 돌린 것으로 셈', one[0].trigger === '직접', JSON.stringify(one[0]))
  const headLinks = await page.locator('.run .commit-link').count()
  expect('머리줄에는 커밋 링크가 없음', headLinks === 0, String(headLinks))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '01-one.png') })

  step('3. 회차를 누르면 오간 파일이 펴진다')
  const closed = await page.locator('.run .plan li').count()
  await page.click('.run-open')
  await page.waitForTimeout(300)
  const openedRows = await page.locator('.run .plan li').count()
  expect('펴기 전에는 접혀 있음', closed === 0, String(closed))
  expect('펴면 파일이 보임', openedRows > 0, String(openedRows))
  const line = await firstLine()
  console.log('  첫 줄: ' + JSON.stringify(line))
  expect('경로가 적혀 있음', line.path.includes('.md'), line.path)
  expect('까닭이 경로와 한 줄에 섬', line.sameLine, JSON.stringify(line))
  /* 펼친 줄의 밑줄과 회차를 가르는 줄이 겹쳐 두 줄로 그어지면 안 됩니다. */
  const edges = await page.evaluate(() => {
    const last = [...document.querySelectorAll('.run .plan li')].pop()
    const style = last ? getComputedStyle(last) : null
    return { width: style?.borderBottomWidth ?? null }
  })
  expect('마지막 줄에는 밑줄이 없음', edges.width === '0px', JSON.stringify(edges))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '02-open.png') })

  step('4. 그 줄의 커밋 이름이 커밋으로 가는 길이다')
  expect('커밋 이름이 줄 안에 있음',
    line.sha !== null && github.headSha.startsWith(line.sha), line.sha + ' vs ' + github.headSha)
  expect('그 커밋으로 감',
    line.href === 'https://github.com/tester/wiki/commit/' + github.headSha, String(line.href))
  expect('새 탭으로 열림', line.target === '_blank', String(line.target))
  expect('opener 를 넘기지 않음', String(line.rel).includes('noopener'), String(line.rel))
  // 링크로 바꾼 자리에 글자가 남아 두 번 적히면 안 됩니다.
  expect('이름이 한 번만 적힘',
    (line.reason.match(new RegExp(line.sha ?? 'x', 'g')) ?? []).length === 1, line.reason)

  step('5. 자세히 보기는 그 저장소의 커밋 목록으로 간다')
  const link = await detailLink()
  console.log('  ' + JSON.stringify(link))
  expect('저장소와 브랜치가 주소에 들어감',
    link?.href === 'https://github.com/tester/wiki/commits/main/', JSON.stringify(link))
  expect('새 탭으로 열림', link?.target === '_blank', JSON.stringify(link))
  expect('opener 를 넘기지 않음', String(link?.rel).includes('noopener'), JSON.stringify(link))

  step('6. 오갈 것이 없던 회차도 남되, 걸러 볼 수 있다')
  await closeSheet()
  await syncNow()
  await openHistory()
  const two = await rows()
  console.log('  ' + JSON.stringify(two))
  expect('두 줄로 늘어남', two.length === 2, JSON.stringify(two))
  expect('새것이 위에 옴', two[0].sum === '변화 없음', JSON.stringify(two[0]))
  await page.click('.checkbox:has-text("오간 회차만") input')
  await page.waitForTimeout(300)
  const filtered = await rows()
  expect('거르면 한 줄만 남음', filtered.length === 1, JSON.stringify(filtered))
  expect('남은 것은 오간 회차', /올림 \d+/.test(filtered[0].sum), JSON.stringify(filtered[0]))
  await page.click('.checkbox:has-text("오간 회차만") input')
  await page.waitForTimeout(200)

  step('7. 하위 폴더를 정하면 그 아래 커밋만 보러 간다')
  await closeSheet()
  await page.fill('input[placeholder^="저장소 안 하위 폴더"]', '노트')
  await page.waitForTimeout(400)
  await openHistory()
  const under = await detailLink()
  console.log('  ' + JSON.stringify(under))
  expect('하위 폴더가 주소 끝에 붙음',
    under?.href === 'https://github.com/tester/wiki/commits/main/%EB%85%B8%ED%8A%B8/',
    JSON.stringify(under))
  await closeSheet()
  await page.fill('input[placeholder^="저장소 안 하위 폴더"]', '')
  await page.waitForTimeout(400)

  step('8. 새로고침해도 기록은 남는다')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVault('first')
  await openSync()
  await openHistory()
  const kept = await rows()
  console.log('  ' + kept.length + '줄')
  expect('두 줄이 그대로 있음', kept.length === 2, JSON.stringify(kept))

  step('9. 백 건을 넘으면 오래된 것부터 버린다')
  await closeSheet()
  const stuffed = await stuffHistory(150)
  console.log('  채워 넣은 뒤: ' + stuffed + '건')
  await syncNow()
  await openHistory()
  const capped = await rows()
  console.log('  돌린 뒤: ' + capped.length + '줄')
  expect('백 줄에서 멈춤', capped.length === 100, String(capped.length))
  expect('가장 새것이 맨 위', capped[0].when.includes('.'), JSON.stringify(capped[0]))

  /* 자리는 열 줄만 잡고 나머지는 그 안에서 굴려 봅니다. */
  const area = await page.evaluate(() => {
    const list = document.querySelector('.run-list')
    const row = document.querySelector('.run')
    return {
      fits: Math.round(list.clientHeight / row.getBoundingClientRect().height),
      scrolls: list.scrollHeight > list.clientHeight + 4,
    }
  })
  console.log('  ' + JSON.stringify(area))
  expect('열 줄쯤 보임', area.fits === 10, JSON.stringify(area))
  expect('나머지는 굴려 봄', area.scrolls, JSON.stringify(area))

  /*
   * 목록 안에 두면 백 줄을 굴려 내려가야 닿습니다. 창 안에 있는지가 아니라
   * 창의 보이는 테두리 안에 있는지를 봅니다. 굴림 칸 밖으로 밀려난 것도 창 안입니다.
   */
  const reach = await page.evaluate(() => {
    const sheet = document.querySelector('[aria-label="지난 동기화 결과"]')
    const link = [...sheet.querySelectorAll('a.btn')].find((n) => n.textContent.includes('자세히 보기'))
    if (!link) return null
    const box = link.getBoundingClientRect()
    const outer = sheet.getBoundingClientRect()
    return { bottom: Math.round(box.bottom), edge: Math.round(outer.bottom) }
  })
  console.log('  ' + JSON.stringify(reach))
  expect('자세히 보기가 창 테두리 안에 있음',
    reach !== null && reach.bottom <= reach.edge, JSON.stringify(reach))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '03-capped.png') })

  /*
   * 지운 줄까지 갖춘 회차가 있어야 하는데, 여기까지 오는 동안 지운 파일이 없습니다.
   * 손으로 한 회차를 지어 끼워 넣고 폴더를 다시 엽니다.
   */
  step('10. 오간 파일은 눌러서 열고, 지운 파일에는 길을 걸지 않는다')
  await closeSheet()
  await page.click('[aria-label="설정"] .sheet-close')
  await page.waitForTimeout(300)
  await seedRun({
    at: Date.now(),
    trigger: 'manual',
    commitSha: null,
    error: null,
    cut: 0,
    log: [
      { path: '회사/온보딩.md', action: 'upload-update', status: 'ok', detail: '로컬에서 수정' },
      { path: '옛 폴더/지운 문서.md', action: 'delete-remote', status: 'ok', detail: '로컬에서 지움' },
    ],
  })
  await closeVault()
  await openVault('first')
  await openSync()
  await openHistory()
  await page.click('.run:first-child .run-open')
  await page.waitForTimeout(300)
  const paths = await page.evaluate(() => [...document.querySelectorAll('.run .plan li')]
    .map((li) => ({
      shown: li.querySelector('.plan-path').textContent,
      links: [...li.querySelectorAll('.plan-open')].map((one) => one.textContent),
    })))
  console.log('  ' + JSON.stringify(paths))
  expect('두 줄이 보임', paths.length === 2, JSON.stringify(paths))
  // 폴더 마디와 파일 이름이 저마다 눌리는 자리입니다.
  const nested = paths.find((one) => one.shown.includes('온보딩'))
  expect('경로는 그대로 보임', nested?.shown === '/회사/온보딩.md', JSON.stringify(nested))
  expect('폴더와 파일이 따로 눌림',
    nested?.links.join() === '회사,온보딩.md', JSON.stringify(nested))
  const removed = paths.find((one) => one.shown.includes('지운'))
  expect('지운 줄은 폴더만 눌림',
    removed?.links.join() === '옛 폴더', JSON.stringify(removed))

  // 파일 이름부터. 창이 걷히고 그 문서가 열립니다.
  await page.click('.run .plan .plan-open:text-is("온보딩.md")')
  await page.waitForTimeout(700)
  const landed = await page.evaluate(() => ({
    sheets: document.querySelectorAll('.overlay').length,
    path: document.querySelector('.info-path')?.textContent ?? null,
    editor: document.querySelectorAll('.editor').length,
  }))
  console.log('  ' + JSON.stringify(landed))
  expect('겹쳐 뜬 창이 모두 닫힘', landed.sheets === 0, JSON.stringify(landed))
  expect('그 문서가 열림', landed.path.endsWith('/회사/온보딩.md'), JSON.stringify(landed))
  expect('편집기까지 떠 있음', landed.editor === 1, JSON.stringify(landed))
  expect('보통 문서에는 겁주는 글이 없음',
    (await page.locator('.head-warn').count()) === 0)
  await page.screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '04-opened.png') })

  step('11. 경로 가운데 폴더를 누르면 그 폴더가 열린다')
  await openSync()
  await openHistory()
  await page.click('.run:first-child .run-open')
  await page.waitForTimeout(300)
  await page.click('.run .plan .plan-open:text-is("회사")')
  await page.waitForTimeout(700)
  const folder = await page.evaluate(() => ({
    sheets: document.querySelectorAll('.overlay').length,
    path: document.querySelector('.info-path')?.textContent ?? null,
    view: document.querySelectorAll('.folder-view').length,
    // 트리에서도 그 폴더가 펴져 아이가 보여야 합니다. :has-text 는 플레이라이트 말이라 못 씁니다.
    opened: [...document.querySelectorAll('.tree-name')]
      .filter((one) => one.textContent.includes('온보딩')).length,
  }))
  console.log('  ' + JSON.stringify(folder))
  expect('창이 모두 닫힘', folder.sheets === 0, JSON.stringify(folder))
  expect('그 폴더가 열림', folder.path.endsWith('/회사'), JSON.stringify(folder))
  expect('폴더 화면이 뜸', folder.view === 1, JSON.stringify(folder))
  expect('트리에서도 펴짐', folder.opened === 1, JSON.stringify(folder))

  step('12. 사라진 폴더는 알리기만 하고 창을 두른 채로 둔다')
  await openSync()
  await openHistory()
  await page.click('.run:first-child .run-open')
  await page.waitForTimeout(300)
  await page.click('.run .plan .plan-open:text-is("옛 폴더")')
  await page.waitForTimeout(500)
  const missing = await page.evaluate(() => ({
    sheets: document.querySelectorAll('.overlay').length,
    toast: document.querySelector('.toast')?.textContent ?? null,
  }))
  console.log('  ' + JSON.stringify(missing))
  expect('창은 그대로', missing.sheets > 0, JSON.stringify(missing))
  expect('없다고 알림', (missing.toast ?? '').includes('없습니다'), JSON.stringify(missing))
  await closeSheet()
  await page.click('[aria-label="설정"] .sheet-close')
  await page.waitForTimeout(300)

  /*
   * 즐겨찾기 파일은 트리에 감춰 두었지만 동기화 결과에는 이름이 나옵니다.
   * 그 이름을 눌러 열 수 있게 되었으므로, 손대면 안 된다는 것을 알려야 합니다.
   */
  step('13. 앱이 쓰는 파일을 열면 조심하라고 알린다')
  // 별을 눌러야 그 파일이 생깁니다.
  await page.hover('.tree-row:has-text("개발 환경")')
  await page.click('.tree-row:has-text("개발 환경") .tree-tools button[aria-label^="즐겨찾기"]')
  await page.waitForTimeout(600)
  await seedRun({
    at: Date.now(),
    trigger: 'manual',
    commitSha: null,
    error: null,
    cut: 0,
    log: [{
      path: '_t-wiki.favorites.json',
      action: 'upload-new',
      status: 'ok',
      detail: '로컬에만 있음',
    }],
  })
  await closeVault()
  await openVault('first')
  await openSync()
  await openHistory()
  await page.click('.run:first-child .run-open')
  await page.waitForTimeout(300)
  await page.click('.run .plan .plan-open:text-is("_t-wiki.favorites.json")')
  await page.waitForTimeout(700)
  const warned = await page.evaluate(() => {
    const warn = document.querySelector('.doc-head .head-warn')
    const tone = warn ? getComputedStyle(warn).color.match(/\d+/g).map(Number) : null
    const saved = [...document.querySelectorAll('.doc-head .pill')].map((one) => one.textContent)
    return {
      path: document.querySelector('.info-path')?.textContent ?? null,
      text: warn?.textContent.trim() ?? null,
      tone,
      saved,
      // "저장됨" 알약 바로 옆에 서야 눈에 들어옵니다.
      beside: warn?.previousElementSibling?.classList.contains('pill') ?? false,
    }
  })
  console.log('  ' + JSON.stringify(warned))
  expect('그 파일이 열림', warned.path.endsWith('/_t-wiki.favorites.json'), JSON.stringify(warned))
  expect('조심하라고 적힘', (warned.text ?? '').includes('앱이 쓰는 파일'), String(warned.text))
  expect('붉은 글씨', warned.tone !== null && warned.tone[0] > warned.tone[1] + 40
    && warned.tone[0] > warned.tone[2] + 40, JSON.stringify(warned.tone))
  expect('저장됨 알약 옆에 섬', warned.beside === true, JSON.stringify(warned))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '05-appfile.png'),
    clip: { x: 430, y: 60, width: 970, height: 120 } })

  /*
   * 오류 줄의 까닭은 한 문장짜리 영어 글입니다. 격자에서 까닭 칸이 제 내용만큼 먼저
   * 자리를 차지하는 바람에, 경로 칸이 0 까지 밀려 경로가 **한 글자씩 세로로 쌓였습니다.**
   */
  step('13-1. 오류 까닭이 길어도 경로 칸이 무너지지 않는다')
  await seedRun({
    at: Date.now(),
    trigger: 'manual',
    commitSha: null,
    error: null,
    cut: 0,
    log: [{
      path: '회사/자료/분기보고/2026/상태 보고서.md',
      action: 'upload-new',
      status: 'error',
      detail: 'A requested file or directory could not be found at the time an operation was processed.',
    }],
  })
  await closeVault()
  await openVault('first')
  await openSync()
  await openHistory()
  await page.click('.run:first-child .run-open')
  await page.waitForTimeout(400)
  const broken = await page.evaluate(() => {
    const row = document.querySelector('.run .plan li.plan-error')
    if (!row) return null
    const path = row.querySelector('.plan-path')
    const why = row.querySelector('.plan-reason')
    const line = Number.parseFloat(getComputedStyle(row).fontSize) * 1.6
    return {
      경로너비: Math.round(path.getBoundingClientRect().width),
      경로높이: Math.round(path.getBoundingClientRect().height),
      까닭너비: Math.round(why.getBoundingClientRect().width),
      줄높이: Math.round(line),
      // 까닭이 경로보다 아래에 있어야 합니다(아랫줄로 내려간 것).
      아랫줄: why.getBoundingClientRect().top >= path.getBoundingClientRect().bottom - 1,
    }
  })
  console.log('  ' + JSON.stringify(broken))
  expect('오류 줄을 찾음', broken !== null)
  // 무너지면 경로 칸이 한 글자 너비(20px 안팎)까지 줄고 높이는 열 줄을 넘깁니다.
  expect('경로 칸이 넉넉함', broken.경로너비 >= 150, JSON.stringify(broken))
  expect('경로가 세로로 쌓이지 않음', broken.경로높이 <= broken.줄높이 * 2 + 4, JSON.stringify(broken))
  expect('까닭은 아랫줄에서 폭을 다 씀', broken.아랫줄 && broken.까닭너비 >= 150, JSON.stringify(broken))
  // 창이 화면 가운데 뜨므로 잘라 담지 않고 통째로 찍습니다.
  await page.locator('[aria-label="지난 동기화 결과"]')
    .screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '06-error-row.png') })
  // 창과 설정을 열어 둔 채 넘기면 다음 걸음의 누르기를 덮개가 가로챕니다.
  await closeSheet()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  /*
   * 멈춘 회차를 펴면 "오간 것 없이 멈췄습니다" 한 줄이 흐린 글씨로 있었습니다. 멈춘 것인지
   * 할 일이 없었던 것인지 가릴 수 없었고, 무엇을 해야 할지도 알 수 없었습니다.
   */
  step('13-2. 멈춘 회차는 까닭과 받아 온 숫자를 눈에 띄게 적는다')
  await seedRun({
    at: Date.now(),
    trigger: 'auto',
    commitSha: null,
    error: 'GitHub: Not Found',
    failure: {
      message: 'GitHub: Not Found',
      status: 404,
      statusText: 'Not Found',
      request: 'GET /repos/a/b/git/ref/heads/main',
      requestId: 'A1:B2',
      hint: '그 자리를 찾지 못했습니다. 계정·저장소 이름과 브랜치를 보세요.',
    },
    cut: 0,
    log: [],
  })
  await closeVault()
  await openVault('first')
  await openSync()
  await openHistory()
  await page.click('.run:first-child .run-open')
  await page.waitForTimeout(400)
  const stopped = await page.evaluate(() => {
    const box = document.querySelector('.run .failure')
    if (!box) return null
    const tone = getComputedStyle(box.querySelector('.failure-head')).color.match(/\d+/g).map(Number)
    const facts = [...box.querySelectorAll('.failure-facts dt')].map((one) => one.textContent)
    return {
      까닭: box.querySelector('.failure-why').textContent,
      힌트: box.querySelector('.failure-hint')?.textContent ?? null,
      항목: facts,
      적힌것: box.querySelector('.failure-facts').textContent.replace(/\s+/g, ' '),
      붉은색: tone[0] > tone[1] + 40 && tone[0] > tone[2] + 40,
      옛문구: document.body.textContent.includes('오간 것 없이 멈췄습니다'),
    }
  })
  console.log('  ' + JSON.stringify(stopped))
  expect('멈춘 까닭이 따로 섬', stopped !== null)
  expect('까닭이 그대로 적힘', stopped.까닭 === 'GitHub: Not Found', String(stopped.까닭))
  expect('무엇을 보라는 말이 붙음', (stopped.힌트 ?? '').includes('저장소 이름'), String(stopped.힌트))
  expect('붉은 낯', stopped.붉은색, JSON.stringify(stopped))
  expect('응답 코드·요청·요청 번호를 적음',
    JSON.stringify(stopped.항목) === JSON.stringify(['응답 코드', '요청', '요청 번호']), JSON.stringify(stopped.항목))
  expect('받아 온 숫자가 그대로', stopped.적힌것.includes('404 Not Found')
    && stopped.적힌것.includes('GET /repos/a/b/git/ref/heads/main') && stopped.적힌것.includes('A1:B2'),
    stopped.적힌것)
  expect('멈춘 것을 "오간 것 없음" 으로 적지 않음', stopped.옛문구 === false, String(stopped.옛문구))
  await page.locator('[aria-label="지난 동기화 결과"]')
    .screenshot({ path: join(HERE, '..', 'shots', 'synchistory', '07-failure.png') })

  /*
   * 예전에 쌓인 회차에는 숫자가 없습니다. 그래도 멈췄다는 것과 그 한 줄은 보여야 합니다.
   */
  await closeSheet()
  // 설정까지 닫아야 다음 누르기를 덮개가 가로채지 않습니다.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await seedRun({
    at: Date.now() + 1, trigger: 'manual', commitSha: null, error: 'Failed to fetch', cut: 0, log: [],
  })
  await closeVault()
  await openVault('first')
  await openSync()
  await openHistory()
  await page.click('.run:first-child .run-open')
  await page.waitForTimeout(400)
  const old = await page.evaluate(() => {
    const box = document.querySelector('.run .failure')
    return box ? { 까닭: box.querySelector('.failure-why').textContent, 숫자: box.querySelector('.failure-facts') !== null } : null
  })
  console.log('  옛 기록: ' + JSON.stringify(old))
  expect('숫자가 없던 옛 회차도 까닭은 보임', old?.까닭 === 'Failed to fetch', JSON.stringify(old))
  expect('없는 숫자를 지어내지 않음', old?.숫자 === false, JSON.stringify(old))
  await closeSheet()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  step('14. 폴더가 다르면 기록도 남남이다')
  await closeVault()
  await openVault('other')
  await openSync()
  const alone = await page.locator('button:has-text("지난 결과 보기")').isDisabled()
  expect('처음 여는 폴더에는 기록이 없음', alone, String(alone))
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
