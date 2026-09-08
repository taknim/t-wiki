import type { GitHubConfig } from '../../types'

/*
 * GitHub 웹 화면으로 가는 주소.
 *
 * 여기서 짓는 것은 사람이 눌러 볼 링크뿐입니다. 주고받기는 api.ts 가 합니다.
 * 저장소를 아직 안 골랐거나 이 폴더의 설정을 지운 뒤라면 주소를 지을 수 없으니
 * null 을 돌려줍니다. 어디로도 가지 못하는 링크를 두느니 아예 내보내지 않습니다.
 */
function repoBase(config: GitHubConfig): string | null {
  const owner = config.owner.trim()
  const repo = config.repo.trim()
  if (!owner || !repo) return null
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

export function commitUrl(config: GitHubConfig, sha: string | null): string | null {
  const base = repoBase(config)
  return base && sha ? `${base}/commit/${sha}` : null
}

/**
 * 저장소의 커밋 목록. 하위 폴더를 정해 두었으면 그 아래만 추려 보여 줍니다.
 * 우리가 올린 것 말고 다른 사람이 올린 것까지 한자리에서 볼 수 있습니다.
 */
export function commitsUrl(config: GitHubConfig): string | null {
  const base = repoBase(config)
  if (!base) return null
  const branch = encodeURIComponent(config.branch.trim() || 'main')
  const under = config.basePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/commits/${branch}/${under ? `${under}/` : ''}`
}
