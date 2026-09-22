import { offsetTopOf } from './textareaCaret'

/*
 * 편집기에서 그 줄이 화면 위쪽 어디쯤에 서게 할지.
 * 맨 위에 딱 붙이면 앞뒤 문맥이 보이지 않아 어디로 왔는지 알기 어렵습니다.
 */
const FROM_TOP = 4

/**
 * 글자 자리를 짚어 커서를 그 줄에 세우고, 편집기를 그만큼 굴려 줍니다.
 *
 * 예전에는 그 자리까지의 글만 잠깐 담아 scrollHeight 를 재고 되돌렸습니다. 그런데 내용이
 * 칸보다 짧으면 scrollHeight 가 칸 높이로 눌려, 앞쪽 줄로 가자고 해도 아래로 굴러갔습니다.
 * 지금은 사본에서 그 글자의 세로 자리를 잽니다. 값을 손대지 않으니 더 안전하기도 합니다.
 *
 * 커서를 먼저 옮기고 굴리기는 맨 나중에 합니다. focus 를 부르면 브라우저가 커서를
 * 보여 주려고 제멋대로 굴리므로, 굴리는 일이 맨 뒤에 와야 합니다.
 */
export function jumpInEditor(editor: HTMLTextAreaElement, offset: number) {
  const upTo = offsetTopOf(editor, offset)
  editor.focus()
  editor.setSelectionRange(offset, offset)
  editor.scrollTop = Math.max(0, upTo - editor.clientHeight / FROM_TOP)
}

/**
 * 1부터 세는 행·열을 글자 자리로 바꿉니다. 줄을 넘는 행은 마지막 줄로, 줄 길이를 넘는
 * 열은 줄 끝으로 접습니다 — 사람이 어림잡아 큰 수를 적어도 "없는 자리"라며 거절하지 않고
 * 가장 가까운 곳에 세웁니다.
 */
export function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split('\n')
  const row = Math.min(Math.max(1, line), lines.length) - 1
  const col = Math.min(Math.max(1, column), lines[row].length + 1) - 1
  let offset = 0
  for (let at = 0; at < row; at++) offset += lines[at].length + 1
  return offset + col
}


/** 커서 위치. 줄은 줄바꿈으로, 열은 그 줄 안의 글자 수로 셉니다(둘 다 1부터). */
export function caretAt(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset)
  const lastBreak = before.lastIndexOf('\n')
  return { line: (before.match(/\n/g)?.length ?? 0) + 1, column: offset - lastBreak }
}
