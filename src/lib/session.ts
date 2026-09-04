import { get, set, del } from 'idb-keyval'
import type { ViewMode } from '../types'

/** 폴더 하나에 대해 기억해 두는 화면 상태. */
export interface SessionState {
  expanded: string[]
  selectedPath: string | null
  selectedDir: string | null
  /** 편집·나란히·미리보기 중 어느 쪽으로 보고 있었는지. */
  viewMode: ViewMode
}

// 보기 모드는 나중에 더한 값이라, 그 전에 저장된 기록에는 없습니다.
interface SessionRecord extends Omit<SessionState, 'viewMode'> {
  handle: FileSystemDirectoryHandle
  savedAt: number
  viewMode?: ViewMode
}

export const DEFAULT_VIEW_MODE: ViewMode = 'split'

const VIEW_MODES: ViewMode[] = ['edit', 'split', 'preview']

/**
 * 저장소에서 읽은 값이라 무엇이든 들어 있을 수 있습니다.
 * 아는 모드가 아니면 기본값으로 돌립니다. 화면이 빈 채로 남는 것보다 낫습니다.
 */
function toViewMode(value: unknown): ViewMode {
  return VIEW_MODES.includes(value as ViewMode) ? (value as ViewMode) : DEFAULT_VIEW_MODE
}

const RECORDS = 'mdwiki:sessions'
const ENABLED = 'mdwiki:remember-session'

/** 기억해 둘 폴더 수. 오래된 것부터 버립니다. */
const MAX_RECORDS = 10

/**
 * 켜고 끄는 값만 localStorage 를 씁니다.
 * 폴더를 열자마자 복원할지 판단해야 하는데, IndexedDB 는 읽기가 비동기라
 * 그 사이에 화면이 한 번 깜빡입니다.
 */
export function isRememberEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED) !== 'off'
  } catch {
    return true
  }
}

export function setRememberEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED, enabled ? 'on' : 'off')
  } catch {
    // 저장이 막혀 있어도 이번 세션에는 그대로 적용됩니다.
  }
}

async function loadRecords(): Promise<SessionRecord[]> {
  return (await get<SessionRecord[]>(RECORDS)) ?? []
}

/**
 * 같은 폴더인지는 이름이 아니라 핸들로 가려냅니다.
 * 이름이 같은 폴더가 여럿 있어도 섞이지 않습니다.
 */
async function findIndex(records: SessionRecord[], root: FileSystemDirectoryHandle): Promise<number> {
  for (let at = 0; at < records.length; at += 1) {
    try {
      // 비교는 지금 열려 있는 핸들 쪽에서 겁니다.
      // 저장해 둔 쪽은 브라우저 저장소를 거치며 상태가 온전하지 않을 수 있습니다.
      if (await root.isSameEntry(records[at].handle)) return at
    } catch {
      // 핸들이 깨졌으면 건너뜁니다.
    }
  }
  return -1
}

export async function loadSession(root: FileSystemDirectoryHandle): Promise<SessionState | null> {
  if (!isRememberEnabled()) return null

  try {
    const records = await loadRecords()
    const at = await findIndex(records, root)
    if (at === -1) return null

    const { expanded, selectedPath, selectedDir, viewMode } = records[at]
    return { expanded, selectedPath, selectedDir, viewMode: toViewMode(viewMode) }
  } catch {
    return null
  }
}

export async function saveSession(
  root: FileSystemDirectoryHandle,
  state: SessionState,
): Promise<void> {
  if (!isRememberEnabled()) return

  try {
    const records = await loadRecords()
    const at = await findIndex(records, root)
    const record: SessionRecord = { handle: root, savedAt: Date.now(), ...state }

    if (at === -1) records.push(record)
    else records[at] = record

    records.sort((a, b) => b.savedAt - a.savedAt)
    await set(RECORDS, records.slice(0, MAX_RECORDS))
  } catch {
    // 저장에 실패해도 쓰던 흐름은 끊지 않습니다.
  }
}

export function clearSessions(): Promise<void> {
  return del(RECORDS)
}
