/**
 * textarea 는 선택 영역의 화면 좌표를 알려주지 않습니다.
 * 그래서 같은 글꼴·너비·여백을 가진 보이지 않는 사본을 만들어
 * 선택 부분을 span 으로 감싸고 그 span 의 위치를 재는 방법을 씁니다.
 */
const COPIED_STYLES = [
  'boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'letterSpacing', 'lineHeight', 'textTransform', 'textIndent', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
] as const

export interface SelectionBox {
  top: number
  bottom: number
  left: number
  right: number
  /** 도구 막대를 가둘 편집기 영역. 이게 없으면 막대가 사이드바를 덮습니다. */
  containerLeft: number
  containerRight: number
}

/**
 * 글상자의 보이지 않는 사본. from~to 를 span 으로 감싸 그 자리를 잽니다.
 * 폭은 계산된 width 가 아니라 clientWidth 로 둡니다. width 에는 굴림대 자리까지 들어 있어
 * 긴 줄이 접히는 자리가 글상자와 달라졌습니다.
 */
function measure(textarea: HTMLTextAreaElement, from: number, to: number) {
  const { value } = textarea
  const source = getComputedStyle(textarea)
  const mirror = document.createElement('div')

  for (const property of COPIED_STYLES) {
    mirror.style[property] = source[property]
  }
  mirror.style.boxSizing = 'border-box'
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.position = 'absolute'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.height = 'auto'

  const marker = document.createElement('span')
  // 선택이 줄바꿈으로 끝나면 span 높이가 0 이 되므로 보이지 않는 글자를 덧붙입니다.
  marker.textContent = value.slice(from, to) + '​'

  mirror.append(
    document.createTextNode(value.slice(0, from)),
    marker,
    document.createTextNode(value.slice(to)),
  )
  document.body.append(mirror)

  const markerRect = marker.getBoundingClientRect()
  const mirrorRect = mirror.getBoundingClientRect()
  mirror.remove()
  return { markerRect, mirrorRect }
}

/**
 * 그 글자 자리가 글상자 내용의 위에서 몇 픽셀 아래인지(굴림과 무관).
 * 글상자의 scrollHeight 로 재는 길은 안 됩니다. 내용이 칸보다 짧으면 칸 높이로 눌려
 * 앞쪽 줄이 모두 같은 값을 냅니다.
 */
export function offsetTopOf(textarea: HTMLTextAreaElement, offset: number): number {
  const { markerRect, mirrorRect } = measure(textarea, offset, offset)
  return markerRect.top - mirrorRect.top
}

/** 선택 영역의 화면(viewport) 좌표. 선택이 비어 있으면 null. */
export function selectionBox(textarea: HTMLTextAreaElement): SelectionBox | null {
  const { selectionStart, selectionEnd } = textarea
  if (selectionStart === selectionEnd) return null

  const { markerRect, mirrorRect } = measure(textarea, selectionStart, selectionEnd)

  const bounds = textarea.getBoundingClientRect()
  const offsetTop = markerRect.top - mirrorRect.top - textarea.scrollTop
  const offsetLeft = markerRect.left - mirrorRect.left - textarea.scrollLeft

  return {
    top: bounds.top + offsetTop,
    bottom: bounds.top + offsetTop + markerRect.height,
    left: bounds.left + offsetLeft,
    right: bounds.left + offsetLeft + markerRect.width,
    containerLeft: bounds.left,
    containerRight: bounds.right,
  }
}
