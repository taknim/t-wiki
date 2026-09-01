/**
 * 화면에 보여 줄 경로. 최상위에서부터라는 것이 드러나도록 앞에 `/` 를 붙입니다.
 *
 * 저장할 때 쓰는 경로에는 붙이지 않습니다. 볼트 안에서는 상대 경로가 기준이고,
 * 앞에 `/` 가 붙으면 폴더 손잡이를 찾을 때 빈 조각이 하나 생깁니다.
 */
export function displayPath(path: string): string {
  return path ? `/${path}` : '/'
}

/** 화면에 보여 줄 이름. 확장자를 감추지 않습니다. */
export function fileNameOf(path: string): string {
  return path.split('/').pop() ?? path
}
