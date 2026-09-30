/*
 * 시험 묶음을 한 번에 돌립니다.
 *
 *   npm test              전부
 *   npm test -- 동기화     이름에 그 말이 든 것만
 *
 * 앱이 떠 있지 않으면 여기서 띄우고, 끝나면 내립니다.
 * 이미 떠 있으면 그대로 씁니다. 개발 중에 띄워 둔 것을 죽이지 않습니다.
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const URL = process.env.APP_URL ?? 'http://localhost:5173'

/*
 * 그 자리에 **우리 앱이** 떠 있는지 봅니다.
 *
 * 응답이 왔다는 것만으로는 모자랍니다. 이 컴퓨터에서는 다른 프로젝트의 vite 가 같은
 * 포트대를 쓰는데, 그 서버를 우리 것으로 알고 붙었더니 모든 묶음이 첫 누르기에서
 * 30초씩 기다리다 멈췄습니다. 제목 한 줄로 우리 앱인지 가립니다.
 */
const alive = async () => {
  try {
    const answer = await fetch(URL, { signal: AbortSignal.timeout(1500) })
    if (!answer.ok) return false
    return (await answer.text()).includes('<title>t-WiKi</title>')
  } catch {
    return false
  }
}

async function startApp() {
  if (await alive()) {
    console.log(`이미 떠 있는 앱을 씁니다: ${URL}`)
    return null
  }

  console.log('앱을 띄우는 중…')
  /*
   * `--strictPort` 를 붙입니다. 그 포트가 이미 남의 것이면 vite 는 조용히 옆 포트로
   * 옮겨 가는데, 그러면 우리가 보는 자리에는 남의 앱이 남아 있게 됩니다. 옮겨 가느니
   * 못 뜨고 멈추는 편이 낫습니다.
   */
  const server = spawn('npm', ['run', 'dev', '--', '--port', new global.URL(URL).port, '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  })

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((done) => setTimeout(done, 500))
    if (await alive()) {
      console.log(`앱이 떴습니다: ${URL}`)
      return server
    }
  }

  try { process.kill(-server.pid) } catch { /* 이미 죽었으면 그만입니다 */ }
  throw new Error(`앱이 뜨지 않았습니다: ${URL} (그 포트를 다른 프로그램이 쓰고 있는지 보세요)`)
}

const run = (file) =>
  new Promise((done) => {
    // .mts 는 타입이 붙은 순수 로직 시험이라 tsx 로 돌립니다.
    const command = file.endsWith('.mts') ? 'npx' : 'node'
    const args = file.endsWith('.mts') ? ['tsx', file] : [file]
    const child = spawn(command, args, { cwd: join(HERE, 'suites'), env: { ...process.env, APP_URL: URL } })

    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('close', (code) => done({ code, output }))
  })

const filter = process.argv.slice(2)
const files = readdirSync(join(HERE, 'suites'))
  .filter((name) => name.endsWith('.mjs') || name.endsWith('.mts'))
  .filter((name) => filter.length === 0 || filter.some((word) => name.includes(word)))
  .sort()

if (files.length === 0) {
  console.error('돌릴 것이 없습니다.')
  process.exit(1)
}

const server = await startApp()
const failed = []

try {
  for (const file of files) {
    const { code, output } = await run(file)
    if (code === 0) {
      console.log(`  ok   ${file}`)
    } else {
      failed.push(file)
      console.log(`  실패 ${file}`)
      // 실패한 줄과 그 뒤 설명만 추립니다. 통과한 줄까지 쏟아내면 읽기 어렵습니다.
      const lines = output.split('\n')
      lines.forEach((line, at) => {
        if (line.startsWith('FAIL')) console.log('       ' + [line, lines[at + 1]].join('\n       ').trimEnd())
      })
    }
  }
} finally {
  if (server) {
    try { process.kill(-server.pid) } catch { /* 이미 죽었으면 그만입니다 */ }
  }
}

console.log('')
if (failed.length === 0) {
  console.log(`${files.length}개 묶음 전부 통과`)
} else {
  console.log(`${failed.length}개 묶음 실패: ${failed.join(', ')}`)
  process.exit(1)
}
