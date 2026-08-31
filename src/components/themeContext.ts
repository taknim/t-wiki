import { createContext, useContext } from 'react'
import type { Palette, ThemeSettings } from '../lib/theme'

export interface ThemeContextValue {
  settings: ThemeSettings
  /** 시스템 설정까지 반영한 최종 결과. 다이어그램처럼 CSS 로 못 바꾸는 곳에서 씁니다. */
  isDark: boolean
  palette: Palette
  update: (patch: Partial<ThemeSettings>) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('ThemeProvider 안에서만 쓸 수 있습니다.')
  return value
}
