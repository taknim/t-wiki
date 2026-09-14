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
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.route('https://api.github.com/**', github.handler)
await page.addInitScript(readFileSync(join(HERE, '..', 'mock-fs.js'), 'utf8'))
await page.addInitScript(readFileSync(join(HERE, '..', 'peek.js'), 'utf8'))
await page.addInitScript(() => {
  window.__installMockFs()
  const first = window.__mockRoot
  const second = Object.create(Object.getPrototypeOf(first))
  Object.assign(second, { kind: 'directory', name: '새 폴더', _children: new Map() })
  window.__vaults = { first, second }
  window.__pick = 'first'
  window.showDirectoryPicker = async () => window.__vaults[window.__pick]
})

const idb = (fn) => page.evaluate(fn)
const openVault = async (which) => {
  await page.evaluate((w) => { window.__pick = w; window.__mockRoot = window.__vaults[w] }, which)
  await page.click('button:has-text("폴더 열기")')
  await page.waitForSelector('.tree', { timeout: 10000 })
  await page.waitForTimeout(800)
}
const closeVault = async () => {
  if (await page.locator('.sheet-close').count()) { await page.click('.sheet-close'); await page.waitForTimeout(200) }
  await page.click('.tree-root button[aria-label="폴더 닫기"]')
  await page.waitForSelector('button:has-text("폴더 열기")', { timeout: 8000 })
  await page.waitForTimeout(300)
}
const tokenInSettings = async () => {
  await page.click('button[aria-label="설정"]')
  await page.waitForSelector('.settings-nav')
  await page.click('.settings-nav button:has-text("GitHub 동기화")')
  await page.waitForTimeout(700)
  // 토큰은 별표로만 나옵니다. 별표가 섰으면 저장소에서 풀어 보고, 입력란이면 그 값입니다.
  const value = await page.evaluate(async () => {
    if (!document.querySelector('.token-mask')) return document.querySelector('#gh-token')?.value ?? ''
    const stored = await window.__githubConfigFor(window.__vaults[window.__pick].name)
    return stored?.token ?? '(별표만 있고 저장된 값은 없음)'
  })
  await page.click('.sheet-close')
  await page.waitForTimeout(200)
  return value
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })

  step('1. 폴더별로 가르기 전 상태를 만든다')
  // 첫 폴더를 한 번 열어 손잡이를 남기고, 옛 모양의 한 벌짜리 설정을 심습니다.
  await openVault('first')
  await closeVault()
  await page.evaluate(async () => {
    const write = (key, value) => new Promise((done) => {
      const open = indexedDB.open('keyval-store')
      open.onsuccess = () => {
        const tx = open.result.transaction('keyval', 'readwrite')
        tx.objectStore('keyval').put(value, key)
        tx.oncomplete = () => done()
      }
    })
    // 예전 모양: 폴더 구분 없이 설정 한 벌이 통째로 들어 있습니다.
    await write('mdwiki:github-config', {
      token: '옛토큰', owner: 'tester', repo: 'wiki', branch: 'main', basePath: '',
      conflictPolicy: 'keep-both', propagateDeletes: false, autoSync: false, autoSyncMinutes: 10,
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  ok('옛 모양의 설정을 심었습니다')

  step('2. 처음 보는 폴더를 열어도 옛 토큰이 딸려 오지 않는다')
  await openVault('second')
  const fresh = await tokenInSettings()
  console.log('  새 폴더 토큰: ' + JSON.stringify(fresh))
  expect('토큰이 비어 있음', fresh === '', fresh)

  step('3. 주인을 못 찾으면 어느 폴더에도 붙지 않는다')
  /*
   * 이 시험대에서는 저장해 둔 손잡이가 브라우저 저장소를 거치며 메서드를 잃어
   * 폴더를 가려낼 수 없습니다. 그때는 물려주지 않고 버리는 것이 맞습니다.
   * 진짜 브라우저에서는 손잡이가 온전해 원래 쓰던 폴더로 갑니다.
   */
  await closeVault()
  await openVault('first')
  const owner = await tokenInSettings()
  console.log('  원래 폴더 토큰: ' + JSON.stringify(owner))
  expect('아무 폴더에나 붙지 않음', owner === '', owner)

  step('4. 옛 모양은 정리되었다')
  const shape = await idb(async () => {
    const read = (key) => new Promise((done) => {
      const open = indexedDB.open('keyval-store')
      open.onsuccess = () => {
        const tx = open.result.transaction('keyval', 'readonly')
        const req = tx.objectStore('keyval').get(key)
        req.onsuccess = () => done(req.result)
      }
    })
    const cfg = await read('mdwiki:github-config')
    return { hasTopLevelToken: 'token' in cfg, keys: Object.keys(cfg).length }
  })
  console.log('  ' + JSON.stringify(shape))
  expect('한 벌짜리 모양이 아님', !shape.hasTopLevelToken, JSON.stringify(shape))

  step('5. 콘솔 오류')
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
