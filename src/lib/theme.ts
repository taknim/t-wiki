export type ThemeId = 'default' | 'github' | 'sepia' | 'nord' | 'solarized'
export type ModeSetting = 'system' | 'light' | 'dark'
export type FontId = 'sans' | 'serif' | 'mono'
export type SizeId = 'small' | 'medium' | 'large'
export type WidthId = 'narrow' | 'medium' | 'wide'

export interface ThemeSettings {
  theme: ThemeId
  mode: ModeSetting
  font: FontId
  size: SizeId
  width: WidthId
}

export const DEFAULT_SETTINGS: ThemeSettings = {
  theme: 'default',
  mode: 'system',
  font: 'sans',
  size: 'medium',
  width: 'medium',
}

/** CSS 변수로 내보낼 색 한 벌. */
export interface Palette {
  bg: string
  bgSunken: string
  bgRaised: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  accent: string
  accentSoft: string
  danger: string
  ok: string
  warn: string
  mark: string
  hlKeyword: string
  hlString: string
  hlNumber: string
  hlComment: string
  hlTitle: string
  hlType: string
  hlMeta: string
}

export interface Theme {
  id: ThemeId
  name: string
  description: string
  light: Palette
  dark: Palette
}

export const THEMES: Theme[] = [
  {
    id: 'default',
    name: '기본',
    description: '중립적인 회색과 파랑',
    light: {
      bg: '#ffffff', bgSunken: '#f6f7f9', bgRaised: '#ffffff',
      border: '#e2e5ea', borderStrong: '#cbd1d9',
      text: '#1a1d21', textMuted: '#6b7280',
      accent: '#2f6feb', accentSoft: '#e8f0fe',
      danger: '#d93025', ok: '#1a7f37', warn: '#b8730c', mark: '#fff3a3',
      hlKeyword: '#a626a4', hlString: '#50a14f', hlNumber: '#b76b01', hlComment: '#9aa1ac',
      hlTitle: '#4078f2', hlType: '#c18401', hlMeta: '#7a81a8',
    },
    dark: {
      bg: '#16181d', bgSunken: '#101216', bgRaised: '#1d2026',
      border: '#2b2f37', borderStrong: '#3a3f49',
      text: '#e6e8eb', textMuted: '#9aa1ac',
      accent: '#6a9cff', accentSoft: '#1e2a44',
      danger: '#ff6b60', ok: '#56d364', warn: '#e3b341', mark: '#6b5b1a',
      hlKeyword: '#c678dd', hlString: '#98c379', hlNumber: '#d19a66', hlComment: '#6b7280',
      hlTitle: '#61afef', hlType: '#e5c07b', hlMeta: '#8a91a0',
    },
  },
  {
    id: 'github',
    name: '깃허브',
    description: 'GitHub 문서와 같은 색',
    light: {
      bg: '#ffffff', bgSunken: '#f6f8fa', bgRaised: '#ffffff',
      border: '#d1d9e0', borderStrong: '#afb8c1',
      text: '#1f2328', textMuted: '#59636e',
      accent: '#0969da', accentSoft: '#ddf4ff',
      danger: '#cf222e', ok: '#1a7f37', warn: '#9a6700', mark: '#fff8c5',
      hlKeyword: '#cf222e', hlString: '#0a3069', hlNumber: '#0550ae', hlComment: '#59636e',
      hlTitle: '#8250df', hlType: '#953800', hlMeta: '#6e7781',
    },
    dark: {
      bg: '#0d1117', bgSunken: '#010409', bgRaised: '#151b23',
      border: '#3d444d', borderStrong: '#656c76',
      text: '#f0f6fc', textMuted: '#9198a1',
      accent: '#4493f8', accentSoft: '#121d2f',
      danger: '#f85149', ok: '#3fb950', warn: '#d29922', mark: '#4a3d00',
      hlKeyword: '#ff7b72', hlString: '#a5d6ff', hlNumber: '#79c0ff', hlComment: '#9198a1',
      hlTitle: '#d2a8ff', hlType: '#ffa657', hlMeta: '#8b949e',
    },
  },
  {
    id: 'sepia',
    name: '세피아',
    description: '오래 읽기 좋은 따뜻한 종이색',
    light: {
      bg: '#faf4e8', bgSunken: '#f2e9d8', bgRaised: '#fffaf0',
      border: '#e0d5bf', borderStrong: '#c9bb9f',
      text: '#3b3228', textMuted: '#7d7160',
      accent: '#9a5b2e', accentSoft: '#f0e2cf',
      danger: '#a33a2a', ok: '#5b7a3a', warn: '#a1741f', mark: '#f5e08a',
      hlKeyword: '#8a4f9e', hlString: '#5b7a3a', hlNumber: '#a1741f', hlComment: '#9a9079',
      hlTitle: '#2f6f8f', hlType: '#9a5b2e', hlMeta: '#8a7f6b',
    },
    dark: {
      bg: '#201c17', bgSunken: '#191510', bgRaised: '#29241d',
      border: '#3b342a', borderStrong: '#524839',
      text: '#e8dfd0', textMuted: '#a2957f',
      accent: '#d99a5e', accentSoft: '#33291d',
      danger: '#e07a63', ok: '#9dc26b', warn: '#e3bb63', mark: '#5a4a1e',
      hlKeyword: '#d3a0e0', hlString: '#b6cf8a', hlNumber: '#e0b06a', hlComment: '#8a7f6b',
      hlTitle: '#8fc3dd', hlType: '#dda879', hlMeta: '#9a8f7c',
    },
  },
  {
    id: 'nord',
    name: '노르드',
    description: '차분한 한랭 계열',
    light: {
      bg: '#eceff4', bgSunken: '#e5e9f0', bgRaised: '#ffffff',
      border: '#d8dee9', borderStrong: '#b8c0cd',
      text: '#2e3440', textMuted: '#4c566a',
      accent: '#5e81ac', accentSoft: '#dbe4ee',
      danger: '#bf616a', ok: '#6b8c4f', warn: '#b5714f', mark: '#ebcb8b',
      hlKeyword: '#5e81ac', hlString: '#6b8c4f', hlNumber: '#9c6a94', hlComment: '#7b88a1',
      hlTitle: '#3f7f7d', hlType: '#b5714f', hlMeta: '#6a7f9c',
    },
    dark: {
      bg: '#2e3440', bgSunken: '#272c36', bgRaised: '#3b4252',
      border: '#434c5e', borderStrong: '#4c566a',
      text: '#eceff4', textMuted: '#a0aabb',
      accent: '#88c0d0', accentSoft: '#3b4a58',
      danger: '#bf616a', ok: '#a3be8c', warn: '#ebcb8b', mark: '#4d4327',
      hlKeyword: '#81a1c1', hlString: '#a3be8c', hlNumber: '#b48ead', hlComment: '#7b88a1',
      hlTitle: '#88c0d0', hlType: '#ebcb8b', hlMeta: '#8fbcbb',
    },
  },
  {
    id: 'solarized',
    name: '솔라라이즈드',
    description: '눈부심을 줄인 고전 배색',
    light: {
      bg: '#fdf6e3', bgSunken: '#f2ead3', bgRaised: '#fffcf3',
      border: '#e6dcc4', borderStrong: '#cfc5ae',
      text: '#073642', textMuted: '#657b83',
      accent: '#268bd2', accentSoft: '#dceaf5',
      danger: '#dc322f', ok: '#6c7a00', warn: '#b58900', mark: '#f2e3a0',
      hlKeyword: '#708200', hlString: '#2aa198', hlNumber: '#d33682', hlComment: '#93a1a1',
      hlTitle: '#268bd2', hlType: '#b58900', hlMeta: '#657b83',
    },
    dark: {
      bg: '#002b36', bgSunken: '#00212b', bgRaised: '#073642',
      border: '#0d4a58', borderStrong: '#2b6b78',
      text: '#eee8d5', textMuted: '#93a1a1',
      accent: '#268bd2', accentSoft: '#073d4d',
      danger: '#dc322f', ok: '#859900', warn: '#b58900', mark: '#4a4420',
      hlKeyword: '#859900', hlString: '#2aa198', hlNumber: '#d33682', hlComment: '#586e75',
      hlTitle: '#268bd2', hlType: '#b58900', hlMeta: '#839496',
    },
  },
]

export const FONTS: { id: FontId; name: string; stack: string }[] = [
  {
    id: 'sans',
    name: '산세리프',
    stack:
      '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Pretendard, "Malgun Gothic", system-ui, sans-serif',
  },
  {
    id: 'serif',
    name: '세리프',
    stack:
      'ui-serif, Georgia, "Apple SD Gothic Neo", "Noto Serif KR", "Nanum Myeongjo", batang, serif',
  },
  {
    id: 'mono',
    name: '고정폭',
    stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
]

export const SIZES: { id: SizeId; name: string; value: string }[] = [
  { id: 'small', name: '작게', value: '14px' },
  { id: 'medium', name: '보통', value: '15px' },
  { id: 'large', name: '크게', value: '17px' },
]

export const WIDTHS: { id: WidthId; name: string; value: string }[] = [
  { id: 'narrow', name: '좁게', value: '620px' },
  { id: 'medium', name: '보통', value: '780px' },
  { id: 'wide', name: '넓게', value: 'none' },
]

export function themeById(id: ThemeId): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function paletteFor(settings: ThemeSettings, isDark: boolean): Palette {
  const theme = themeById(settings.theme)
  return isDark ? theme.dark : theme.light
}

export function resolveDark(mode: ModeSetting, systemDark: boolean): boolean {
  if (mode === 'system') return systemDark
  return mode === 'dark'
}

const VARIABLES: [keyof Palette, string][] = [
  ['bg', '--bg'],
  ['bgSunken', '--bg-sunken'],
  ['bgRaised', '--bg-raised'],
  ['border', '--border'],
  ['borderStrong', '--border-strong'],
  ['text', '--text'],
  ['textMuted', '--text-muted'],
  ['accent', '--accent'],
  ['accentSoft', '--accent-soft'],
  ['danger', '--danger'],
  ['ok', '--ok'],
  ['warn', '--warn'],
  ['mark', '--mark'],
  ['hlKeyword', '--hl-keyword'],
  ['hlString', '--hl-string'],
  ['hlNumber', '--hl-number'],
  ['hlComment', '--hl-comment'],
  ['hlTitle', '--hl-title'],
  ['hlType', '--hl-type'],
  ['hlMeta', '--hl-meta'],
]

/**
 * 값을 <html> 에 인라인으로 얹습니다.
 * 스타일시트의 :root 나 prefers-color-scheme 규칙보다 우선하므로
 * 시스템 설정과 무관하게 고른 테마가 그대로 적용됩니다.
 */
export function applyTheme(settings: ThemeSettings, isDark: boolean): void {
  const root = document.documentElement
  const palette = paletteFor(settings, isDark)

  for (const [key, variable] of VARIABLES) {
    root.style.setProperty(variable, palette[key])
  }

  const font = FONTS.find((item) => item.id === settings.font) ?? FONTS[0]
  const size = SIZES.find((item) => item.id === settings.size) ?? SIZES[1]
  const width = WIDTHS.find((item) => item.id === settings.width) ?? WIDTHS[1]

  root.style.setProperty('--doc-font', font.stack)
  root.style.setProperty('--doc-size', size.value)
  root.style.setProperty('--doc-width', width.value)

  // 스크롤 막대와 기본 폼 요소도 같이 맞춰 줍니다.
  root.style.colorScheme = isDark ? 'dark' : 'light'
  root.dataset.theme = settings.theme
  root.dataset.mode = isDark ? 'dark' : 'light'
}

const STORAGE_KEY = 'mdwiki:theme'

/**
 * 테마만 localStorage 를 씁니다.
 * 다른 설정처럼 IndexedDB 에 두면 읽기가 비동기라 첫 화면이 잠깐 다른 색으로 번쩍입니다.
 */
export function loadSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>
    return {
      theme: THEMES.some((t) => t.id === parsed.theme) ? parsed.theme! : DEFAULT_SETTINGS.theme,
      mode: ['system', 'light', 'dark'].includes(parsed.mode ?? '') ? parsed.mode! : DEFAULT_SETTINGS.mode,
      font: FONTS.some((f) => f.id === parsed.font) ? parsed.font! : DEFAULT_SETTINGS.font,
      size: SIZES.some((s) => s.id === parsed.size) ? parsed.size! : DEFAULT_SETTINGS.size,
      width: WIDTHS.some((w) => w.id === parsed.width) ? parsed.width! : DEFAULT_SETTINGS.width,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: ThemeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 사생활 보호 모드 등으로 저장이 막혀도 이번 세션에는 그대로 적용됩니다.
  }
}
