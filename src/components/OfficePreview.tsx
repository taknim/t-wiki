import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { readBinaryFile } from '../lib/fsAccess'

interface OfficePreviewProps {
  root: FileSystemDirectoryHandle
  path: string
}

/** 아주 큰 시트는 앞부분만 그립니다. 글 첨부 미리보기와 같은 잣대입니다. */
const MAX_ROWS = 500

interface Sheet {
  name: string
  rows: string[][]
  total: number
}

/**
 * 엑셀을 표로 그립니다.
 *
 * 읽는 벌(SheetJS)은 이 파일을 열 때만 내려받습니다. 첫 화면에 지고 다닐 무게가 아닙니다.
 * 셀은 서식이 입혀진 글자 그대로 가져옵니다. 날짜와 소수점이 사람이 보던 모양대로 나옵니다.
 */
export function SheetPreview({ root, path }: OfficePreviewProps) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [at, setAt] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // 파일이 바뀌면 렌더 중에 비웁니다. effect 에서 비우면 옛 시트가 한 프레임 남습니다.
  const [shown, setShown] = useState(path)
  if (shown !== path) {
    setShown(path)
    setSheets(null)
    setAt(0)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const [xlsx, blob] = await Promise.all([import('xlsx'), readBinaryFile(root, path)])
        if (cancelled) return

        const book = xlsx.read(await blob.arrayBuffer(), { type: 'array' })
        const found = book.SheetNames.map((name) => {
          const rows = xlsx.utils.sheet_to_json<string[]>(book.Sheets[name], {
            header: 1,
            // 서식이 입혀진 글자로 받습니다. 날짜가 45000 같은 일련번호로 나오지 않습니다.
            raw: false,
            defval: '',
            blankrows: false,
          })
          return { name, rows: rows.slice(0, MAX_ROWS), total: rows.length }
        })
        if (!cancelled) setSheets(found)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [root, path])

  if (error) return <p className="status status-error">{error}</p>
  if (!sheets) return <p className="asset-note">시트를 읽는 중…</p>
  if (sheets.length === 0) return <p className="panel-empty">시트가 없습니다.</p>

  const sheet = sheets[Math.min(at, sheets.length - 1)]
  const columns = sheet.rows.reduce((most, row) => Math.max(most, row.length), 0)

  return (
    <div className="preview text-preview">
      {/* 시트가 여럿이면 아래쪽 탭으로 오갑니다. 엑셀에서 보던 자리와 같습니다. */}
      {sheets.length > 1 && (
        <div className="sheet-tabs" role="group" aria-label="시트">
          {sheets.map((one, index) => (
            <button
              key={one.name}
              type="button"
              className={index === at ? 'is-active' : ''}
              aria-pressed={index === at}
              onClick={() => setAt(index)}
            >
              {one.name}
            </button>
          ))}
        </div>
      )}

      {sheet.rows.length === 0 ? (
        <p className="panel-empty">빈 시트입니다.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              {sheet.rows.map((row, index) => (
                <tr key={index}>
                  <td className="row-number">{index + 1}</td>
                  {Array.from({ length: columns }, (_, cell) => (
                    <td key={cell}>{row[cell] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        {sheet.total}행 · {columns}열
        {sheet.total > MAX_ROWS && ` (앞 ${MAX_ROWS}행만 표시)`}
      </p>
    </div>
  )
}

/**
 * 워드를 글로 풀어 보여 줍니다.
 *
 * 원본 쪽 나눔이나 여백까지 그대로 옮기지는 못합니다. 제목·목록·표·굵기와 그림까지,
 * 읽는 데 필요한 것만 살립니다. 파일에서 온 HTML 이므로 그리기 전에 반드시 걸러 냅니다.
 */
export function WordPreview({ root, path }: OfficePreviewProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 파일이 바뀌면 렌더 중에 비웁니다. effect 에서 비우면 옛 글이 한 프레임 남습니다.
  const [shown, setShown] = useState(path)
  if (shown !== path) {
    setShown(path)
    setHtml(null)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const [mammoth, blob] = await Promise.all([import('mammoth'), readBinaryFile(root, path)])
        if (cancelled) return

        const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
        if (!cancelled) setHtml(DOMPurify.sanitize(result.value))
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [root, path])

  if (error) return <p className="status status-error">{error}</p>
  if (html === null) return <p className="asset-note">문서를 읽는 중…</p>
  if (html.trim() === '') return <p className="panel-empty">글이 없는 문서입니다.</p>

  return (
    <div
      className="preview text-preview markdown-body"
      // 걸러 낸 뒤라 그대로 넣습니다. 뒤에서 손대는 것이 없어 React 가 맡아도 됩니다.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
