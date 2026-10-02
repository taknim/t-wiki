import { useEffect, useState } from 'react'
import { dirEntries, readBinaryFile } from '../lib/fsAccess'
import { archivePart, extensionOf, formatBytes } from '../lib/attachments'
import { joinParts, listZip, type ZipListing } from '../lib/zipList'

interface ArchiveViewProps {
  root: FileSystemDirectoryHandle
  path: string
}

/**
 * 압축 안에 무엇이 들었는지 보여 줍니다.
 *
 * **풀지 않습니다.** 끝자락의 목차만 읽어 이름과 크기를 늘어놓습니다. 100MB 짜리라도
 * 읽는 양은 몇 킬로바이트입니다.
 *
 * 읽을 수 있는 것은 **zip 뿐**입니다. 7z 는 목차 자체가 LZMA 로 눌려 있어 푸는 코드를
 * 들이지 않고는 이름 하나 꺼낼 수 없고, rar·alz 는 규격이 공개돼 있지 않습니다.
 * 그래도 **파일은 그대로 보관하고 동기화합니다** — 못 읽는다고 넣지도 못하게 할 까닭은 없습니다.
 */
export function ArchiveView({ root, path }: ArchiveViewProps) {
  const [listing, setListing] = useState<ZipListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parts, setParts] = useState(0)

  // 파일이 바뀌면 렌더 중에 비웁니다. effect 에서 비우면 옛 목록이 한 프레임 남습니다.
  const [shown, setShown] = useState(path)
  if (shown !== path) {
    setShown(path)
    setListing(null)
    setError(null)
    setParts(0)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const found = await readArchive(root, path)
        if (cancelled) return
        setParts(found.parts)
        setListing(found.listing)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [root, path])

  if (error) return <p className="status status-error">{error}</p>
  if (!listing) return <p className="panel-empty">압축 목록을 읽는 중…</p>
  if (listing.total === 0) return <p className="panel-empty">빈 압축 파일입니다.</p>

  // 폴더 자리는 빼고 셉니다. 폴더는 이름만 적힌 자리라 크기가 없습니다.
  const files = listing.entries.filter((one) => !one.dir)
  const bytes = files.reduce((sum, one) => sum + one.bytes, 0)
  /*
   * 지은 때는 **있는 압축에만** 칸을 세웁니다. 윈도에서 만든 것이 아니면 그 칸이 통째로
   * 비어, 빈 칸 하나가 표의 폭만 먹습니다.
   */
  const hasCreated = listing.entries.some((one) => one.created !== null)
  const when = (at: number | null) => (at === null ? '' : new Date(at).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }))
  // 압축율. 푼 크기가 0 이면(빈 파일·폴더) 셀 것이 없습니다.
  const ratio = (one: { bytes: number; packed: number }) =>
    (one.bytes === 0 ? '' : `${Math.round((1 - one.packed / one.bytes) * 100)}%`)
  /*
   * 폴더 안엣것은 **들여씁니다.** 긴 경로를 통째로 적어 두었더니 어느 것이 어느 폴더
   * 아래인지 눈으로 좇기 어려웠습니다. 깊이만큼 밀고 **마지막 마디만** 적되, 온 경로는
   * 쪽지로 남깁니다 — 폴더 자리가 아예 없는 압축도 있어 경로를 잃으면 안 됩니다.
   */
  const depth = (path: string) => path.replace(/\/$/, '').split('/').length - 1
  const leaf = (path: string) => path.replace(/\/$/, '').split('/').pop() ?? path

  return (
    <div className="archive-view">
      <div className="table-wrap">
        <table className="data-table archive-table">
          <thead>
            <tr>
              <th>이름</th>
              <th className="archive-size">크기</th>
              <th className="archive-size">압축 크기</th>
              <th className="archive-size">압축율</th>
              <th>최종 수정일시</th>
              {hasCreated && <th>생성일시</th>}
            </tr>
          </thead>
          <tbody>
            {listing.entries.map((one) => (
              <tr key={one.path} className={one.dir ? 'archive-dir' : undefined}>
                <td
                  className="archive-name"
                  style={{ paddingInlineStart: `${10 + depth(one.path) * 18}px` }}
                  data-tip={depth(one.path) > 0 ? one.path : undefined}
                >
                  {leaf(one.path)}{one.dir && '/'}
                </td>
                <td className="archive-size">{one.dir ? '' : formatBytes(one.bytes)}</td>
                <td className="archive-size">{one.dir ? '' : formatBytes(one.packed)}</td>
                <td className="archive-size">{one.dir ? '' : ratio(one)}</td>
                <td>{when(one.at)}</td>
                {hasCreated && <td>{when(one.created)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 합계는 unzip 처럼 목록 **아래**에 둡니다. 위에 두면 목록을 보기 전에 숫자부터 읽게 됩니다. */}
      <p className="archive-sum">
        총 {files.length.toLocaleString()}개 파일 · {formatBytes(bytes)}
        {parts > 1 && ` · 조각 ${parts}개를 이어서 읽음`}
        {listing.cut && ` (앞 ${listing.entries.length.toLocaleString()}개만 표시 · 모두 ${listing.total.toLocaleString()}개)`}
      </p>
    </div>
  )
}

/** 읽을 수 없는 압축이 왜 그런지. 못 읽는 까닭을 밝히는 편이 빈 화면보다 낫습니다. */
const UNREADABLE: Record<string, string> = {
  '7z': '7z 은 목차 자체가 눌려 있어(LZMA) 푸는 코드 없이는 이름 하나도 꺼낼 수 없습니다.',
  rar: 'rar 은 규격이 공개돼 있지 않아 목록을 읽지 못합니다.',
  alz: 'alz 는 규격이 공개돼 있지 않아 목록을 읽지 못합니다.',
}

/**
 * 압축을 읽습니다. 나눠 담은 조각이면 **형제 조각을 모아 이어서** 읽습니다.
 *
 * 조각 하나만 읽으면 목차가 마지막 조각에만 있어 늘 실패합니다. 같은 바탕 이름을 가진
 * 조각을 차례대로 모아 하나처럼 봅니다.
 */
async function readArchive(root: FileSystemDirectoryHandle, path: string) {
  const extension = extensionOf(path)
  const unreadable = UNREADABLE[extension]
  if (unreadable) throw new Error(`${unreadable} 파일은 그대로 보관하고 동기화합니다.`)

  const part = archivePart(path)
  if (!part) return { listing: await listZip(await readBinaryFile(root, path)), parts: 1 }

  const dir = path.split('/').slice(0, -1).join('/')
  const siblings = (await dirEntries(root, dir))
    .filter((entry) => entry.kind === 'file')
    .map((entry) => ({ name: entry.name, part: archivePart(entry.name) }))
    .filter((one) => one.part !== null && one.part.base === part.base)
    .sort((a, b) => (a.part?.order ?? 0) - (b.part?.order ?? 0))
  const blobs = await Promise.all(
    siblings.map((one) => readBinaryFile(root, dir ? `${dir}/${one.name}` : one.name)),
  )
  const base = extensionOf(part.base)
  if (UNREADABLE[base]) throw new Error(`${UNREADABLE[base]} 파일은 그대로 보관하고 동기화합니다.`)
  return { listing: await listZip(joinParts(blobs)), parts: blobs.length }
}
