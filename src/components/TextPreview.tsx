import DOMPurify from 'dompurify'
import { useEffect, useState } from 'react'
import { highlightCode } from '../lib/markdown'
import { delimiterFor, highlightLanguage, parseDelimited, type TextPreviewKind } from '../lib/textPreview'

interface TextPreviewProps {
  kind: Exclude<TextPreviewKind, null>
  path: string
  text: string
}

/** 표가 아주 크면 화면이 멎으므로 앞부분만 그립니다. */
const MAX_ROWS = 500

export function TextPreview({ kind, path, text }: TextPreviewProps) {
  if (kind === 'table') return <TablePreview path={path} text={text} />
  if (kind === 'html') return <HtmlPreview text={text} />
  return <CodePreview path={path} text={text} />
}

function TablePreview({ path, text }: { path: string; text: string }) {
  const rows = parseDelimited(text, delimiterFor(path))
  if (rows.length === 0) return <div className="preview text-preview"><p className="panel-empty">빈 표입니다.</p></div>

  const [header, ...body] = rows
  const shown = body.slice(0, MAX_ROWS)

  return (
    <div className="preview text-preview">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="row-number" />
              {header.map((cell, at) => (
                <th key={at}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={index}>
                <td className="row-number">{index + 1}</td>
                {header.map((_, at) => (
                  <td key={at}>{row[at] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        {body.length}행 · {header.length}열
        {body.length > MAX_ROWS && ` (앞 ${MAX_ROWS}행만 표시)`}
      </p>
    </div>
  )
}

function CodePreview({ path, text }: { path: string; text: string }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    void highlightCode(text, highlightLanguage(path)).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [path, text])

  return (
    <div className="preview text-preview">
      <pre className="code-preview">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}

/**
 * HTML 은 그려 봐야 뜻이 있는 형식이라 실제로 렌더합니다.
 *
 * 다만 문서 내용이 곧 코드가 되므로 두 겹으로 막습니다.
 * 먼저 스크립트와 이벤트 속성을 걷어내고, 그 결과를 sandbox 를 건 iframe 안에서 그립니다.
 * sandbox 에 아무 권한도 주지 않아 스크립트 실행과 폼 전송, 상위 창 접근이 모두 막힙니다.
 */
function HtmlPreview({ text }: { text: string }) {
  const safe = DOMPurify.sanitize(text, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'] })

  return (
    <div className="preview text-preview">
      <iframe className="html-frame" title="HTML 미리보기" sandbox="" srcDoc={safe} />
    </div>
  )
}
