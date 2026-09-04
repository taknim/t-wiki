import type { DocIndex, SearchHit, VaultNode } from '../types'
import { fileNameOf } from './paths'

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

/**
 * 글자에서 찾은 자리를 조각으로 나눕니다.
 *
 * 본문 발췌와 같은 모양이라 화면에서는 한 가지 방법으로 그립니다.
 * 이름에도 발췌에도 같은 표시가 붙어야 어디가 걸렸는지 한눈에 보입니다.
 */
export function highlight(text: string, query: string): SearchHit['snippet'] {
  const needle = query.trim()
  const at = needle.length > 0 ? findAll(text, needle) : []
  if (at.length === 0) return [{ text, hit: false }]

  const pieces: SearchHit['snippet'] = []
  let from = 0
  for (const position of at) {
    if (position > from) pieces.push({ text: text.slice(from, position), hit: false })
    pieces.push({ text: text.slice(position, position + needle.length), hit: true })
    from = position + needle.length
  }
  if (from < text.length) pieces.push({ text: text.slice(from), hit: false })
  return pieces
}

/** 이름에 그 말이 들어 있는지. 즐겨찾기 거르기도 이 잣대를 씁니다. */
export function nameMatches(query: string, path: string): boolean {
  const needle = query.trim()
  if (needle.length === 0) return true
  return fileNameOf(path).toLowerCase().includes(needle.toLowerCase())
}

export interface SearchSource {
  /** 마크다운 본문. 폴더를 열 때 이미 읽어 둡니다. */
  docs: DocIndex
  /** 텍스트 첨부 본문. 검색을 시작할 때 읽어 채웁니다. 아직 없으면 빈 표입니다. */
  texts: Map<string, string>
  /** 트리에 보이는 모든 줄. 폴더와 첨부는 여기서만 찾습니다. */
  tree: VaultNode | null
}

/** 트리를 훑어 이름이 일치하는 줄을 모읍니다. 폴더도 함께 봅니다. */
function walkNames(
  node: VaultNode,
  needle: string,
  found: Map<string, { kind: 'dir' | 'file'; count: number }>,
): void {
  for (const child of node.children ?? []) {
    const count = findAll(child.name, needle).length
    if (count > 0) found.set(child.path, { kind: child.kind === 'dir' ? 'dir' : 'file', count })
    if (child.children) walkNames(child, needle, found)
  }
}

/**
 * 볼트 전체 검색.
 *
 * 이름은 폴더·문서·첨부를 가리지 않고 봅니다. 본문은 읽어 둔 것만 봅니다 —
 * 마크다운은 늘, 텍스트 첨부는 표가 채워진 뒤부터입니다. 그림이나 PDF 처럼
 * 글자가 없는 파일은 이름으로만 찾습니다.
 */
export function searchVault(query: string, source: SearchSource, limit = 50): SearchHit[] {
  const needle = query.trim()
  if (needle.length === 0) return []

  const byName = new Map<string, { kind: 'dir' | 'file'; count: number }>()
  if (source.tree) walkNames(source.tree, needle, byName)

  const hits = new Map<string, SearchHit>()

  const addBody = (path: string, content: string) => {
    const positions = findAll(content, needle)
    const name = byName.get(path)
    if (positions.length === 0 && !name) return

    hits.set(path, {
      path,
      kind: 'file',
      title: fileNameOf(path),
      // 제목 일치를 본문보다 훨씬 크게 봅니다. 위키에서는 보통 문서 이름으로 찾으니까요.
      score: (name?.count ?? 0) * 100 + positions.length,
      snippet: positions.length > 0
        ? buildSnippet(content, positions[0], needle.length)
        : [{ text: '이름에서 일치', hit: false }],
    })
  }

  for (const entry of source.docs.values()) addBody(entry.path, entry.content)
  for (const [path, content] of source.texts) addBody(path, content)

  // 본문을 못 읽는 것들(폴더·그림·큰 파일)은 이름만 가지고 담습니다.
  for (const [path, name] of byName) {
    if (hits.has(path)) continue
    hits.set(path, {
      path,
      kind: name.kind,
      title: fileNameOf(path),
      score: name.count * 100,
      snippet: [{ text: name.kind === 'dir' ? '폴더 이름에서 일치' : '이름에서 일치', hit: false }],
    })
  }

  return [...hits.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ko'))
    .slice(0, limit)
}
