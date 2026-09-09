import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'tree'), { recursive: true })
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
  // 같은 이름을 두 폴더에 심어 둡니다. 옮길 때 부딪히는 자리를 만들려면 필요합니다.
  const root = window.__mockRoot
  const sample = root._children.get('개발 환경.md')
  const put = (dir, name, data) => root._children.get(dir)._children.set(name, Object.assign(
    Object.create(Object.getPrototypeOf(sample)),
    { kind: 'file', name, _data: data, _lastModified: Date.now() },
  ))
  put('회사', '메모.md', '# 메모\n\n회사 쪽 메모입니다.\n')
  put('회고', '메모.md', '# 메모\n\n회고 쪽 메모입니다.\n')

  // 폴더끼리 부딪히는 자리도 하나 만들어 둡니다. 폴더는 안엣것까지 걸린 일입니다.
  const folder = (parent, name, child, data) => {
    const dir = Object.create(Object.getPrototypeOf(root))
    Object.assign(dir, { kind: 'directory', name, _children: new Map() })
    dir._children.set(child, Object.assign(
      Object.create(Object.getPrototypeOf(sample)),
      { kind: 'file', name: child, _data: data, _lastModified: Date.now() },
    ))
    root._children.get(parent)._children.set(name, dir)
  }
  folder('회사', '자료', '표.md', '# 표\n\n회사 쪽 자료입니다.\n')
  folder('회고', '자료', '표.md', '# 표\n\n회고 쪽 자료입니다.\n')

  // 굴림대가 생길 만큼 줄을 늘려 둡니다. 끝에서 저절로 굴러가는지 보려면 길어야 합니다.
  for (let at = 1; at <= 30; at += 1) {
    const name = `쪽지 ${String(at).padStart(2, '0')}.md`
    root._children.set(name, Object.assign(
      Object.create(Object.getPrototypeOf(sample)),
      { kind: 'file', name, _data: `# 쪽지 ${at}\n`, _lastModified: Date.now() },
    ))
  }
})

/** 그 폴더 안에 든 줄. 같은 이름이 여러 폴더에 있으므로 자리로 짚습니다. */
const rowIn = (folder, name) => page.locator(
  `.tree-branch:has(> .tree-row:has-text("${folder}")) > .tree-children .tree-row:has-text("${name}")`,
).first()

/** 지금 트리와 화면이 어떤 꼴인지. */
const shape = () => page.evaluate(() => ({
  rows: [...document.querySelectorAll('.tree-row:not(.tree-root) .tree-name')]
    .map((one) => one.textContent),
  selected: [...document.querySelectorAll('.tree-row.is-selected .tree-name')]
    .map((one) => one.textContent),
  open: [...document.querySelectorAll('.tree-caret.is-open')].length,
  folderView: document.querySelectorAll('.folder-view').length,
  path: document.querySelector('.info-path')?.textContent ?? null,
}))

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })

  /*
   * 아무것도 고른 적이 없는 브라우저입니다. 이 걸음만은 폴더를 열기 전에 봅니다.
   * 뒤 걸음이 탭을 옮겨 놓으면 그 값이 남아, 처음 온 사람의 화면을 다시 볼 수 없습니다.
   */
  step('1. 처음 오면 폴더 탭이, 그것도 앞자리에 있다')
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)
  const tabs = await page.evaluate(() => ({
    order: [...document.querySelectorAll('.sidebar-tablist button')].map((one) => one.textContent),
    picked: document.querySelector('.sidebar-tablist button[aria-selected="true"]')?.textContent ?? null,
  }))
  console.log('  ' + JSON.stringify(tabs))
  expect('폴더가 앞에 섬', tabs.order.join() === '폴더,즐겨찾기', JSON.stringify(tabs))
  expect('폴더 탭이 펴져 있음', tabs.picked === '폴더', JSON.stringify(tabs))

  step('2. 폴더를 처음 누르면 고르기만 하고 펴지지 않는다')
  const before = await shape()
  await page.click('.tree-row:has-text("회사")')
  await page.waitForTimeout(400)
  const picked = await shape()
  console.log('  ' + JSON.stringify(picked))
  expect('안이 펴지지 않음', picked.rows.join() === before.rows.join(), JSON.stringify(picked.rows))
  expect('그 폴더가 골라짐', picked.selected.join() === '회사', JSON.stringify(picked))
  expect('오른쪽에 폴더 화면이 뜸', picked.folderView === 1, JSON.stringify(picked))
  expect('표시줄도 그 폴더', picked.path.endsWith('/회사'), String(picked.path))

  step('3. 골라 둔 폴더를 다시 누르면 그때 펴진다')
  await page.click('.tree-row:has-text("회사")')
  await page.waitForTimeout(400)
  const opened = await shape()
  console.log('  ' + JSON.stringify(opened.rows))
  expect('안이 보임', opened.rows.includes('온보딩.md'), JSON.stringify(opened.rows))
  expect('고른 것은 그대로', opened.selected.join() === '회사', JSON.stringify(opened))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'tree', '01-open.png'),
    clip: { x: 0, y: 40, width: 440, height: 340 } })

  await page.click('.tree-row:has-text("회사")')
  await page.waitForTimeout(400)
  const closed = await shape()
  expect('한 번 더 누르면 접힘', !closed.rows.includes('온보딩.md'), JSON.stringify(closed.rows))

  step('4. 꺾쇠는 고르지 않고 펴고 접기만 한다')
  await page.click('.tree-row:has-text("개발 환경")')
  await page.waitForSelector('.editor', { timeout: 8000 })
  await page.waitForTimeout(400)
  await page.click('.tree-row:has-text("회고") .tree-caret')
  await page.waitForTimeout(400)
  const caret = await shape()
  console.log('  ' + JSON.stringify(caret))
  expect('폴더가 펴짐', caret.rows.includes('2026-08.md'), JSON.stringify(caret.rows))
  expect('고른 것은 그대로 문서', caret.selected.join() === '개발 환경.md', JSON.stringify(caret))
  expect('폴더 화면으로 바뀌지 않음', caret.folderView === 0, JSON.stringify(caret))
  await page.click('.tree-row:has-text("회고") .tree-caret')
  await page.waitForTimeout(400)
  const shut = await shape()
  expect('꺾쇠로 접기도 됨', !shut.rows.includes('2026-08.md'), JSON.stringify(shut.rows))
  expect('여전히 문서를 보고 있음', shut.selected.join() === '개발 환경.md', JSON.stringify(shut))

  step('5. 문서 줄은 한 번에 열린다')
  await page.click('.tree-row:has-text("회사") .tree-caret')
  await page.waitForTimeout(300)
  await page.click('.tree-row:has-text("온보딩")')
  await page.waitForTimeout(500)
  const doc = await shape()
  console.log('  ' + JSON.stringify(doc.path))
  expect('한 번 눌러 열림', doc.path.endsWith('/회사/온보딩.md'), String(doc.path))
  /*
   * 끌어다 놓기는 마우스를 손으로 움직여서는 일어나지 않습니다. dragTo 를 씁니다.
   * 옮겨 갈 자리에 같은 이름이 있으면 묻고, 고른 대로 해야 합니다.
   */
  step('6. 같은 이름이 없으면 그냥 옮겨진다')
  await page.click('.tree-row:has-text("첨부") .tree-caret')
  await page.waitForTimeout(300)
  await page.locator('.tree-row:has-text("도표.svg")')
    .dragTo(page.locator('.tree-row:has-text("회고")'))
  await page.waitForTimeout(700)
  const moved = await page.evaluate(() => ({
    dialog: document.querySelectorAll('.dialog').length,
    there: window.__vaultText('회고/도표.svg') !== null,
  }))
  console.log('  ' + JSON.stringify(moved))
  expect('묻지 않고 옮김', moved.dialog === 0, JSON.stringify(moved))
  expect('옮긴 자리에 있음', await page.evaluate(() => window.__vaultText('회고/도표.svg')) !== null)

  step('7. 같은 이름이 있으면 묻고, 취소하면 둘 다 그대로다')
  await page.click('.tree-row:has-text("회고") .tree-caret')
  await page.waitForTimeout(300)
  await rowIn('회고', '메모.md').dragTo(page.locator('.tree-row:has-text("회사")'))
  await page.waitForSelector('.dialog', { timeout: 5000 })
  const asked = await page.evaluate(() => ({
    title: document.querySelector('.dialog h2, .dialog .dialog-title')?.textContent
      ?? document.querySelector('.dialog')?.getAttribute('aria-label') ?? null,
    label: document.querySelector('.dialog-label')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    confirm: [...document.querySelectorAll('.dialog-actions button')].map((one) => one.textContent),
  }))
  console.log('  ' + JSON.stringify(asked))
  expect('같은 이름이 있다고 알림', (asked.title ?? '').includes('같은 이름'), String(asked.title))
  expect('되돌릴 수 없다고 밝힘', (asked.label ?? '').includes('되돌릴 수 없습니다'), String(asked.label))
  expect('덮어쓰기와 취소를 고르게 함',
    asked.confirm.join().includes('취소') && asked.confirm.join().includes('덮어쓰기'),
    JSON.stringify(asked.confirm))

  await page.click('.dialog-actions button:has-text("취소")')
  await page.waitForTimeout(600)
  const kept = await page.evaluate(async () => ({
    target: await window.__vaultText('회사/메모.md'),
    source: await window.__vaultText('회고/메모.md'),
  }))
  console.log('  ' + JSON.stringify(kept))
  expect('덮어쓰지 않음', (kept.target ?? '').includes('회사 쪽'), String(kept.target))
  expect('옮기지도 않음', (kept.source ?? '').includes('회고 쪽'), String(kept.source))

  step('8. 덮어쓰기를 고르면 그때 덮어쓴다')
  await rowIn('회고', '메모.md').dragTo(page.locator('.tree-row:has-text("회사")'))
  await page.waitForSelector('.dialog', { timeout: 5000 })
  await page.click('.dialog-actions button:has-text("덮어쓰기")')
  await page.waitForTimeout(800)
  const done = await page.evaluate(async () => ({
    target: await window.__vaultText('회사/메모.md'),
    source: await window.__vaultText('회고/메모.md'),
  }))
  console.log('  ' + JSON.stringify(done))
  expect('옮긴 내용으로 바뀜', (done.target ?? '').includes('회고 쪽'), String(done.target))
  expect('있던 자리에서는 사라짐', done.source === null, String(done.source))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'tree', '02-move.png'),
    clip: { x: 0, y: 40, width: 440, height: 340 } })
  /*
   * 목록이 길어지면 맨 아래 것을 맨 위로 옮길 길이 없습니다. 집어 든 채로는 굴림대를
   * 만질 수 없기 때문입니다. 끌기는 자동화로 흉내 내기 어려우므로, 끄는 동안 브라우저가
   * 올려 주는 사건(dragover)을 그 자리에 그대로 지어 보냅니다.
   */
  step('9. 끌고 가다 끝에 닿으면 저절로 굴러간다')
  await page.setViewportSize({ width: 1400, height: 420 })
  await page.waitForTimeout(300)
  const rolled = await page.evaluate(async () => {
    const box = document.querySelector('.sidebar-scroll')
    const view = box.getBoundingClientRect()
    const send = (y) => box.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: y, clientX: view.left + 40 }),
    )
    const wait = (ms) => new Promise((done) => setTimeout(done, ms))

    const tall = box.scrollHeight > box.clientHeight + 20
    // 아래 끝에 손을 대면 내려갑니다.
    send(view.bottom - 6)
    await wait(400)
    const down = box.scrollTop
    // 위 끝으로 옮기면 되올라갑니다.
    send(view.top + 6)
    await wait(400)
    const up = box.scrollTop
    // 끌기가 끝나면 멈춥니다.
    send(view.bottom - 6)
    await wait(120)
    document.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
    const stopped = box.scrollTop
    await wait(300)
    return { tall, down, up, stopped, after: box.scrollTop }
  })
  console.log('  ' + JSON.stringify(rolled))
  expect('굴릴 만큼 길어짐', rolled.tall === true, JSON.stringify(rolled))
  expect('아래 끝에서 내려감', rolled.down > 0, JSON.stringify(rolled))
  expect('위 끝에서 되올라감', rolled.up < rolled.down, JSON.stringify(rolled))
  expect('끌기가 끝나면 멈춤', rolled.after === rolled.stopped, JSON.stringify(rolled))
  await page.setViewportSize({ width: 1400, height: 920 })
  await page.waitForTimeout(300)

  step('10. 폴더를 덮어쓸 때는 안엣것까지 사라진다고 밝힌다')
  await rowIn('회고', '자료').dragTo(page.locator('.tree-row:has-text("회사")'))
  await page.waitForSelector('.dialog', { timeout: 5000 })
  const warned = await page.evaluate(() =>
    document.querySelector('.dialog-label')?.textContent.replace(/\s+/g, ' ').trim() ?? null)
  console.log('  ' + String(warned))
  expect('폴더라고 알림', (warned ?? '').includes('같은 이름의 폴더가'), String(warned))
  expect('안엣것도 사라진다고 밝힘', (warned ?? '').includes('안에 든 것이 모두 사라지고'),
    String(warned))
  await page.click('.dialog-actions button:has-text("덮어쓰기")')
  await page.waitForTimeout(900)
  const swapped = await page.evaluate(async () => ({
    target: await window.__vaultText('회사/자료/표.md'),
    source: await window.__vaultText('회고/자료/표.md'),
  }))
  console.log('  ' + JSON.stringify(swapped))
  expect('옮긴 폴더의 내용으로 바뀜', (swapped.target ?? '').includes('회고 쪽'), String(swapped.target))
  expect('있던 자리에서는 사라짐', swapped.source === null, String(swapped.source))
  /*
   * 아래 표시줄의 경로는 볼트 이름까지 붙여 보여 주고, 누르면 그대로 베낍니다.
   * 볼트 안 경로만 적어 두면 폴더를 여럿 오갈 때 어느 쪽 것인지 알 수 없습니다.
   */
  step('11. 표시줄 경로에 폴더 이름이 붙고, 누르면 베낀다')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForTimeout(500)
  const shownPath = (await page.textContent('.info-path')).trim()
  console.log('  경로: ' + shownPath)
  expect('볼트 이름이 앞에 붙음', shownPath === '내 위키/개발 환경.md', shownPath)

  await page.click('.info-path')
  await page.waitForTimeout(500)
  const copied = await page.evaluate(async () => ({
    clip: await navigator.clipboard.readText(),
    toast: document.querySelector('.toast')?.textContent ?? null,
  }))
  console.log('  ' + JSON.stringify(copied))
  expect('경로가 그대로 베껴짐', copied.clip === '내 위키/개발 환경.md', String(copied.clip))
  expect('베꼈다고 알림', copied.toast === '파일 경로를 클립보드에 복사했습니다.', String(copied.toast))

  // 폴더는 폴더라고 알려야 합니다.
  await page.click('.tree-row:has-text("회고")')
  await page.waitForTimeout(400)
  await page.click('.info-path')
  await page.waitForTimeout(500)
  const dirCopy = await page.evaluate(async () => ({
    clip: await navigator.clipboard.readText(),
    toast: document.querySelector('.toast')?.textContent ?? null,
  }))
  console.log('  ' + JSON.stringify(dirCopy))
  expect('폴더 경로도 베껴짐', dirCopy.clip === '내 위키/회고', String(dirCopy.clip))
  expect('폴더라고 알림', dirCopy.toast === '폴더 경로를 클립보드에 복사했습니다.', String(dirCopy.toast))

} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((l) => !l.includes('404') && !l.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
