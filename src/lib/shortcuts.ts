/*
 * 앱 전역 단축키.
 *
 * 한 자리에 모아 둡니다. 누르는 쪽(App)과 보여 주는 쪽(단축키 목록 창)이 같은 표를
 * 보므로, 하나를 더하거나 바꾸면 목록도 저절로 맞습니다.
 * 편집기 안에서만 도는 서식 단축키도 목록에는 함께 적습니다. 사람은 어디서 도는지
 * 가리지 않고 "무슨 키가 있나"를 봅니다.
 */

export interface KeySpec {
  key: string
  /** ⌘(맥) 또는 Ctrl(그 밖). 없으면 그냥 그 키입니다. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export interface Shortcut {
  id: string
  label: string
  keys: KeySpec
  /** 어디서 도는지. 목록에서 묶어 보여 줍니다. */
  scope: '앱 어디서나' | '편집기 안' | '창·목록'
  /** 눌러도 앱까지 오지 않는 자판이 있으면 그 사연. */
  note?: string
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'search', label: '검색으로 가기', keys: { key: 'p', mod: true }, scope: '앱 어디서나' },
  /*
   * ⌘N 은 크롬이 새 창 열기로 먼저 가져가 페이지까지 오지 않습니다(맥·윈도 모두).
   * 그래서 ⌥ 를 더한 것도 같은 일로 둡니다. ⌘N 이 오는 브라우저에서는 그것도 됩니다.
   */
  { id: 'new-doc', label: '새 문서', keys: { key: 'n', mod: true, alt: true }, scope: '앱 어디서나',
    note: '⌘N 은 브라우저가 새 창 열기로 가로채므로 ⌥ 를 더해 누릅니다' },
  { id: 'view-mode', label: '보기 모드 바꾸기 (편집 → 나란히 → 미리보기)', keys: { key: 'e', mod: true, shift: true }, scope: '앱 어디서나' },
  { id: 'tab-tree', label: '옆줄을 폴더 트리로', keys: { key: '1', mod: true, shift: true }, scope: '앱 어디서나' },
  { id: 'tab-favorites', label: '옆줄을 즐겨찾기로', keys: { key: '2', mod: true, shift: true }, scope: '앱 어디서나' },
  { id: 'sidebar', label: '옆줄(폴더 트리) 접기 / 펴기', keys: { key: 'b', mod: true, shift: true }, scope: '앱 어디서나' },
  { id: 'settings', label: '설정 열기', keys: { key: ',', mod: true }, scope: '앱 어디서나' },
  { id: 'help', label: '이 단축키 목록', keys: { key: '/', mod: true }, scope: '앱 어디서나' },

  { id: 'save', label: '지금 바로 저장', keys: { key: 's', mod: true }, scope: '편집기 안' },
  { id: 'bold', label: '굵게', keys: { key: 'b', mod: true }, scope: '편집기 안' },
  { id: 'italic', label: '기울임', keys: { key: 'i', mod: true }, scope: '편집기 안' },
  { id: 'code', label: '인라인 코드', keys: { key: 'e', mod: true }, scope: '편집기 안' },
  { id: 'link', label: '링크', keys: { key: 'k', mod: true }, scope: '편집기 안' },
  { id: 'indent', label: '공백 두 칸 들여쓰기', keys: { key: 'Tab' }, scope: '편집기 안' },

  { id: 'close', label: '맨 위에 뜬 창 닫기', keys: { key: 'Escape' }, scope: '창·목록' },
  { id: 'rows', label: '폴더 트리·즐겨찾기·검색 결과에서 줄 사이 오르내리기 (맨 위에서 ↑ 는 검색 칸으로)', keys: { key: '↑ ↓' }, scope: '창·목록' },
  { id: 'open', label: '고른 줄 열기 (폴더는 고르기, 다시 누르면 펴고 접기)', keys: { key: 'Enter' }, scope: '창·목록' },
  { id: 'fold', label: '폴더 트리에서 폴더 펴기 / 접기', keys: { key: '→ ←' }, scope: '창·목록' },
  { id: 'reorder', label: '즐겨찾기 줄 순서 바꾸기', keys: { key: '↑ ↓', alt: true }, scope: '창·목록' },
  { id: 'resize', label: '너비 손잡이에서 폭 조절 (Shift 는 큰 걸음, Home 은 처음 폭)', keys: { key: '← →' }, scope: '창·목록' },
]

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** 화면에 적을 글자. 맥은 기호로, 그 밖은 이름으로 적습니다. */
export function formatKeys(keys: KeySpec): string {
  const mac = isMac()
  const parts: string[] = []
  if (keys.mod) parts.push(mac ? '⌘' : 'Ctrl')
  if (keys.alt) parts.push(mac ? '⌥' : 'Alt')
  if (keys.shift) parts.push(mac ? '⇧' : 'Shift')
  const name = keys.key.length === 1 ? keys.key.toUpperCase() : keys.key
  parts.push(name)
  return parts.join(mac ? '' : '+')
}

/** 이 눌림이 그 단축키인지. 글쇠 이름은 대소문자를 가리지 않습니다. */
export function matches(event: KeyboardEvent, keys: KeySpec): boolean {
  const mod = isMac() ? event.metaKey : event.ctrlKey
  if (Boolean(keys.mod) !== mod) return false
  if (Boolean(keys.shift) !== event.shiftKey) return false
  if (Boolean(keys.alt) !== event.altKey) return false
  // ⌥ 를 누르면 맥에서 event.key 가 딴 글자(˜)가 됩니다. 물리 글쇠 이름으로 견줍니다.
  // ⇧ 를 누르면 숫자 글쇠도 딴 글자(!)가 됩니다. 이쪽도 물리 글쇠 이름으로 견줍니다.
  const code = event.code.startsWith('Key')
    ? event.code.slice(3).toLowerCase()
    : event.code.startsWith('Digit') ? event.code.slice(5) : null
  return event.key.toLowerCase() === keys.key.toLowerCase() || (code !== null && code === keys.key.toLowerCase())
}
