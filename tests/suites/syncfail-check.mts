import { describeFailure, GitHubRequestError, hintFor } from '../../src/lib/github/failure'

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

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
