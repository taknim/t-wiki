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

/**
 * 즐겨찾기 한 줄을 다른 줄의 앞이나 뒤로 옮긴 목록.
 *
 * 자리를 번호가 아니라 경로로 가리킵니다. 이름으로 걸러 보는 중에는 화면에 보이는
 * 줄과 목록의 번호가 어긋나서, 번호로 옮기면 엉뚱한 줄이 자리를 바꿉니다.
 * 걸러진 채로 옮겨도 화면에 없는 줄들의 앞뒤는 그대로 남습니다.
 */
export function reorderFavorites(
  paths: string[],
  from: string,
  to: string,
  place: 'before' | 'after',
): string[] {
  if (from === to) return paths
  const rest = paths.filter((one) => one !== from)
  const at = rest.indexOf(to)
  if (at === -1) return paths
  rest.splice(place === 'before' ? at : at + 1, 0, from)
  return rest
}

/**
 * 두 벌의 즐겨찾기를 하나로 합칩니다.
 *
 * 즐겨찾기 파일은 두 기기가 저마다 고쳐 두기 마련입니다. 여느 파일처럼 부딪힘으로
 * 다루면 한쪽 것이 사본으로 밀려나고 다른 쪽 것만 남아, 한 기기에서 담은 것이
 * 다른 기기에서 사라진 것처럼 보입니다. 목록은 합쳐도 잃을 것이 없습니다.
 * 이쪽 차례를 지키고, 저쪽에만 있는 것을 뒤에 답니다.
 */
export function mergeFavorites(mine: string, theirs: string): string {
  const parse = (raw: string): string[] => {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((one): one is string => typeof one === 'string' && one.length > 0)
        : []
    } catch {
      return []
    }
  }
  const ours = parse(mine)
  const merged = [...ours, ...parse(theirs).filter((one) => !ours.includes(one))]
  return favoritesFileBody(merged)
}
