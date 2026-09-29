import { useEffect, useState } from 'react'
import { highlightCode } from '../lib/markdown'
import {
  delimiterFor, highlightLanguage, parseDelimited, previewTidyFor, type TextPreviewKind,
} from '../lib/textPreview'

interface TextPreviewProps {
  kind: Exclude<TextPreviewKind, null>
  path: string
  text: string
}

/** 표가 아주 크면 화면이 멎으므로 앞부분만 그립니다. */
const MAX_ROWS = 500

export function TextPreview({ kind, path, text }: TextPreviewProps) {
  if (kind === 'table') return <TablePreview path={path} text={text} />
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

  /*
   * 원문이 어긋나 있어도 보기에는 정돈해서 보여 줍니다. 파일은 건드리지 않습니다.
   * 정돈할 수 없는 글(짝이 안 맞는 등)이면 원문을 그대로 보여 줍니다.
   *
   * YAML 은 깊이를 다시 잡지 않습니다. 들여쓰기가 곧 뜻이라, 다시 잡는다는 것은
   * 문서를 다르게 읽겠다는 말이 됩니다. 다만 규격이 금하는 탭은 공백으로 바꿉니다.
   */
  const tidy = previewTidyFor(path)
  const shown = tidy ? tidy(text) ?? text : text

  useEffect(() => {
    let cancelled = false
    void highlightCode(shown, highlightLanguage(path)).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [path, shown])

  return (
    /*
     * 코드는 본문 글줄 폭에 묶지 않고 **칸 전체**를 씁니다. 묶어 두었더니 마크다운 문서의
     * 한 문단처럼 보여, 파일을 보고 있다는 느낌이 들지 않았습니다.
     */
    <div className="preview text-preview is-code">
      <pre className="code-preview">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}


