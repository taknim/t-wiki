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
