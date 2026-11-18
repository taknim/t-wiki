import { describeFailure, GitHubRequestError, hintFor } from '../../src/lib/github/failure'
import { isBehind, STALE_WAITS } from '../../src/lib/github/sync'

/*
 * 멈춘 까닭을 추리는 셈만 따로 잽니다.
 *
 * 화면을 띄우지 않고도 "무엇이 던져졌을 때 무엇을 적는지" 를 가장자리까지 훑을 수 있습니다.
 */

let problems = 0
const ok = (name: string) => console.log('  ok  ' + name)
const fail = (name: string, detail: string) => {
  problems++
  console.log('FAIL  ' + name + '\n      ' + detail)
}
const expect = (name: string, condition: boolean, detail = '') => (condition ? ok(name) : fail(name, detail))
const same = (name: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok(name) : fail(name, `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`))

console.log('\n>>> 1. 답이 온 실패는 숫자와 자리를 그대로 남긴다')
const refused = describeFailure(new GitHubRequestError('GitHub: Not Found', {
  status: 404, statusText: 'Not Found', request: 'GET /repos/a/b/git/ref/heads/main', requestId: 'A1:B2',
}))
same('적는 글은 그대로', refused.message, 'GitHub: Not Found')
same('응답 코드', refused.status, 404)
same('요청한 자리', refused.request, 'GET /repos/a/b/git/ref/heads/main')
same('요청 번호', refused.requestId, 'A1:B2')
expect('무엇을 보라는 말이 붙음', (refused.hint ?? '').includes('저장소 이름'), String(refused.hint))

console.log('\n>>> 2. 답이 오지 않은 실패는 코드 없이 까닭만 짚는다')
// 상태 0 은 "답이 아예 없었다" 는 뜻이라 화면에 코드로 적지 않습니다.
const offline = describeFailure(new GitHubRequestError('Failed to fetch', {
  status: 0, statusText: '', request: 'GET /repos/a/b', requestId: null,
}))
same('코드는 적지 않음', offline.status, undefined)
same('요청한 자리는 남김', offline.request, 'GET /repos/a/b')
expect('끊긴 쪽을 짚음', (offline.hint ?? '').includes('인터넷'), String(offline.hint))

console.log('\n>>> 3. 우리 것이 아닌 오류도 글은 잃지 않는다')
same('보통 오류', describeFailure(new Error('무언가 잘못됨')), { message: '무언가 잘못됨' })
// 브라우저가 던지는 말만은 끊긴 쪽으로 짚어 줍니다. 그 글에는 까닭이 담기지 않습니다.
expect('브라우저의 Failed to fetch', (describeFailure(new Error('Failed to fetch')).hint ?? '').includes('api.github.com'))
same('글자로 던져진 것', describeFailure('그냥 글'), { message: '그냥 글' })

console.log('\n>>> 4. 코드마다 할 일을 다르게 짚는다')
expect('401 은 토큰', (hintFor(401) ?? '').includes('토큰'), String(hintFor(401)))
expect('403 은 권한·한도', (hintFor(403) ?? '').includes('권한'), String(hintFor(403)))
expect('409 는 다시 돌리기', (hintFor(409) ?? '').includes('한 번 더'), String(hintFor(409)))
expect('500 대는 GitHub 쪽', (hintFor(503) ?? '').includes('GitHub 쪽'), String(hintFor(503)))
same('짚을 말이 없으면 비움', hintFor(418), undefined)


console.log('\n>>> 5. 가지 끝이 뒤처져 보이는지 가린다')
/*
 * GitHub 은 쓴 직후의 읽기가 뒤처질 수 있습니다. 방금 옮겨 놓은 가지를 읽었는데 그 앞
 * 커밋이 오고, 그 위에 쌓으면 `Update is not a fast forward` 로 거절당합니다.
 * 2026-11-18 에 커밋 두 회차가 잇달아 그렇게 깨졌습니다.
 */
const head = (sha: string) => ({ commitSha: sha, treeSha: 't' })
// 올린 직후에는 **무엇이 서야 하는지** 압니다.
expect('방금 올린 커밋이 서 있으면 됨', !isBehind(head('새것'), { wanted: '새것' }))
expect('아직 옛것이면 뒤처진 것', isBehind(head('옛것'), { wanted: '새것' }))
// 다음 회차에는 그 사이 남이 무엇을 올렸을지 몰라, "적어도 거기는 아니다" 만 말합니다.
expect('이미 지나온 자리가 오면 뒤처진 것', isBehind(head('부모'), { passed: '부모' }))
expect('처음 보는 커밋이면 남이 올린 것으로 봄', !isBehind(head('남의것'), { passed: '부모' }))
expect('우리 커밋 그대로면 됨', !isBehind(head('우리것'), { passed: '부모' }))
// 견줄 것이 없으면 기다리지 않습니다. 빈 저장소도 마찬가지입니다.
expect('가릴 것이 없으면 기다리지 않음', !isBehind(head('아무것'), {}))
expect('지나온 자리를 모르면 기다리지 않음', !isBehind(head('아무것'), { passed: null }))
expect('가지가 없으면 기다리지 않음', !isBehind(null, { wanted: '새것' }))

console.log('\n>>> 5-1. 기다리는 시간은 갑절로 늘되 끝이 있다')
// 1.2초(400·800)로 두었더니 저장소가 따라오기 전에 재시도를 다 써 버렸습니다.
expect('첫 기다림은 짧음', STALE_WAITS[0] <= 500, String(STALE_WAITS[0]))
expect('뒤로 갈수록 길어짐', STALE_WAITS.every((one, at) => at === 0 || one > STALE_WAITS[at - 1]),
  JSON.stringify(STALE_WAITS))
const budget = STALE_WAITS.reduce((sum, one) => sum + one, 0)
expect('다 합쳐 10초는 넘게 기다림', budget >= 10_000, String(budget))
// 영영 기다리는 것보다 한 번 거절당하고 다시 세우는 편이 낫습니다.
expect('그래도 30초 안에는 포기함', budget <= 30_000, String(budget))

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
