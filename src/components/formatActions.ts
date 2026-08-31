import type { FormatId } from '../lib/markdownFormat'

export interface FormatAction {
  id: FormatId
  icon: string
  label: string
  hint: string
}

/** 구분선은 null 로 표시합니다. */
export const FORMAT_ACTIONS: (FormatAction | null)[] = [
  { id: 'bold', icon: 'B', label: '굵게', hint: '굵게 — **글자** (⌘B)' },
  { id: 'italic', icon: 'I', label: '기울임', hint: '기울임 — *글자* (⌘I)' },
  { id: 'strike', icon: 'S', label: '취소선', hint: '취소선 — ~~글자~~' },
  { id: 'code', icon: '‹›', label: '인라인 코드', hint: '인라인 코드 — `글자` (⌘E)' },
  null,
  { id: 'h1', icon: 'H1', label: '제목 1', hint: '가장 큰 제목 — # 줄' },
  { id: 'h2', icon: 'H2', label: '제목 2', hint: '중간 제목 — ## 줄' },
  { id: 'h3', icon: 'H3', label: '제목 3', hint: '작은 제목 — ### 줄' },
  null,
  { id: 'ul', icon: '•', label: '목록', hint: '글머리 목록 — 선택한 줄마다 -' },
  { id: 'ol', icon: '1.', label: '번호 목록', hint: '번호 목록 — 선택한 줄마다 1. 2. 3.' },
  { id: 'task', icon: '☑', label: '체크박스', hint: '할 일 — - [ ] 줄' },
  { id: 'quote', icon: '❝', label: '인용', hint: '인용문 — > 줄' },
  null,
  { id: 'link', icon: '🔗', label: '링크', hint: '링크 — [글자](주소) (⌘K)' },
  { id: 'wikilink', icon: '[[]]', label: '위키링크', hint: '다른 문서로 연결 — [[문서 이름]]' },
  { id: 'codeblock', icon: '⌗', label: '코드 블록', hint: '여러 줄 코드 — ``` 로 감쌈' },
  { id: 'math', icon: '∑', label: '수식', hint: '수식 — $E = mc^2$' },
]
