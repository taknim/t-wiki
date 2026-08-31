import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { usePrefersDark } from '../hooks/usePrefersDark'
import {
  applyTheme,
  loadSettings,
  paletteFor,
  resolveDark,
  saveSettings,
  type ThemeSettings,
} from '../lib/theme'
import { ThemeContext } from './themeContext'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(loadSettings)
  const systemDark = usePrefersDark()
  const isDark = resolveDark(settings.mode, systemDark)

  // 시스템 설정이 바뀌면 '시스템 따름' 일 때만 결과가 달라집니다.
  // 렌더 중에 적용해야 자식이 그려지기 전에 색이 맞습니다.
  const [applied, setApplied] = useState('')
  const signature = `${settings.theme}|${isDark}|${settings.font}|${settings.size}|${settings.width}`
  if (applied !== signature) {
    setApplied(signature)
    applyTheme(settings, isDark)
  }

  const update = useCallback((patch: Partial<ThemeSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ settings, isDark, palette: paletteFor(settings, isDark), update }),
    [settings, isDark, update],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
