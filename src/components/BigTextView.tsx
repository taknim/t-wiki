import { useState } from 'react'
import { BIG_TEXT_LINES } from '../lib/bigText'
import { formatBytes } from '../lib/attachments'
import { MAX_ATTACHMENT_BYTES } from '../lib/attachments'

/**
 * 아주 큰 글을 보는 자리.
 *
 * 글상자가 아니라 `<pre>` 입니다. 40MB 를 글상자에 담으면 굴릴 때마다 0.23초를 쓰는데,
 * 같은 글을 `<pre>` 에 담으면 0.04초입니다. 고칠 수 없게 되는 대신 읽을 수는 있습니다.
 * 잘라서 보여 주지 않는 것은, 보려고 연 사람에게 "뒤는 없습니다" 라고 할 수 없기 때문입니다.
 */
export function BigTextView({ text, bytes }: { text: string; bytes: number }) {
  const [told, setTold] = useState(false)

  return (
    <div className="bigtext">
      <pre className="bigtext-body">{text}</pre>
      {/*
        떠 있는 딱지. 반쯤 비쳐 글을 가리지 않되, 손을 얹거나 누르면 또렷해지며
        무엇을 쓸 수 없는지 알려 줍니다. 모르고 "왜 안 고쳐지지" 하는 일이 없도록
        까닭까지 함께 적습니다.
      */}
      <div className={told ? 'bigtext-mark is-open' : 'bigtext-mark'}>
        <button
          type="button"
          className="bigtext-badge"
          aria-expanded={told}
          data-tip="큰 글이라 보기만 합니다. 눌러서 무엇이 꺼졌는지 봅니다"
          onClick={() => setTold((now) => !now)}
        >
          대용량 파일 모드
        </button>
        {told && (
          <div className="bigtext-told">
            <p className="bigtext-told-head">
              {formatBytes(bytes)} · {formatBytes(MAX_ATTACHMENT_BYTES)} 또는 {BIG_TEXT_LINES.toLocaleString()}줄을
              넘는 글입니다.
            </p>
            <ul>
              <li><strong>고칠 수 없습니다.</strong> 보기만 합니다 — 고치려면 다른 편집기로 여세요.</li>
              <li><strong>미리보기를 그리지 않습니다</strong>(표·구문 강조).</li>
              <li><strong>줄 번호를 세우지 않습니다.</strong></li>
              <li><strong>커서 위치를 적지 않습니다.</strong></li>
            </ul>
            <p className="bigtext-told-why">
              글이 크면 글상자에서 커서를 한 칸 옮기는 데만도 0.2초가 넘게 듭니다.
              브라우저가 글 전체를 다시 재기 때문이라 앱에서 줄일 수 있는 값이 아닙니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
