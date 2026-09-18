import type { ImageBackdrop, SidebarTab } from '../types'

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

/*
 * 고른 이미지를 그려 볼지.
 *
 * 이 브라우저의 취향이라 여기 둡니다. 화면을 그리는 길목에서 곧바로 읽어야
 * 꺼 두고도 이미지가 한 번 떴다 사라지는 일이 없어 localStorage 를 씁니다.
 * 기본은 켜짐입니다. 아무것도 건드리지 않은 사람에게는 보이는 쪽이 맞습니다.
 */
const IMAGE_PREVIEW = 'mdwiki:image-preview'

export function readImagePreview(): boolean {
  try {
    return localStorage.getItem(IMAGE_PREVIEW) !== 'off'
  } catch {
    return true
  }
}

export function writeImagePreview(on: boolean): void {
  try {
    localStorage.setItem(IMAGE_PREVIEW, on ? 'on' : 'off')
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 오피스 문서(워드·엑셀)를 그려 볼지.
 *
 * 읽는 벌이 큰 편이라, 열 때마다 내려받는 것이 달갑지 않은 사람이 있습니다.
 * 꺼 두면 파일을 읽지도, 벌을 내려받지도 않고 안내만 내놓습니다.
 * 이미지 미리보기와 같은 성격이라 나란히 둡니다. 기본은 켜짐입니다.
 */
const OFFICE_PREVIEW = 'mdwiki:office-preview'

export function readOfficePreview(): boolean {
  try {
    return localStorage.getItem(OFFICE_PREVIEW) !== 'off'
  } catch {
    return true
  }
}

export function writeOfficePreview(on: boolean): void {
  try {
    localStorage.setItem(OFFICE_PREVIEW, on ? 'on' : 'off')
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 이미지 미리보기의 바탕.
 *
 * 그림마다 알맞은 바탕이 다릅니다. 흰 로고는 어두운 바탕에서, 검은 도표는 밝은
 * 바탕에서 드러납니다. 어느 쪽인지 알아맞히려 들면 틀리는 날이 있으므로,
 * 고를 수 있게 두고 고른 것을 기억합니다.
 * 기본은 손대지 않은 본디 모습입니다. 고르지 않은 사람의 화면은 그대로여야 합니다.
 */
const IMAGE_BACKDROP = 'mdwiki:image-backdrop'
export const DEFAULT_IMAGE_BACKDROP: ImageBackdrop = 'theme'

export function isImageBackdrop(value: unknown): value is ImageBackdrop {
  return value === 'theme' || value === 'light' || value === 'mid' || value === 'dark'
}

export function readImageBackdrop(): ImageBackdrop {
  try {
    // 모르는 값이면 기본으로 돌립니다. 예전에 두었던 바둑판이 여기로 걸러집니다.
    const saved = localStorage.getItem(IMAGE_BACKDROP)
    return isImageBackdrop(saved) ? saved : DEFAULT_IMAGE_BACKDROP
  } catch {
    return DEFAULT_IMAGE_BACKDROP
  }
}

export function writeImageBackdrop(value: ImageBackdrop): void {
  try {
    localStorage.setItem(IMAGE_BACKDROP, value)
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 나란히 볼 때 왼쪽(편집기)이 차지하는 몫.
 *
 * 트리 너비와 같은 성격이라 여기 둡니다. 사람마다 원문을 보는 눈과 결과를 보는 눈의
 * 비중이 다릅니다. 첫 그림부터 제 몫으로 그려야 반반이었다가 옮겨 가는 깜빡임이
 * 없으므로 localStorage 를 씁니다.
 *
 * 어느 쪽도 아주 사라지지는 않게 양끝을 막아 둡니다. 한쪽이 없어지면 나란히 볼
 * 까닭이 없고, 손잡이도 잡을 수 없게 됩니다.
 */
const SPLIT_RATIO = 'mdwiki:split-ratio'

export const DEFAULT_SPLIT_RATIO = 50
export const MIN_SPLIT_RATIO = 20
export const MAX_SPLIT_RATIO = 80

export function clampSplitRatio(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_SPLIT_RATIO
  return Math.min(Math.max(Math.round(percent), MIN_SPLIT_RATIO), MAX_SPLIT_RATIO)
}

export function readSplitRatio(): number {
  try {
    const saved = Number(localStorage.getItem(SPLIT_RATIO))
    return saved ? clampSplitRatio(saved) : DEFAULT_SPLIT_RATIO
  } catch {
    return DEFAULT_SPLIT_RATIO
  }
}

export function writeSplitRatio(percent: number): void {
  try {
    localStorage.setItem(SPLIT_RATIO, String(clampSplitRatio(percent)))
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 옆줄에 즐겨찾기와 폴더 중 어느 탭을 펴 두었는지.
 *
 * 기본은 폴더입니다. 처음 온 사람에게는 담아 둔 즐겨찾기가 없습니다.
 * 첫 그림부터 제 탭으로 그려야 폴더가 보였다 즐겨찾기로 바뀌는 깜빡임이 없어
 * localStorage 를 씁니다.
 */
const SIDEBAR_TAB = 'mdwiki:sidebar-tab'

export const DEFAULT_SIDEBAR_TAB: SidebarTab = 'tree'

export function readSidebarTab(): SidebarTab {
  try {
    return localStorage.getItem(SIDEBAR_TAB) === 'favorites' ? 'favorites' : DEFAULT_SIDEBAR_TAB
  } catch {
    return DEFAULT_SIDEBAR_TAB
  }
}

export function writeSidebarTab(tab: SidebarTab): void {
  try {
    localStorage.setItem(SIDEBAR_TAB, tab)
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 설정 창에서 마지막으로 보던 자리.
 *
 * 설정은 잠깐 들러 고치고 닫는 자리입니다. 다음에 열 때 보던 갈래가 그대로 나오면
 * 이어서 손볼 수 있고, 매번 맨 위에서 다시 굴려 내려가지 않아도 됩니다.
 * 취향이 아니라 책갈피라 설정 파일에는 담지 않습니다. 다른 기기가 알 일이 아닙니다.
 * 어느 값이 유효한지는 설정 창이 압니다. 여기서는 모양만 봅니다.
 */
const SETTINGS_SPOT = 'mdwiki:settings-spot'

export interface SettingsSpot {
  /** 묶음(일반·모양·GitHub 동기화). */
  tab: string
  /** 묶음 안의 갈래. 맨 위라 갈래를 넘기기 전이면 null. */
  field: string | null
}

export function readSettingsSpot(): SettingsSpot | null {
  try {
    const raw = localStorage.getItem(SETTINGS_SPOT)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SettingsSpot>
    if (typeof parsed.tab !== 'string') return null
    return { tab: parsed.tab, field: typeof parsed.field === 'string' ? parsed.field : null }
  } catch {
    return null
  }
}

export function writeSettingsSpot(spot: SettingsSpot): void {
  try {
    localStorage.setItem(SETTINGS_SPOT, JSON.stringify(spot))
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/*
 * 휴지통을 저절로 비울지.
 *
 * 켜 두면 동기화할 때마다 옮긴 지 정한 날수가 지난 것을 비웁니다. 기본은 꺼짐입니다.
 * 지우는 일을 기본으로 삼을 수는 없습니다. 날수는 옮긴 때를 잣대로 셉니다.
 */
const TRASH_PURGE = 'mdwiki:trash-purge'
const TRASH_DAYS = 'mdwiki:trash-days'

export interface TrashPolicy {
  autoPurge: boolean
  /** 며칠이 지나면 비울지. */
  days: number
}

export const DEFAULT_TRASH_POLICY: TrashPolicy = { autoPurge: false, days: 30 }

export function clampTrashDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_TRASH_POLICY.days
  return Math.min(Math.max(Math.round(days), 1), 365)
}

export function readTrashPolicy(): TrashPolicy {
  try {
    const days = Number(localStorage.getItem(TRASH_DAYS))
    return {
      autoPurge: localStorage.getItem(TRASH_PURGE) === 'on',
      days: localStorage.getItem(TRASH_DAYS) === null ? DEFAULT_TRASH_POLICY.days : clampTrashDays(days),
    }
  } catch {
    return DEFAULT_TRASH_POLICY
  }
}

export function writeTrashPolicy(policy: TrashPolicy): void {
  try {
    localStorage.setItem(TRASH_PURGE, policy.autoPurge ? 'on' : 'off')
    localStorage.setItem(TRASH_DAYS, String(clampTrashDays(policy.days)))
  } catch {
    // 저장이 막혀 있어도 이번에는 그대로 적용됩니다.
  }
}

/**
 * 좁은 화면인지. 옆줄을 본문 옆이 아니라 위에 서랍처럼 띄우는 문턱입니다.
 * CSS 의 @media (max-width: 720px) 와 같은 값이어야 합니다.
 */
export const NARROW_QUERY = '(max-width: 720px)'
export const isNarrow = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
