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

/**
 * 앱이 폴더 안에 두는 파일.
 *
 * 즐겨찾기를 여기에 적어 두면 GitHub 동기화를 타고 다른 기기로도 따라갑니다.
 * 트리에는 보이지 않습니다. 사람이 열어 고칠 파일이 아니라 앱이 쓰는 살림입니다.
 * 점으로 시작하지 않는 것은 그러면 동기화에서도 빠지기 때문입니다.
 */
export const FAVORITES_FILE = '_t-wiki.favorites.json'

/** 앱이 두는 파일인지. 트리에서 감출 때 씁니다. */
export function isAppFile(path: string): boolean {
  return path === FAVORITES_FILE
}
