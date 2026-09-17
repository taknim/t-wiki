# t-WiKi 작업 규칙

이 저장소에서 Claude Code 가 일할 때 지키는 것들입니다. 어느 컴퓨터에서 열든 같습니다.
새 세션은 "지난번에 하던 mdwiki 작업 이어서" 정도로 시작하면 됩니다. 무엇을 만들었는지는
`README.md`, 무엇을 어떻게 시험하는지는 `tests/README.md` 에 다 적혀 있습니다.

## 무엇인가

브라우저 안에서만 도는 정적 마크다운 위키. 서버가 없고, File System Access API 로 로컬
폴더를 열어 쓰며, GitHub 액세스 토큰으로 저장소와 동기화합니다.
Vite + React + TypeScript, oxlint. 시험은 Playwright 로 **진짜 크롬**을 띄워 돌립니다.

```bash
npm install && npm run dev        # http://localhost:5173
npx tsc -b                        # 형 검사 (--noEmit 은 여기서 아무것도 검사하지 않습니다)
npx oxlint src tests
npm run build
npm test                          # 전부 (Google Chrome, python3 필요)
npm test -- 이름                  # 이름에 그 말이 든 묶음만
```

## 고칠 때마다 하는 일 (한 턴 안에서)

1. 코드를 고칩니다.
2. **그 일을 지키는 시험을 더하거나 고칩니다.** `tests/suites/*.mjs`. 되도록 실제 화면을
   만지는 묶음으로, 사람이 겪은 증상을 그대로 재현하는 걸음으로.
3. **되돌려 봅니다.** 고친 코드를 잠깐 옛 모습으로 되돌려 시험이 정말 실패하는지 확인한
   뒤 다시 돌려놓습니다. 실패하지 않는 시험은 아무것도 지키지 않습니다.
4. `npx tsc -b`, `npx oxlint src tests`, `npm run build`, 그리고 **전체 묶음** `npm test` 가
   모두 통과해야 합니다. 전체 묶음은 몇 분 걸리므로 배경에서 돌리고 기다립니다.
5. **`README.md` 를 그 변경에 맞게 갱신**하고(무엇을, 왜 그렇게 했는지 — 대안을 버린 까닭까지),
   시험 묶음이 늘거나 바뀌었으면 `tests/README.md` 의 표도 맞춥니다.
6. **README 사본을 복사합니다**: `cp README.md <문서 정리 폴더>/README.md`
   사본은 직접 편집하지 않고 늘 원본 → 사본 방향으로만 복사합니다. `개인 문서 저장소` 저장소에는
   요청이 없는 한 커밋하지 않습니다.
7. 커밋하고 푸시합니다. 사용자가 따로 말하지 않아도 이 저장소에서는 커밋·푸시까지가 한 턴입니다.

## 커밋

- 메시지는 **한국어 서술문**. 첫 줄은 무엇을 했는지 한 문장, 본문은 **왜** 그렇게 했는지 —
  무엇이 잘못되어 있었고, 어떤 길을 버렸고, 이 길을 고른 까닭. 단추 이름이나 파일 목록을
  늘어놓지 않습니다.
- 푸시는 `git -c core.sshCommand="ssh -i <이 컴퓨터의 키 경로>" push origin HEAD`. 키 경로는
  컴퓨터마다 다르므로 사용자에게 확인합니다. 키 파일을 다른 컴퓨터로 옮기지 않습니다.

## 코드를 쓰는 방식

- 주석은 **왜**를 적습니다. 무엇을 하는지는 코드가 말합니다. 어떤 대안을 왜 버렸는지,
  어떤 함정에 한 번 빠졌는지를 그 자리에 남깁니다. 주석과 문서는 한국어입니다.
- **시험이 잡지 못하는 방어 코드는 두지 않습니다.** "혹시 몰라서" 넣은 분기는 걷어냅니다.
- 화면에서 무언가를 찾을 때는 `document` 전체가 아니라 **제 창(ref) 안에서** 찾습니다.
  문서 본문에 같은 id·class 가 있어도 잡히면 안 됩니다.
- `querySelector('a, b')` 는 선택자 차례가 아니라 DOM 차례로 첫 것을 돌려줍니다. 우선순위가
  있으면 따로 찾습니다.
- oxlint 의 `react(set-state-in-effect)` 를 피하려면 effect 가 아니라 **렌더 중 되돌리기**
  (`if (shown !== path) { setShown(path); … }`) 를 씁니다.
- 물음 창에서 **물러서는 길(취소·Esc·바깥 누르기)은 늘 "아무것도 하지 않음"**입니다.
  무언가를 잃는 선택은 이름 붙은 단추로만 둡니다(`dialogs.choose`).
- 브라우저가 먼저 가져가는 글쇠(⌘N, ⌘⇧N, ⌘T, ⌘W)는 단축키로 쓰지 않습니다. 새 단축키는
  `src/lib/shortcuts.ts` 표에만 더하면 목록 창까지 따라옵니다.

## 보안 — 바꾸지 않는 것

- GitHub 액세스 토큰은 **브라우저 IndexedDB 에만**(봉해서), 나가는 곳은 `api.github.com` 뿐.
  설정 파일에 담을 때는 사람이 아는 암호로만 잠급니다. 글자 그대로 적는 길은 두지 않습니다.
- `public/_headers` 의 CSP 를 느슨하게 하지 않습니다. `script-src 'self'`, `frame-ancestors 'none'`.
- 문서 본문의 HTML 은 DOMPurify 를 거치고 `<style>` 은 걷어냅니다. HTML 첨부는 `sandbox=""` 안에서만.
- 시험 중에 **`.env` 나 비밀키 파일을 지우거나 덮어쓰지 않습니다.** 임시 파일은 프로젝트 폴더가
  아니라 scratchpad/임시 경로에 만들고, 시험이 끝나면 `tests/probe-tmp.mjs` 같은 것을 남기지 않습니다.

## 시험을 쓸 때

- 묶음 하나가 한 주제입니다. 걸음(`step`) 이름은 무엇을 지키는지 한 문장으로.
- 가짜 폴더는 `tests/mock-fs.js`, 가짜 GitHub 은 `tests/github-mock.mjs`, 브라우저 저장소를
  들여다보는 손은 `tests/peek.js`. 오피스 시험 파일은 `tests/office-fixtures.mjs` 가 짓습니다.
- 부드럽게 굴러가는 것은 `settled()` 처럼 멎을 때까지 기다렸다가 잽니다.
- `page.waitForFunction(fn, arg, options)` — 둘째 자리는 인자입니다. 옵션은 셋째 자리.
- 같은 이름의 `const` 를 한 묶음 안에서 두 번 선언하지 않습니다(`before`, `again`, `kept` 같은
  이름이 자주 부딪힙니다).
