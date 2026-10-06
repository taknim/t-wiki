import { dirEntries, exists, movePath, removeEntry } from './fsAccess'

/*
 * 폴더 정돈.
 *
 * 밖에서 들어온 파일에는 두 가지 군더더기가 따라옵니다. 하나는 **자모가 분리된 이름**
 * (맥이 NFD 로 적습니다), 다른 하나는 **운영체제가 만든 살림 파일**(`.DS_Store` 따위)입니다.
 * 앞의 것은 눈에는 같은 글자인데 찾기에서 어긋나고, 뒤의 것은 저장소에 쌓입니다.
 * 둘 다 **훑어서 보여 주고, 사람이 고른 뒤에** 손을 댑니다.
 */

/** 운영체제가 만들어 두는 살림 파일. 지워도 다시 생기며 아무 뜻이 없습니다. */
const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized'])

/** 맥이 압축이나 복사 때 흘리는 자취. 폴더째 또는 `._이름` 꼴로 따라옵니다. */
export function isJunk(name: string): boolean {
  return JUNK_NAMES.has(name) || name === '__MACOSX' || name.startsWith('._')
}

/** 자모가 분리된 이름인지. 모아 적은 꼴과 다르면 그렇습니다. */
export function isApart(name: string): boolean {
  return name.normalize('NFC') !== name
}

export interface TidyPlan {
  /** 합칠 이름들. 깊은 자리부터 담습니다 — 부모를 먼저 고치면 자식의 경로가 어긋납니다. */
  apart: { path: string; to: string }[]
  /** 지울 살림 파일들. */
  junk: { path: string; kind: 'file' | 'dir' }[]
}

/**
 * 볼트를 훑어 **할 일만** 모읍니다. 아무것도 고치지 않습니다.
 *
 * 숨은 파일까지 봅니다 — `.DS_Store` 는 점으로 시작해 평소 목록에서는 빠집니다.
 * 앱이 쓰는 자리(`_t-wiki.trash` 따위)는 건드리지 않습니다.
 */
export async function scanTidy(root: FileSystemDirectoryHandle): Promise<TidyPlan> {
  const plan: TidyPlan = { apart: [], junk: [] }

  const walk = async (dir: string): Promise<void> => {
    for (const entry of await dirEntries(root, dir)) {
      const path = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.name.startsWith('_t-wiki')) continue

      if (isJunk(entry.name)) {
        plan.junk.push({ path, kind: entry.kind })
        continue
      }
      if (entry.kind === 'dir') await walk(path)
      if (isApart(entry.name)) {
        // 깊은 자리가 먼저 담기도록 자식을 훑은 **뒤에** 담습니다.
        plan.apart.push({ path, to: dir ? `${dir}/${entry.name.normalize('NFC')}` : entry.name.normalize('NFC') })
      }
    }
  }

  await walk('')
  return plan
}

export interface TidyResult {
  done: number
  /** 손대지 못한 것과 그 까닭. 같은 이름이 이미 있으면 건드리지 않습니다. */
  skipped: { path: string; why: string }[]
}

/**
 * 이름을 모아 적습니다.
 *
 * 같은 이름이 이미 있으면 **건너뜁니다.** 덮어쓰면 남의 파일이 사라지는데, 정돈하자고
 * 부른 일에서 무언가를 잃는 것은 있을 수 없습니다.
 */
export async function joinNames(
  root: FileSystemDirectoryHandle,
  items: { path: string; to: string }[],
): Promise<TidyResult> {
  const skipped: { path: string; why: string }[] = []
  let done = 0

  for (const item of items) {
    try {
      if (await exists(root, item.to)) {
        skipped.push({ path: item.path, why: '같은 이름이 이미 있습니다' })
        continue
      }
      await movePath(root, item.path, item.to)
      done += 1
    } catch (cause) {
      skipped.push({ path: item.path, why: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  return { done, skipped }
}

/** 살림 파일을 지웁니다. 하나가 막혀도 나머지는 치웁니다. */
export async function removeJunk(
  root: FileSystemDirectoryHandle,
  items: { path: string }[],
): Promise<TidyResult> {
  const skipped: { path: string; why: string }[] = []
  let done = 0

  for (const item of items) {
    try {
      await removeEntry(root, item.path)
      done += 1
    } catch (cause) {
      skipped.push({ path: item.path, why: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  return { done, skipped }
}
