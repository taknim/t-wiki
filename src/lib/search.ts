import type { DocIndex, SearchHit } from '../types'
import { titleOf } from './wikilinks'

const CONTEXT = 40

function findAll(haystack: string, needle: string): number[] {
  const positions: number[] = []
  const lowerHaystack = haystack.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  let from = 0
  while (true) {
    const at = lowerHaystack.indexOf(lowerNeedle, from)
    if (at === -1) break
    positions.push(at)
    from = at + lowerNeedle.length
  }
  return positions
}

/** 매치 위치 앞뒤를 잘라 하이라이트용 조각 배열로 만듭니다. */
function buildSnippet(content: string, at: number, length: number): SearchHit['snippet'] {
  const start = Math.max(0, at - CONTEXT)
  const end = Math.min(content.length, at + length + CONTEXT)
  const head = (start > 0 ? '…' : '') + content.slice(start, at).replace(/\s+/g, ' ')
  const hit = content.slice(at, at + length)
  const tail = content.slice(at + length, end).replace(/\s+/g, ' ') + (end < content.length ? '…' : '')
  return [
    { text: head, hit: false },
    { text: hit, hit: true },
    { text: tail, hit: false },
  ]
}

export function searchDocs(query: string, index: DocIndex, limit = 50): SearchHit[] {
  const needle = query.trim()
  if (needle.length === 0) return []

  const hits: SearchHit[] = []
  for (const entry of index.values()) {
    const title = titleOf(entry.path)
    const titleMatches = findAll(title, needle).length
    const bodyMatches = findAll(entry.content, needle)

    if (titleMatches === 0 && bodyMatches.length === 0) continue

    // 제목 일치를 본문보다 훨씬 크게 봅니다. 위키에서는 보통 문서 이름으로 찾으니까요.
    const score = titleMatches * 100 + bodyMatches.length
    const snippet = bodyMatches.length > 0
      ? buildSnippet(entry.content, bodyMatches[0], needle.length)
      : [{ text: '제목에서 일치', hit: false }]

    hits.push({ path: entry.path, title, snippet, score })
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ko')).slice(0, limit)
}
