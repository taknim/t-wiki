import { useEffect, useState } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

/** 다이어그램 테마를 시스템 설정에 맞추기 위해 씁니다. CSS 로는 SVG 색을 못 바꿉니다. */
export function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return dark
}
