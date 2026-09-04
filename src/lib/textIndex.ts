import type { AssetIndex } from '../types'
import { isEditableText } from './attachments'
import { readFile } from './fsAccess'

/**
 * 텍스트 첨부(csv·json·yaml·xml·html·txt)의 본문 표.
 *
 * 폴더를 열 때는 읽지 않습니다. 마크다운과 달리 표나 로그가 섞여 있어, 몇십 장만
 * 있어도 폴더 열기가 눈에 띄게 느려집니다. 그 대신 검색을 처음 시작할 때 한 번
 * 읽어 두고, 그 뒤로는 표에서 꺼내 씁니다.
 *
 * 캐시는 볼트 하나 몫입니다. 폴더가 바뀌면 통째로 버립니다.
 */
const cache = new Map<string, { at: number; content: string }>()

export function clearTextIndex(): void {
  cache.clear()
}

/**
 * 이보다 큰 텍스트는 읽지 않습니다.
 *
 * 검색은 글자를 칠 때마다 도는 일이라, 수십 MB 짜리 로그를 메모리에 올려 두면
 * 그 뒤로 계속 훑게 됩니다. 이런 파일은 이름으로만 찾습니다.
 */
export const MAX_SEARCHABLE_BYTES = 512 * 1024

/** 본문까지 뒤질 만한 첨부인지. */
export function isSearchableText(path: string, size: number): boolean {
  return isEditableText(path) && size <= MAX_SEARCHABLE_BYTES
}

/**
 * 텍스트 첨부를 읽어 경로 → 본문 표로 돌려줍니다.
 *
 * 지난번에 읽어 둔 것은 수정 시각이 그대로면 다시 읽지 않습니다.
 * 읽다가 실패한 파일은 그냥 건너뜁니다. 검색은 되도록 많이 보여 주는 일이지,
 * 파일 하나 때문에 멈출 일이 아닙니다.
 */
export async function readTextIndex(
  root: FileSystemDirectoryHandle,
  assets: AssetIndex,
): Promise<Map<string, string>> {
  const texts = new Map<string, string>()

  for (const entry of assets.values()) {
    if (!isSearchableText(entry.path, entry.size)) continue

    const cached = cache.get(entry.path)
    if (cached && cached.at === entry.lastModified) {
      texts.set(entry.path, cached.content)
      continue
    }

    try {
      const content = await readFile(root, entry.path)
      cache.set(entry.path, { at: entry.lastModified, content })
      texts.set(entry.path, content)
    } catch {
      // 읽을 수 없는 파일은 이름으로만 찾습니다.
    }
  }

  // 지워진 파일이 표에 남아 있지 않게 합니다.
  for (const path of [...cache.keys()]) {
    if (!texts.has(path)) cache.delete(path)
  }

  return texts
}
