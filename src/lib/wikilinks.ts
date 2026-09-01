import type { DocIndex } from '../types'
import { fileNameOf } from './paths'

const WIKILINK = /\[\[([^\][|]+)(?:\|([^\]]+))?\]\]/g
const FENCE = /^```[\s\S]*?^```/gm
const INLINE_CODE = /`[^`\n]*`/g

/** 코드 블록 안의 [[...]] 는 링크로 치지 않습니다. */
function stripCode(markdown: string): string {
  return markdown.replace(FENCE, '').replace(INLINE_CODE, '')
}

export function extractLinks(markdown: string): string[] {
  const targets: string[] = []
  const body = stripCode(markdown)
  for (const match of body.matchAll(WIKILINK)) {
    targets.push(match[1].trim())
  }
  return targets
}

export function titleOf(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.replace(/\.md$/i, '')
}

/**
 * [[대상]] 을 실제 문서 경로로 해석합니다.
 * 정확한 경로 → 확장자 붙인 경로 → 파일명 일치 순으로 찾고, 없으면 null.
 */
export function resolveLink(target: string, index: DocIndex): string | null {
  const clean = target.trim().replace(/^\.?\//, '')
  if (!clean) return null

  if (index.has(clean)) return clean
  const withExt = clean.toLowerCase().endsWith('.md') ? clean : `${clean}.md`
  if (index.has(withExt)) return withExt

  const wanted = titleOf(withExt).toLowerCase()
  const matches = [...index.keys()].filter((path) => titleOf(path).toLowerCase() === wanted)
  if (matches.length > 0) {
    // 같은 이름이 여러 폴더에 있으면 경로가 가장 짧은(=루트에 가까운) 것을 씁니다.
    return matches.sort((a, b) => a.length - b.length)[0]
  }
  return null
}

export interface Backlink {
  path: string
  title: string
  contexts: string[]
}

/** 이 문서를 가리키는 다른 문서들을, 링크가 등장한 줄과 함께 모읍니다. */
export function backlinksFor(targetPath: string, index: DocIndex): Backlink[] {
  const results: Backlink[] = []

  for (const entry of index.values()) {
    if (entry.path === targetPath) continue

    const contexts: string[] = []
    const lines = entry.content.split('\n')
    for (const line of lines) {
      for (const match of line.matchAll(WIKILINK)) {
        if (resolveLink(match[1].trim(), index) === targetPath) {
          contexts.push(line.trim())
          break
        }
      }
    }
    if (contexts.length > 0) {
      results.push({ path: entry.path, title: fileNameOf(entry.path), contexts })
    }
  }

  return results.sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}

/** 아직 문서가 없는 [[링크]] 목록. 위키에서 "다음에 쓸 글"을 찾는 용도입니다. */
export function danglingLinks(index: DocIndex): Map<string, string[]> {
  const dangling = new Map<string, string[]>()
  for (const entry of index.values()) {
    for (const target of extractLinks(entry.content)) {
      if (resolveLink(target, index) === null) {
        const sources = dangling.get(target) ?? []
        if (!sources.includes(entry.path)) sources.push(entry.path)
        dangling.set(target, sources)
      }
    }
  }
  return dangling
}
