import type { AssetIndex } from '../types'
import { readBinaryFile } from './fsAccess'

/**
 * 볼트 안 이미지의 blob URL 캐시.
 * 문서를 오갈 때마다 다시 읽지 않도록 볼트 단위로 들고 있다가 볼트가 바뀌면 통째로 버립니다.
 */
const cache = new Map<string, string>()

export function clearAssetCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url)
  cache.clear()
}

/**
 * 임베드 대상 경로를 볼트 안의 실제 파일 경로로 해석합니다.
 * 문서 기준 상대경로 → 볼트 루트 기준 → 파일명 일치 순으로 찾습니다.
 */
function resolveAssetPath(target: string, docPath: string, assets: AssetIndex): string | null {
  const clean = target.replace(/^\.?\//, '').trim()
  if (!clean) return null

  const docDir = docPath.split('/').slice(0, -1).join('/')
  const candidates = docDir ? [`${docDir}/${clean}`, clean] : [clean]

  const known = new Set<string>()
  for (const paths of assets.values()) for (const path of paths) known.add(path)

  for (const candidate of candidates) {
    if (known.has(candidate)) return candidate
  }

  // 옵시디안처럼 파일명만 적은 경우. 같은 이름이 여럿이면 경로가 짧은 쪽을 씁니다.
  const byName = assets.get((clean.split('/').pop() ?? clean).toLowerCase())
  if (byName && byName.length > 0) return [...byName].sort((a, b) => a.length - b.length)[0]

  return null
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
}

async function toObjectUrl(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const cached = cache.get(path)
  if (cached) return cached

  const blob = await readBinaryFile(root, path)

  // 형식이 비어 있으면 <img> 가 내용을 해석하지 못합니다. 확장자로 채워 줍니다.
  const extension = (path.split('.').pop() ?? '').toLowerCase()
  const typed = blob.type
    ? blob
    : new Blob([blob], { type: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream' })

  const url = URL.createObjectURL(typed)
  cache.set(path, url)
  return url
}

/** 미리보기 안의 `data-vault-src` 이미지를 실제로 보이게 바꿉니다. */
export async function resolveVaultImages(
  container: HTMLElement,
  root: FileSystemDirectoryHandle,
  docPath: string,
  assets: AssetIndex,
): Promise<void> {
  const images = [...container.querySelectorAll<HTMLImageElement>('img[data-vault-src]')]

  for (const image of images) {
    const target = image.dataset.vaultSrc ?? ''
    const path = resolveAssetPath(target, docPath, assets)

    if (!path) {
      image.replaceWith(missingNotice(target))
      continue
    }

    try {
      image.src = await toObjectUrl(root, path)
      image.title = path
      delete image.dataset.vaultSrc
    } catch {
      image.replaceWith(missingNotice(target))
    }
  }
}

function missingNotice(target: string): HTMLElement {
  const notice = document.createElement('span')
  notice.className = 'missing-asset'
  notice.textContent = `이미지를 찾을 수 없습니다: ${target}`
  return notice
}
