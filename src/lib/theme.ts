export type ThemeId =
  | 'default' | 'github' | 'ink' | 'sepia' | 'gruvbox'
  | 'rose' | 'forest' | 'grape' | 'nord' | 'solarized' | 'dracula'
export type ModeSetting = 'system' | 'light' | 'dark'
export type FontId = 'sans' | 'serif' | 'mono'
export type SizeId = 'small' | 'medium' | 'large'
export type LeadingId = 'tightest' | 'tight' | 'normal' | 'loose' | 'loosest'
export type WidthId = 'narrow' | 'medium' | 'wide'

export interface ThemeSettings {
  theme: ThemeId
  mode: ModeSetting
  font: FontId
  size: SizeId
  leading: LeadingId
  width: WidthId
}

export const DEFAULT_SETTINGS: ThemeSettings = {
  theme: 'default',
  mode: 'system',
  font: 'sans',
  size: 'medium',
  leading: 'normal',
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
    id: 'ink',
    name: '먹',
    description: '검은 먹과 인장 붉은색, 군더더기 없는 흑백',
    light: {
      bg: '#fdfdfc', bgSunken: '#f2f2f0', bgRaised: '#ffffff',
      border: '#dedcd8', borderStrong: '#a9a6a0',
      text: '#141414', textMuted: '#5c5a55',
      accent: '#c0392b', accentSoft: '#f7e6e3',
      danger: '#8f1d14', ok: '#2f6b3f', warn: '#8a6a12', mark: '#e6e2d4',
      hlKeyword: '#c0392b', hlString: '#4d5c4d', hlNumber: '#7a5c1e', hlComment: '#9a978f',
      hlTitle: '#141414', hlType: '#5c5a55', hlMeta: '#8a867e',
    },
    dark: {
      bg: '#101010', bgSunken: '#080808', bgRaised: '#1a1a1a',
      border: '#2b2b2b', borderStrong: '#454545',
      text: '#f0efec', textMuted: '#a3a09a',
      accent: '#e8776a', accentSoft: '#33201d',
      danger: '#ff5a4d', ok: '#8bbf94', warn: '#d8b874', mark: '#3d3a2c',
      hlKeyword: '#e8776a', hlString: '#a9bda9', hlNumber: '#d0b177', hlComment: '#7e7b75',
      hlTitle: '#f0efec', hlType: '#c2bfb8', hlMeta: '#948f88',
    },
  },
  {
    id: 'gruvbox',
    name: '그루비박스',
    description: '흙빛 종이에 진한 색, 복고풍 배색',
    light: {
      bg: '#fbf1c7', bgSunken: '#f2e5bc', bgRaised: '#fffcf0',
      border: '#e0d0a3', borderStrong: '#c4b28d',
      text: '#3c3836', textMuted: '#7c6f64',
      accent: '#af3a03', accentSoft: '#f6e2c0',
      danger: '#9d0006', ok: '#79740e', warn: '#b57614', mark: '#f2d675',
      hlKeyword: '#9d0006', hlString: '#79740e', hlNumber: '#8f3f71', hlComment: '#928374',
      hlTitle: '#427b58', hlType: '#b57614', hlMeta: '#076678',
    },
    dark: {
      bg: '#282828', bgSunken: '#1d2021', bgRaised: '#32302f',
      border: '#3c3836', borderStrong: '#504945',
      text: '#ebdbb2', textMuted: '#a89984',
      accent: '#fe8019', accentSoft: '#3c2a17',
      danger: '#fb4934', ok: '#b8bb26', warn: '#fabd2f', mark: '#544a17',
      hlKeyword: '#fb4934', hlString: '#b8bb26', hlNumber: '#d3869b', hlComment: '#928374',
      hlTitle: '#8ec07c', hlType: '#fabd2f', hlMeta: '#83a598',
    },
  },
  {
    id: 'rose',
    name: '장미',
    description: '따뜻한 분홍과 자주, 부드러운 인상',
    light: {
      bg: '#fff6f9', bgSunken: '#fbe7ee', bgRaised: '#fffdfe',
      border: '#f2d6e0', borderStrong: '#dcb0c0',
      text: '#2b1f24', textMuted: '#7c6169',
      accent: '#c53070', accentSoft: '#fce4ee',
      danger: '#c0392b', ok: '#3f7d4f', warn: '#b0761e', mark: '#ffd9e6',
      hlKeyword: '#a63a7a', hlString: '#3f7d4f', hlNumber: '#b0561e', hlComment: '#a08b92',
      hlTitle: '#c53070', hlType: '#8a5a2b', hlMeta: '#8f7078',
    },
    dark: {
      bg: '#1c1418', bgSunken: '#160f13', bgRaised: '#241a1f',
      border: '#3a2a31', borderStrong: '#4e3a42',
      text: '#f2e6ea', textMuted: '#b39aa3',
      accent: '#ff8fb3', accentSoft: '#3d2430',
      danger: '#ff7a6b', ok: '#7fce8f', warn: '#e8bc6a', mark: '#5e2740',
      hlKeyword: '#f0a3d0', hlString: '#a5d6a7', hlNumber: '#ffab7a', hlComment: '#9c848c',
      hlTitle: '#ff8fb3', hlType: '#e8bc6a', hlMeta: '#b09aa2',
    },
  },
  {
    id: 'forest',
    name: '숲',
    description: '이끼와 잎사귀, 초록이 도는 화면',
    light: {
      bg: '#f3f8ee', bgSunken: '#e6efdd', bgRaised: '#fbfdf8',
      border: '#d3e0c6', borderStrong: '#adc09b',
      text: '#1f2a1c', textMuted: '#5c6b55',
      accent: '#2f7d43', accentSoft: '#dcefdf',
      danger: '#b3402f', ok: '#2f7d43', warn: '#9a7420', mark: '#dfeda0',
      hlKeyword: '#7a5aa8', hlString: '#2f7d43', hlNumber: '#a0601b', hlComment: '#8a9982',
      hlTitle: '#2f6f8f', hlType: '#9a7420', hlMeta: '#6f7f5f',
    },
    dark: {
      bg: '#141a13', bgSunken: '#0f140e', bgRaised: '#1c241a',
      border: '#2a3527', borderStrong: '#3c4a38',
      text: '#e3ecdd', textMuted: '#9aac93',
      accent: '#7bc47f', accentSoft: '#22331f',
      danger: '#f08272', ok: '#7bc47f', warn: '#dcb45e', mark: '#41521f',
      hlKeyword: '#c4a2e8', hlString: '#a8d67f', hlNumber: '#e0a86a', hlComment: '#849279',
      hlTitle: '#7fc7c0', hlType: '#dcb45e', hlMeta: '#9aac93',
    },
  },
  {
    id: 'grape',
    name: '포도',
    description: '보랏빛이 감도는 차분한 화면',
    light: {
      bg: '#faf6ff', bgSunken: '#f0e7fa', bgRaised: '#fefcff',
      border: '#e2d4f0', borderStrong: '#c0a9dc',
      text: '#241b2e', textMuted: '#6b5c7d',
      accent: '#7c3aed', accentSoft: '#ece3fd',
      danger: '#c53030', ok: '#3f7d4f', warn: '#b07818', mark: '#e9d5ff',
      hlKeyword: '#7c3aed', hlString: '#3f7d4f', hlNumber: '#c2410c', hlComment: '#9b8bad',
      hlTitle: '#b83280', hlType: '#b07818', hlMeta: '#8375a0',
    },
    dark: {
      bg: '#191323', bgSunken: '#130e1b', bgRaised: '#221a2e',
      border: '#332944', borderStrong: '#493a5e',
      text: '#ece6f5', textMuted: '#a798bb',
      accent: '#c4a0ff', accentSoft: '#2f2342',
      danger: '#ff7b72', ok: '#86d68f', warn: '#e5c168', mark: '#4b2c73',
      hlKeyword: '#c4a0ff', hlString: '#a5d6a7', hlNumber: '#ffab70', hlComment: '#8f81a3',
      hlTitle: '#ff9ecd', hlType: '#e5c168', hlMeta: '#a798bb',
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
      danger: '#dc322f', ok: '#6c7a00', warn: '#9c7500', mark: '#f2e3a0',
      hlKeyword: '#708200', hlString: '#2aa198', hlNumber: '#d33682', hlComment: '#8a9898',
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
  {
    id: 'dracula',
    name: '드라큘라',
    description: '어두운 바탕에 형광빛, 가장 또렷한 대비',
    light: {
      bg: '#fffbeb', bgSunken: '#f7f2df', bgRaised: '#fffdf5',
      border: '#e6dfc4', borderStrong: '#cdc5a5',
      text: '#1f1f1f', textMuted: '#6c664b',
      accent: '#644ac9', accentSoft: '#e7e2fb',
      danger: '#cb3a2a', ok: '#14710a', warn: '#a34d14', mark: '#f6e58d',
      hlKeyword: '#a3144d', hlString: '#846e15', hlNumber: '#644ac9', hlComment: '#6c664b',
      hlTitle: '#14710a', hlType: '#036a96', hlMeta: '#a34d14',
    },
    dark: {
      bg: '#282a36', bgSunken: '#21222c', bgRaised: '#343746',
      border: '#44475a', borderStrong: '#6272a4',
      text: '#f8f8f2', textMuted: '#9aa5d4',
      accent: '#bd93f9', accentSoft: '#3c3357',
      danger: '#ff5555', ok: '#50fa7b', warn: '#f1fa8c', mark: '#5c5a2a',
      hlKeyword: '#ff79c6', hlString: '#f1fa8c', hlNumber: '#bd93f9', hlComment: '#6272a4',
      hlTitle: '#50fa7b', hlType: '#8be9fd', hlMeta: '#ffb86c',
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

/*
 * 줄 간격.
 *
 * 글자 크기와 따로 둡니다. 큰 글자로 빽빽하게 보는 사람도, 작은 글자로 널찍하게
 * 보는 사람도 있습니다. 값은 배수라 글자 크기를 바꿔도 비율이 유지됩니다.
 */
export const LEADINGS: { id: LeadingId; name: string; value: string }[] = [
  { id: 'tightest', name: '아주 좁게', value: '1.3' },
  { id: 'tight', name: '좁게', value: '1.5' },
  { id: 'normal', name: '보통', value: '1.7' },
  { id: 'loose', name: '넓게', value: '1.9' },
  { id: 'loosest', name: '아주 넓게', value: '2.2' },
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
  const leading = LEADINGS.find((item) => item.id === settings.leading) ?? LEADINGS[2]
  const width = WIDTHS.find((item) => item.id === settings.width) ?? WIDTHS[1]

  root.style.setProperty('--doc-font', font.stack)
  root.style.setProperty('--doc-size', size.value)
  root.style.setProperty('--doc-leading', leading.value)
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
      leading: LEADINGS.some((l) => l.id === parsed.leading) ? parsed.leading! : DEFAULT_SETTINGS.leading,
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
