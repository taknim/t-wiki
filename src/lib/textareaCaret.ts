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

/** 선택 영역의 화면(viewport) 좌표. 선택이 비어 있으면 null. */
export function selectionBox(textarea: HTMLTextAreaElement): SelectionBox | null {
  const { selectionStart, selectionEnd, value } = textarea
  if (selectionStart === selectionEnd) return null

  const source = getComputedStyle(textarea)
  const mirror = document.createElement('div')

  for (const property of COPIED_STYLES) {
    mirror.style[property] = source[property]
  }
  mirror.style.position = 'absolute'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.height = 'auto'

  const marker = document.createElement('span')
  // 선택이 줄바꿈으로 끝나면 span 높이가 0 이 되므로 보이지 않는 글자를 덧붙입니다.
  marker.textContent = value.slice(selectionStart, selectionEnd) + '​'

  mirror.append(
    document.createTextNode(value.slice(0, selectionStart)),
    marker,
    document.createTextNode(value.slice(selectionEnd)),
  )
  document.body.append(mirror)

  const markerRect = marker.getBoundingClientRect()
  const mirrorRect = mirror.getBoundingClientRect()
  mirror.remove()

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
