import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHubMock } from '../github-mock.mjs'

/*
 * 가지 끝이 뒤처져 보일 때 커밋이 깨지지 않는지.
 *
 * 2026-11-18 에 실제로 겪은 고장입니다. 커밋을 올린 직후의 회차가 **잇달아 두 번**
 * `GitHub: Update is not a fast forward` 로 깨졌습니다. 저장소를 나중에 들여다보니 그
 * 사이에 아무도 올리지 않았고, 올린 사람도 내내 한 사람이었습니다. 끼어든 것이 아니라
 * **GitHub 이 방금 우리가 옮겨 놓은 가지를 아직 안 보여 준** 것입니다(쓴 직후의 읽기가
 * 복제본에서 나옵니다). 낡은 커밋을 부모로 쌓으니 우리 커밋이 빠져 거절당했고, 곧바로
 * 되물어도 같은 답이 와서 재시도 세 번이 모두 같은 자리에서 깨졌습니다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, '..', 'shots', 'staleref'), { recursive: true })
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
await page.addInitScript(() => window.__installMockFs())

/*
 * 덮개를 모두 걷고 설정의 동기화 갈래를 엽니다.
 *
 * 실패한 회차는 보고서를 띄웁니다. 그 덮개가 남아 있으면 아래 것이 눌리지 않아,
 * "왜 실패했는지 보러 가는 길" 자체가 막힌 것처럼 보입니다.
 */
const openSync = async () => {
  for (let at = 0; at < 4 && (await page.locator('.overlay').count()) > 0; at += 1) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(300)
}
const closeSheet = async () => {
  if (await page.locator('.sheet-close').count()) {
    await page.click('.sheet-close')
    await page.waitForTimeout(300)
  }
}
const syncNow = async () => {
  await page.click('button:has-text("지금 동기화")')
  await page.waitForFunction(() => {
    const one = [...document.querySelectorAll('button')]
      .find((node) => /지금 동기화|동기화 중/.test(node.textContent))
    return one && !one.disabled && one.textContent.includes('지금 동기화')
  }, undefined, { timeout: 40000 })
  await page.waitForTimeout(600)
}

/** 글을 한 조각 고쳐 올릴 것을 만듭니다. 파일을 몰래 고치면 앱이 든 목록은 그대로입니다. */
const editDoc = async (text) => {
  await closeSheet()
  await page.click('.tree-row:has-text("개발 환경") .tree-name')
  await page.waitForSelector('.main .editor', { timeout: 8000 })
  if (await page.locator('.mode-switch button[aria-label="편집"]').count()) {
    await page.click('.mode-switch button[aria-label="편집"]')
    await page.waitForTimeout(300)
  }
  await page.click('.main .editor')
  await page.keyboard.press('End')
  await page.keyboard.type(text)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyS' : 'Control+KeyS')
  await page.waitForTimeout(800)
}

/** 지난 결과에 남은 맨 윗줄(가장 최근 회차)과 그 줄들의 까닭. */
const lastRun = async () => {
  await openSync()
  await page.click('button:has-text("지난 결과 보기")')
  await page.waitForSelector('[aria-label="지난 동기화 결과"]', { timeout: 8000 })
  await page.waitForTimeout(300)
  await page.click('.run:first-child .run-open')
  await page.waitForTimeout(300)
  const out = await page.evaluate(() => {
    const run = document.querySelector('.run')
    return {
      sum: run.querySelector('.run-sum')?.textContent ?? '',
      까닭: [...run.querySelectorAll('.plan li')].map((li) => li.textContent.replace(/\s+/g, ' ')),
    }
  })
  await page.click('[aria-label="지난 동기화 결과"] .sheet-close')
  await page.waitForTimeout(300)
  return out
}

try {
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(500)

  step('1. 한 회차를 올려 기준이 될 커밋을 만든다')
  await openSync()
  await page.fill('#gh-token', 'pat')
  await page.fill('#gh-owner', 'tester')
  await page.fill('.row input[placeholder="저장소 이름"]', 'wiki')
  await page.waitForTimeout(400)
  await syncNow()
  /*
   * **두 번** 쌓습니다. 첫 커밋에는 앞 커밋이 없어 "한 커밋 뒤처진 답" 을 지어낼 수
   * 없습니다. 거기서 걸면 뒤처진 답이 곧 맞는 답이 되어 시험이 헛돕니다.
   */
  await editDoc(' 기준 세우기')
  await openSync()
  await syncNow()
  const first = github.headSha
  expect('가지가 섰음', typeof first === 'string' && first.length > 0, String(first))
  expect('앞 커밋이 있는 자리에서 잼', github.parentSha !== null, String(github.parentSha))

  step('2. 저장소가 방금 올린 커밋을 아직 안 보여 줘도 기다렸다 올린다')
  await editDoc(' 뒤처진 읽기')
  /*
   * 다음 **세 번**의 가지 끝 읽기가 한 커밋 뒤처진 답을 내놓습니다. 회차마다 한 번씩
   * 읽으므로, 기다리지 않고 곧바로 되묻기만 하면 재시도 세 번이 모두 같은 답을 받아
   * 같은 자리에서 깨집니다. 실제로 그렇게 두 회차가 잇달아 무너졌습니다.
   */
  await openSync()
  // 설정 갈래를 여는 동안에도 저장소를 읽습니다. **동기화를 누르기 직전에** 걸어야
  // 뒤처진 답이 회차에 쓰입니다.
  github.staleReads(3)
  await syncNow()
  const waited = await lastRun()
  const copies = await page.evaluate(() =>
    [...window.__mockRoot._children.keys()].filter((one) => one.includes('저장소 사본')))
  console.log('  ' + JSON.stringify(waited) + ' / 끝: ' + github.headSha.slice(0, 7)
    + ' / 사본: ' + JSON.stringify(copies))
  expect('실패 없이 올라감', !/실패/.test(waited.sum) && !waited.까닭.some((one) => one.includes('커밋 실패')),
    JSON.stringify(waited))
  /*
   * 뒤처진 답은 **옛 트리**를 함께 끌고 옵니다. 그대로 견주면 저장소가 제 손으로 올린
   * 글과 달라 보여 "양쪽 모두 고쳤다" 는 충돌이 되고, 쓰지도 않은 `(저장소 사본 …)`
   * 파일이 폴더에 생깁니다. 거절당하는 것보다 이쪽이 더 고약합니다.
   */
  expect('엉뚱한 충돌로 번지지 않음', !/충돌/.test(waited.sum), JSON.stringify(waited))
  expect('저장소 사본이 생기지 않음', copies.length === 0, JSON.stringify(copies))
  expect('가지가 실제로 옮겨짐', github.headSha !== first, github.headSha)
  // 뒤처진 답이 걷힌 뒤에 세웠으므로, 새 커밋의 부모는 앞 커밋이어야 합니다.
  expect('앞 커밋 위에 쌓임', github.parentSha === first, `${github.parentSha} vs ${first}`)

  step('3. 정말로 다른 쪽이 먼저 올렸으면 다시 세워 올린다')
  /*
   * 같은 답(422)이라도 이쪽은 기다린다고 풀리지 않습니다. 저장소를 다시 읽고 계획을
   * 다시 세워야 합니다. 기다림과 다시 세우기는 서로 다른 일이라 둘 다 살아 있어야 합니다.
   */
  const second = github.headSha
  await editDoc(' 끼어듦')
  github.refuseNextRefUpdate()
  await openSync()
  await syncNow()
  const retried = await lastRun()
  console.log('  ' + JSON.stringify(retried) + ' / 끝: ' + github.headSha.slice(0, 7))
  expect('거절당해도 끝내 올라감', !/실패/.test(retried.sum), JSON.stringify(retried))
  expect('가지가 옮겨짐', github.headSha !== second, github.headSha)

  step('4. 저장소가 끝내 안 따라오면 그 까닭을 그대로 남긴다')
  /*
   * 영영 기다리지는 않습니다. 기다릴 만큼 기다리고도 뒤처진 답만 오면 한 번 거절당하고,
   * 왜 안 됐는지를 기록에 적습니다. 말없이 "다 됐다" 로 두면 올라가지 않은 글을 올라간
   * 것으로 믿게 됩니다.
   */
  await editDoc(' 끝내 안 보임')
  // 재시도까지 모두 거절당하도록 쉬지 않고 막습니다.
  const guard = setInterval(() => github.refuseNextRefUpdate(), 50)
  try {
    await openSync()
    await syncNow()
  } finally {
    clearInterval(guard)
  }
  const refused = await lastRun()
  console.log('  ' + JSON.stringify(refused))
  expect('실패로 남음', /실패/.test(refused.sum), JSON.stringify(refused))
  expect('까닭이 그대로 적힘',
    refused.까닭.some((one) => one.includes('fast forward')), JSON.stringify(refused.까닭))
  await page.screenshot({ path: join(HERE, '..', 'shots', 'staleref', '01-refused.png') })
} catch (cause) {
  fail('묶음이 도중에 멈춤', cause instanceof Error ? (cause.stack ?? cause.message) : String(cause))
} finally {
  const real = errors.filter((line) => !line.includes('404') && !line.includes('Failed to load resource'))
  if (real.length) fail('화면 오류', real.join(' / '))
  await browser.close()
}

console.log('\n' + (problems.length ? 'FAIL ' + problems.length + '건: ' + problems.join(', ') : '모두 통과'))
if (problems.length) process.exitCode = 1
