import { useEffect, useState } from 'react'
import type { AssetIndex } from '../types'
import { readTextIndex } from '../lib/textIndex'

/** 아직 읽지 않았음을 가리키는 빈 표. 같은 것인지로 읽었는지를 가립니다. */
const EMPTY = new Map<string, string>()

/**
 * 텍스트 첨부의 본문을 검색이 필요할 때만 읽어 옵니다.
 *
 * 폴더를 열 때 미리 읽지 않습니다. 검색하지 않는 사람에게는 쓰지도 않을 파일을
 * 읽느라 폴더 열기가 느려질 뿐입니다. 대신 검색을 시작하면 한 번 읽고, 그 뒤로는
 * 캐시에서 꺼내므로 글자를 칠 때마다 다시 읽지 않습니다.
 */
export function useTextIndex(
  root: FileSystemDirectoryHandle | null,
  assets: AssetIndex,
  enabled: boolean,
): { texts: Map<string, string>; loading: boolean } {
  const [texts, setTexts] = useState(EMPTY)

  // 폴더가 바뀌면 앞 폴더의 본문을 들고 있지 않습니다. 렌더 중에 비웁니다.
  const [shownRoot, setShownRoot] = useState(root)
  let current = texts
  if (shownRoot !== root) {
    setShownRoot(root)
    setTexts(EMPTY)
    current = EMPTY
  }

  useEffect(() => {
    if (!enabled || !root) return
    let cancelled = false

    void (async () => {
      try {
        const next = await readTextIndex(root, assets)
        if (!cancelled) setTexts(next)
      } catch {
        // 통째로 실패해도 이름 검색은 됩니다. 기다린다는 표시만 거둡니다.
        if (!cancelled) setTexts(new Map())
      }
    })()

    return () => {
      cancelled = true
    }
  }, [root, assets, enabled])

  // 읽어 온 표가 들어오기 전까지가 기다리는 동안입니다.
  return { texts: current, loading: enabled && root !== null && current === EMPTY }
}
