import { MAX_ATTACHMENT_BYTES } from './attachments'

/*
 * 아주 큰 글을 어떻게 가릴지.
 *
 * 40MB 짜리 기록을 열었더니 열리기는 해도 그 뒤가 쓸 수 없었습니다. 화살표 한 번에
 * 0.25초, 굴릴 때마다 0.26초. 앱이 느린 것이 아니라 **글상자에 40MB 를 담은 것** 자체가
 * 그렇습니다(빈 쪽에 글상자 하나만 놓고 같은 글을 넣어도 같습니다). 그래서 큰 글은
 * 고치는 자리가 아니라 **보는 자리**로 엽니다.
 */

/** 대용량으로 보는 크기. 파일 올리기 상한과 같은 자를 씁니다 — 외울 숫자를 둘로 늘리지 않습니다. */
export const BIG_TEXT_BYTES = MAX_ATTACHMENT_BYTES

/**
 * 대용량으로 보는 줄 수.
 *
 * 크기만으로는 모자랍니다. 줄마다 요소가 서는 자리(줄 번호와 그 거울)가 있어, 짧은 줄이
 * 아주 많은 글은 크기가 작아도 요소 수로 먼저 무너집니다.
 */
export const BIG_TEXT_LINES = 4000

/**
 * 줄 수를 세되 자를 넘으면 **거기서 멈춥니다.**
 * 대용량인지만 가리면 되므로 40MB 를 끝까지 셀 까닭이 없습니다.
 */
export function countLines(text: string, limit: number): number {
  let lines = 1
  let at = text.indexOf('\n')
  while (at !== -1 && lines <= limit) {
    lines += 1
    at = text.indexOf('\n', at + 1)
  }
  return lines
}

/**
 * 이 글이 대용량인지. **크기나 줄 수 가운데 하나만 넘어도** 그렇습니다.
 * 크기는 파일에서 읽어 둔 바이트 수를 씁니다 — 글자 수로 세면 한글이 세 배로 들어
 * 같은 바이트에서도 자가 달라집니다.
 */
export function isBigText(bytes: number, text: string): boolean {
  return bytes > BIG_TEXT_BYTES || countLines(text, BIG_TEXT_LINES) > BIG_TEXT_LINES
}
