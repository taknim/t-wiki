import type { AssetIndex } from '../types'
import { isEditableText } from './attachments'
import { readBinaryFile } from './fsAccess'

/**
 * 텍스트 첨부(csv·json·yaml·xml·html·txt)의 본문 표.
 *
 * 폴더를 열 때는 읽지 않습니다. 마크다운과 달리 표나 로그가 섞여 있어, 몇십 장만
 * 있어도 폴더 열기가 눈에 띄게 느려집니다. 그 대신 검색을 처음 시작할 때 한 번
 * 읽어 두고, 그 뒤로는 표에서 꺼내 씁니다.
 *
 * 캐시는 볼트 하나 몫입니다. 폴더가 바뀌면 통째로 버립니다.
 */
const cache = new Map<string, { at: number; text: IndexedText }>()

export function clearTextIndex(): void {
  cache.clear()
}

/**
 * 한 파일에서 읽어 둘 양.
 *
 * 검색은 글자를 칠 때마다 도는 일이라, 수십 MB 짜리 로그를 통째로 메모리에 올려 두면
 * 그 뒤로 계속 훑게 됩니다. 그렇다고 큰 파일을 아예 빼면 **이름으로만** 찾게 되는데,
 * 로그는 앞머리에 무엇이 든 파일인지 적혀 있는 일이 많습니다. 그래서 빼지 않고
 * **앞에서부터 이만큼만** 읽어 둡니다 — 없는 것보다 앞부분이라도 찾히는 편이 낫습니다.
 *
 * 1MB 는 동기화 상한(5MB)보다 빡빡합니다. 올려 두기만 하는 값과 **칠 때마다 훑는** 값은
 * 셈이 다릅니다 — 올리는 것은 한 번이고 검색은 글자 하나마다입니다.
 */
export const MAX_SEARCHABLE_BYTES = 1024 * 1024

/** 읽어 둔 본문. 큰 파일은 앞부분만 들어 있습니다. */
export interface IndexedText {
  content: string
  /** 뒤를 잘랐는지. 잘랐으면 "앞부분에서만 찾은 것" 이라고 밝혀야 합니다. */
  cut: boolean
}

/** 본문까지 뒤질 만한 첨부인지. 크기는 보지 않습니다 — 큰 것은 앞부분만 읽습니다. */
export function isSearchableText(path: string): boolean {
  return isEditableText(path)
}

/**
 * 앞에서부터 정한 만큼만 읽습니다.
 *
 * 바이트로 자르면 글자 가운데가 쪼개질 수 있어, **마지막 줄바꿈까지만** 남깁니다.
 * 쪼개진 글자가 섞이면 그 자리에서 검색이 어긋납니다.
 */
async function readHead(blob: Blob): Promise<IndexedText> {
  if (blob.size <= MAX_SEARCHABLE_BYTES) return { content: await blob.text(), cut: false }
  const text = await blob.slice(0, MAX_SEARCHABLE_BYTES).text()
  const lastBreak = text.lastIndexOf('\n')
  return { content: lastBreak > 0 ? text.slice(0, lastBreak + 1) : text, cut: true }
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
): Promise<Map<string, IndexedText>> {
  const texts = new Map<string, IndexedText>()

  for (const entry of assets.values()) {
    if (!isSearchableText(entry.path)) continue

    const cached = cache.get(entry.path)
    if (cached && cached.at === entry.lastModified) {
      texts.set(entry.path, cached.text)
      continue
    }

    try {
      const text = await readHead(await readBinaryFile(root, entry.path))
      cache.set(entry.path, { at: entry.lastModified, text })
      texts.set(entry.path, text)
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
