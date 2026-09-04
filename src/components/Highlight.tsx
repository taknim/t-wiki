import type { SearchHit } from '../types'

/**
 * 찾은 자리에 표시를 붙여 그립니다.
 *
 * 이름이든 본문 발췌든 같은 모양의 조각으로 들어오므로 그리는 곳도 하나뿐입니다.
 */
export function Highlight({ pieces }: { pieces: SearchHit['snippet'] }) {
  return (
    <>
      {pieces.map((piece, at) =>
        piece.hit ? <mark key={at}>{piece.text}</mark> : <span key={at}>{piece.text}</span>,
      )}
    </>
  )
}
