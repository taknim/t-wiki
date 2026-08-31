import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DialogProvider } from './components/Dialogs'
import { ThemeProvider } from './components/ThemeProvider'
import { TooltipLayer } from './components/Tooltip'
import { applyTheme, loadSettings, resolveDark } from './lib/theme'
import './index.css'

// React 가 붙기 전에 색을 맞춰 첫 화면이 기본 테마로 번쩍이지 않게 합니다.
const saved = loadSettings()
applyTheme(saved, resolveDark(saved.mode, window.matchMedia('(prefers-color-scheme: dark)').matches))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <DialogProvider>
        <App />
        <TooltipLayer />
      </DialogProvider>
    </ThemeProvider>
  </StrictMode>,
)
