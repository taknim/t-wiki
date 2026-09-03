import * as fs from './fsAccess'
import { FAVORITES_FILE } from './paths'

/**
 * 즐겨찾기를 폴더 안 파일에 적어 둡니다.
 *
 * 브라우저에만 두면 다른 기기에서는 빈 목록으로 시작합니다. 폴더 안에 두면
 * GitHub 동기화를 타고 함께 오갑니다.
 *
 * 읽을 때는 파일을 믿지 않습니다. 사람이 열어 고쳤을 수도, 동기화가 반쪽만
 * 되었을 수도 있습니다. 글자 목록으로 읽히는 것만 골라 씁니다.
 */
export async function readFavoritesFile(
  root: FileSystemDirectoryHandle,
): Promise<string[] | null> {
  try {
    const raw = await fs.readFile(root, FAVORITES_FILE)
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((one): one is string => typeof one === 'string' && one.length > 0)
  } catch {
    // 파일이 없거나 읽을 수 없으면 담아 둔 것이 없는 셈입니다.
    return null
  }
}

/** 사람이 열어 볼 일은 없지만, 눈으로 확인할 수 있게 줄을 나눠 적습니다. */
export function favoritesFileBody(paths: string[]): string {
  return `${JSON.stringify(paths, null, 2)}\n`
}
