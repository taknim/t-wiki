/**
 * 저장할 때 문서에 손을 댈지 말지.
 *
 * 둘 다 기본은 꺼짐입니다. 아무것도 켜지 않으면 쓴 그대로 저장합니다.
 * 미리보기에서 정돈해 보여 주는 것과는 별개입니다. 그쪽은 파일을 건드리지 않습니다.
 *
 * localStorage 에 둡니다. 폴더가 아니라 이 브라우저의 취향이고,
 * 저장하는 길목에서 곧바로 읽어야 해서 비동기인 IndexedDB 는 맞지 않습니다.
 */
export interface SaveOptions {
  /** 줄 끝 공백과 문서 앞뒤의 빈 줄을 지웁니다. */
  trimWhitespace: boolean
  /** 문서 형식에 맞춰 들여쓰기를 다시 잡습니다. */
  tidyFormat: boolean
}

const TRIM = 'mdwiki:trim-on-save'
const TIDY = 'mdwiki:tidy-on-save'

export const DEFAULT_SAVE_OPTIONS: SaveOptions = { trimWhitespace: false, tidyFormat: false }

export function readSaveOptions(): SaveOptions {
  try {
    return {
      trimWhitespace: localStorage.getItem(TRIM) === 'on',
      tidyFormat: localStorage.getItem(TIDY) === 'on',
    }
  } catch {
    return DEFAULT_SAVE_OPTIONS
  }
}

export function writeSaveOptions(next: SaveOptions): void {
  try {
    localStorage.setItem(TRIM, next.trimWhitespace ? 'on' : 'off')
    localStorage.setItem(TIDY, next.tidyFormat ? 'on' : 'off')
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 트리를 접어 두었는지. 폴더가 아니라 이 브라우저의 취향이라 여기 둡니다.
 * 첫 그림부터 제 모습으로 그려야 펼쳤다 접히는 깜빡임이 없어 localStorage 를 씁니다.
 */
const SIDEBAR = 'mdwiki:sidebar-open'

export function readSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR) !== 'off'
  } catch {
    return true
  }
}

export function writeSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR, open ? 'on' : 'off')
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 설정을 내보낼 때 액세스 토큰까지 담을지.
 *
 * 다른 취향과 같이 기억해 둡니다. 켤 때마다 다시 켜야 하면 성가십니다.
 * 대신 켜져 있다는 것이 눈에 보여야 하므로, 체크 칸과 안내를 내보내기 단추 바로 옆에 둡니다.
 * 기본은 꺼짐입니다. 비밀이 파일에 적히는 일을 기본으로 삼을 수는 없습니다.
 */
const EXPORT_TOKEN = 'mdwiki:export-token'

export function readIncludeToken(): boolean {
  try {
    return localStorage.getItem(EXPORT_TOKEN) === 'on'
  } catch {
    return false
  }
}

export function writeIncludeToken(include: boolean): void {
  try {
    localStorage.setItem(EXPORT_TOKEN, include ? 'on' : 'off')
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 트리 너비. 사람마다 문서 이름 길이가 달라 알맞은 폭이 다릅니다.
 *
 * 너무 좁으면 이름이 잘리고 너무 넓으면 본문이 없어지므로 양끝을 막아 둡니다.
 * 창보다 넓어지는 일도 막습니다. 창을 줄여 놓고 온 다음 판에서도 본문이 남아야 합니다.
 */
const SIDEBAR_WIDTH = 'mdwiki:sidebar-width'

export const DEFAULT_SIDEBAR_WIDTH = 432
export const MIN_SIDEBAR_WIDTH = 240

export function maxSidebarWidth(): number {
  const room = typeof window === 'undefined' ? 1200 : window.innerWidth
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(720, Math.round(room * 0.6)))
}

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(Math.max(Math.round(width), MIN_SIDEBAR_WIDTH), maxSidebarWidth())
}

export function readSidebarWidth(): number {
  try {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH))
    return saved ? clampSidebarWidth(saved) : DEFAULT_SIDEBAR_WIDTH
  } catch {
    return DEFAULT_SIDEBAR_WIDTH
  }
}

export function writeSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH, String(clampSidebarWidth(width)))
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}
