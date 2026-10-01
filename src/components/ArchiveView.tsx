import { useEffect, useState } from 'react'
import { readBinaryFile } from '../lib/fsAccess'
import { formatBytes } from '../lib/attachments'
import { listZip, type ZipListing } from '../lib/zipList'

interface ArchiveViewProps {
  root: FileSystemDirectoryHandle
  path: string
}

/**
 * 압축 파일 안에 무엇이 들었는지 보여 줍니다.
 *
 * **풀지 않습니다.** 끝자락의 목차만 읽어 이름과 크기를 늘어놓습니다. 100MB 짜리라도
 * 읽는 양은 몇 킬로바이트입니다. 꺼내 쓰려면 압축을 푸는 프로그램으로 열면 되고,
 * 여기서 하려는 일은 "이 압축이 무엇이었더라" 를 가리는 것입니다.
 */
export function ArchiveView({ root, path }: ArchiveViewProps) {
  const [listing, setListing] = useState<ZipListing | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 파일이 바뀌면 렌더 중에 비웁니다. effect 에서 비우면 옛 목록이 한 프레임 남습니다.
  const [shown, setShown] = useState(path)
  if (shown !== path) {
    setShown(path)
    setListing(null)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const blob = await readBinaryFile(root, path)
        const found = await listZip(blob)
        if (!cancelled) setListing(found)
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
                <td className="archive-name">{one.path}</td>
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
        {listing.cut && ` (앞 ${listing.entries.length.toLocaleString()}개만 표시 · 모두 ${listing.total.toLocaleString()}개)`}
      </p>
    </div>
  )
}
