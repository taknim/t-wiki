export type ThemeId =
  | 'default' | 'github' | 'ink' | 'contrast' | 'sepia' | 'gruvbox' | 'citrus' | 'espresso'
  | 'rose' | 'forest' | 'ocean' | 'grape' | 'nord' | 'solarized' | 'dracula'
export type ModeSetting = 'system' | 'light' | 'dark'
export type FontId = 'sans' | 'serif' | 'mono'
export type SizeId = 'smallest' | 'small' | 'medium' | 'large' | 'largest'
export type LeadingId = 'tightest' | 'tight' | 'normal' | 'loose' | 'loosest'
export type WidthId = 'narrow' | 'medium' | 'wide'
export type ImageAlignId = 'start' | 'center' | 'end'
export type ImageWidthId = 'full' | 'large' | 'medium' | 'small'

export interface ThemeSettings {
  theme: ThemeId
  mode: ModeSetting
  font: FontId
  size: SizeId
  leading: LeadingId
  width: WidthId
  imageAlign: ImageAlignId
  imageWidth: ImageWidthId
  /** 편집기 왼쪽에 줄 번호를 세울지. */
  lineNumbers: boolean
  /** 아래 표시줄에 커서가 있는 행·열을 적을지. */
  caretPosition: boolean
}

export const DEFAULT_SETTINGS: ThemeSettings = {
  theme: 'default',
  mode: 'system',
  font: 'sans',
  size: 'medium',
  leading: 'normal',
  width: 'medium',
  imageAlign: 'start',
  imageWidth: 'full',
  lineNumbers: false,
  caretPosition: false,
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
    id: 'contrast',
    name: '고대비',
    description: '흑백을 끝까지 밀어붙인 배색, 눈이 편치 않을 때',
    light: {
      bg: '#ffffff', bgSunken: '#eeeeee', bgRaised: '#ffffff',
      border: '#767676', borderStrong: '#000000',
      text: '#000000', textMuted: '#3a3a3a',
      accent: '#0b3fd1', accentSoft: '#dde5ff',
      danger: '#b00000', ok: '#006622', warn: '#6b4200', mark: '#ffff00',
      hlKeyword: '#8000a0', hlString: '#006622', hlNumber: '#8a3800', hlComment: '#4a4a4a',
      hlTitle: '#0b3fd1', hlType: '#6b4200', hlMeta: '#3a3a3a',
    },
    dark: {
      bg: '#000000', bgSunken: '#000000', bgRaised: '#111111',
      border: '#8a8a8a', borderStrong: '#d0d0d0',
      text: '#ffffff', textMuted: '#d0d0d0',
      accent: '#7fc4ff', accentSoft: '#00284a',
      danger: '#ff8a80', ok: '#7be08f', warn: '#ffd75f', mark: '#5a5a00',
      hlKeyword: '#ff9ee0', hlString: '#7be08f', hlNumber: '#ffb570', hlComment: '#c0c0c0',
      hlTitle: '#7fc4ff', hlType: '#ffd75f', hlMeta: '#d0d0d0',
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
    id: 'citrus',
    name: '감귤',
    description: '크림빛 종이에 잘 익은 주황, 환한 화면',
    light: {
      bg: '#fff9f0', bgSunken: '#fdeeda', bgRaised: '#fffdfa',
      border: '#f0dcc0', borderStrong: '#d6b98f',
      text: '#33240f', textMuted: '#7a6444',
      accent: '#c25708', accentSoft: '#ffe6cc',
      danger: '#b3261e', ok: '#4a7a20', warn: '#a06a00', mark: '#ffd98a',
      hlKeyword: '#b3261e', hlString: '#4a7a20', hlNumber: '#8a4bb5', hlComment: '#9b8563',
      hlTitle: '#0f6f7a', hlType: '#a06a00', hlMeta: '#7a6444',
    },
    dark: {
      bg: '#1d1710', bgSunken: '#16110b', bgRaised: '#271f16',
      border: '#3b3022', borderStrong: '#524331',
      text: '#f2e6d6', textMuted: '#b39d80',
      accent: '#ff9f45', accentSoft: '#3d2a14',
      danger: '#ff7d6b', ok: '#a8cf72', warn: '#ffcc66', mark: '#5c4412',
      hlKeyword: '#ff8a80', hlString: '#b6d98a', hlNumber: '#d9a3f0', hlComment: '#9c8768',
      hlTitle: '#72c9d4', hlType: '#ffcc66', hlMeta: '#b39d80',
    },
  },
  {
    id: 'espresso',
    name: '에스프레소',
    description: '볶은 원두빛 짙은 갈색, 밤에도 따뜻하게',
    light: {
      bg: '#f6efe9', bgSunken: '#ebe0d6', bgRaised: '#fdf9f5',
      border: '#dccdbf', borderStrong: '#b9a493',
      text: '#2e2119', textMuted: '#6d5849',
      accent: '#8a4b2a', accentSoft: '#f0dfd2',
      danger: '#a3302a', ok: '#4f7040', warn: '#96681a', mark: '#e8d29c',
      hlKeyword: '#8a4b2a', hlString: '#4f7040', hlNumber: '#8a5a9e', hlComment: '#93806f',
      hlTitle: '#2f6470', hlType: '#96681a', hlMeta: '#6d5849',
    },
    dark: {
      bg: '#1a1310', bgSunken: '#130d0b', bgRaised: '#241a15',
      border: '#382a22', borderStrong: '#4e3b30',
      text: '#ece0d6', textMuted: '#ab9384',
      accent: '#d9a173', accentSoft: '#3a271c',
      danger: '#f0836f', ok: '#9dc47f', warn: '#e5bd72', mark: '#544017',
      hlKeyword: '#e9a17f', hlString: '#a9cd8a', hlNumber: '#cba3e0', hlComment: '#8d7867',
      hlTitle: '#86c2c9', hlType: '#e5bd72', hlMeta: '#ab9384',
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
    id: 'ocean',
    name: '바다',
    description: '청록빛 물색, 서늘하고 맑은 화면',
    light: {
      bg: '#f2fafb', bgSunken: '#e2f2f4', bgRaised: '#fbfeff',
      border: '#c9e4e8', borderStrong: '#9dc4ca',
      text: '#12282c', textMuted: '#4f6d72',
      accent: '#0f7d8c', accentSoft: '#d4eef1',
      danger: '#b53a2c', ok: '#2f7d5a', warn: '#996a12', mark: '#a8e6d8',
      hlKeyword: '#0f6f9e', hlString: '#2f7d5a', hlNumber: '#a05a2c', hlComment: '#7d959a',
      hlTitle: '#0f7d8c', hlType: '#996a12', hlMeta: '#5b7c82',
    },
    dark: {
      bg: '#0e1a1d', bgSunken: '#091316', bgRaised: '#152528',
      border: '#22383c', borderStrong: '#345054',
      text: '#dceef1', textMuted: '#8fadb3',
      accent: '#5fd0da', accentSoft: '#123b41',
      danger: '#ff8272', ok: '#74d2a4', warn: '#e3c06a', mark: '#1d5450',
      hlKeyword: '#79c0e8', hlString: '#8fd6a8', hlNumber: '#e5a97a', hlComment: '#7e979c',
      hlTitle: '#5fd0da', hlType: '#e3c06a', hlMeta: '#9ab8bd',
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
    /*
     * 한글 명조를 라틴 세리프보다 뒤, 그러나 고딕보다는 앞에 둡니다.
     *
     * 앞서는 "Apple SD Gothic Neo" 가 끼어 있었습니다. 이름은 세리프 벌에 있어도
     * 실제로는 고딕이라, 한글은 산세리프와 똑같이 그려졌습니다. 글꼴을 바꿔도
     * 한글만 그대로인 것처럼 보인 까닭입니다. 글자마다 앞에서부터 그 글자를 가진
     * 첫 벌을 쓰므로, 한글 자리에는 명조만 놓아야 합니다.
     */
    name: '세리프',
    stack:
      'ui-serif, Georgia, "Apple SD Myungjo", AppleMyungjo, "Noto Serif KR", "Source Han Serif K",'
      + ' "Nanum Myeongjo", NanumMyeongjo, Batang, BatangChe, 바탕, serif',
  },
  {
    id: 'mono',
    name: '고정폭',
    stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
]

export const SIZES: { id: SizeId; name: string; value: string }[] = [
  { id: 'smallest', name: '아주 작게', value: '13px' },
  { id: 'small', name: '작게', value: '14px' },
  { id: 'medium', name: '보통', value: '15px' },
  { id: 'large', name: '크게', value: '17px' },
  { id: 'largest', name: '아주 크게', value: '19px' },
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

/*
 * 본문 한 줄의 최대 폭. 표와 코드도 이 폭에 맞춰 서므로 글줄만 보고 정할 수 없습니다.
 *
 * 기본 글자 크기(15px)에서 코드 글씨는 13.5px 고정폭이라 한 칸이 8.1px 남짓입니다.
 * 여기에 코드 칸의 안쪽 여백을 더하면
 *   좁게 = 80칸 한 줄, 보통 = 120칸 한 줄이 들어옵니다.
 * 코드가 툭하면 옆으로 밀리는 폭은 쓸모가 없어, 흔히 쓰는 줄 길이를 잣대로 삼았습니다.
 * 한글로 치면 좁게가 45자, 보통이 66자쯤입니다.
 * 좁게는 글만 읽는 자리, 보통은 표와 코드가 섞인 문서를 펴 놓는 자리로 봅니다.
 */
export const WIDTHS: { id: WidthId; name: string; value: string }[] = [
  { id: 'narrow', name: '좁게', value: '680px' },
  { id: 'medium', name: '보통', value: '1000px' },
  { id: 'wide', name: '넓게', value: 'none' },
]

/*
 * 그림을 어느 쪽에 세울지. 글줄 안에 섞여 흐르는 그림은 그대로 두고,
 * 한 줄을 통째로 차지하는 그림에만 걸립니다.
 * start·center·end 는 text-align 과 justify-content 에 그대로 쓰이는 말이라,
 * 문서 안 그림과 그림 파일 미리보기가 같은 값 하나로 함께 움직입니다.
 */
export const IMAGE_ALIGNS: { id: ImageAlignId; name: string; value: string }[] = [
  { id: 'start', name: '왼쪽', value: 'start' },
  { id: 'center', name: '가운데', value: 'center' },
  { id: 'end', name: '오른쪽', value: 'end' },
]

/*
 * 그림의 최대 너비.
 *
 * 넘치는 것만 줄이고 작은 그림은 그대로 둡니다(max-width 는 늘리지 않습니다).
 * 본문 너비보다 커지는 일도 없습니다. 두 값 가운데 작은 쪽을 씁니다.
 */
export const IMAGE_WIDTHS: { id: ImageWidthId; name: string; value: string }[] = [
  { id: 'full', name: '제한 없음', value: '100%' },
  { id: 'large', name: '크게', value: '720px' },
  { id: 'medium', name: '보통', value: '520px' },
  { id: 'small', name: '작게', value: '320px' },
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
  const size = SIZES.find((item) => item.id === settings.size) ?? SIZES[2]
  const leading = LEADINGS.find((item) => item.id === settings.leading) ?? LEADINGS[2]
  const width = WIDTHS.find((item) => item.id === settings.width) ?? WIDTHS[1]
  const align = IMAGE_ALIGNS.find((item) => item.id === settings.imageAlign) ?? IMAGE_ALIGNS[0]
  const imageWidth = IMAGE_WIDTHS.find((item) => item.id === settings.imageWidth) ?? IMAGE_WIDTHS[0]

  root.style.setProperty('--doc-font', font.stack)
  root.style.setProperty('--doc-size', size.value)
  root.style.setProperty('--doc-leading', leading.value)
  root.style.setProperty('--doc-width', width.value)
  root.style.setProperty('--img-align', align.value)
  root.style.setProperty('--img-width', imageWidth.value)

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
      imageAlign: IMAGE_ALIGNS.some((a) => a.id === parsed.imageAlign)
        ? parsed.imageAlign!
        : DEFAULT_SETTINGS.imageAlign,
      imageWidth: IMAGE_WIDTHS.some((w) => w.id === parsed.imageWidth)
        ? parsed.imageWidth!
        : DEFAULT_SETTINGS.imageWidth,
      lineNumbers: typeof parsed.lineNumbers === 'boolean' ? parsed.lineNumbers : DEFAULT_SETTINGS.lineNumbers,
      caretPosition: typeof parsed.caretPosition === 'boolean' ? parsed.caretPosition : DEFAULT_SETTINGS.caretPosition,
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
