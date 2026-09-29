/*
 * 헤더 버튼에 쓰는 아이콘입니다.
 *
 * 그림 파일 대신 인라인 SVG 로 둡니다. 색을 currentColor 로 물려받아
 * 테마가 바뀌어도 따로 손볼 곳이 없고, 정적 호스팅에서 파일을 더 받지 않습니다.
 * 글자 옆에 서므로 크기는 글자에 맞춰 1em 으로 둡니다.
 */
interface IconProps {
  /** 버튼 안에서는 글자가 뜻을 전하므로 아이콘은 읽어 줄 필요가 없습니다. */
  className?: string
}

function Svg({
  children, className, strokeWidth = 1.6,
}: IconProps & { children: React.ReactNode; strokeWidth?: number }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.2 2.3a1.5 1.5 0 0 1 2.1 2.1L5.6 12.1l-2.8.7.7-2.8z" />
      <path d="M10.2 3.3l2.1 2.1" />
    </Svg>
  )
}

export function ColumnsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M8 3v10" />
    </Svg>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.6 8S4 3.8 8 3.8 14.4 8 14.4 8 12 12.2 8 12.2 1.6 8 1.6 8z" />
      <circle cx="8" cy="8" r="1.9" />
    </Svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.3 7a5.4 5.4 0 0 0-9.4-2.4L2.4 6" />
      <path d="M2.7 9a5.4 5.4 0 0 0 9.4 2.4L13.6 10" />
      <path d="M2.4 3v3h3M13.6 13v-3h-3" />
    </Svg>
  )
}

/** 깃허브 마크. 선이 아니라 면으로 그린 상표라 stroke 를 끕니다. */
export function GitHubIcon(props: IconProps) {
  return (
    <svg
      className={props.className ? `icon ${props.className}` : 'icon'}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 .5a7.5 7.5 0 0 0-2.37 14.62c.37.07.5-.16.5-.36l-.01-1.26c-2.09.45-2.53-1-2.53-1-.34-.87-.83-1.1-.83-1.1-.68-.47.05-.46.05-.46.76.06 1.16.78 1.16.78.67 1.15 1.76.82 2.19.63.07-.49.26-.82.48-1.01-1.67-.19-3.43-.84-3.43-3.72 0-.82.3-1.5.78-2.02-.08-.19-.34-.96.07-2.01 0 0 .63-.2 2.07.77a7.2 7.2 0 0 1 3.77 0c1.44-.97 2.07-.77 2.07-.77.41 1.05.15 1.82.08 2.01.49.52.78 1.2.78 2.02 0 2.89-1.76 3.53-3.44 3.71.27.23.51.69.51 1.39l-.01 2.06c0 .2.13.44.51.36A7.5 7.5 0 0 0 8 .5z" />
    </svg>
  )
}

/** 동기화가 도는 동안 씁니다. 도는 것이 보이도록 CSS 로 돌립니다. */
export function SyncIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8" />
      <path d="M13.6 3v3.2h-3.2" />
    </Svg>
  )
}

/**
 * 설정. 테두리 원 없이 톱니 윤곽만 그립니다.
 *
 * 좌표는 원을 여덟로 나눠 계산해 둡니다. 손으로 찍으면 이빨이 고르지 않고,
 * 촘촘하면 이 크기에서 서로 붙어 그냥 동그라미로 보입니다.
 */
export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.3}>
      <path d="M6.49 1.27 L9.51 1.27 L9.92 3.71 L9.68 3.61 L11.7 2.17 L13.83 4.3 L12.39 6.32 L12.29 6.08 L14.73 6.49 L14.73 9.51 L12.29 9.92 L12.39 9.68 L13.83 11.7 L11.7 13.83 L9.68 12.39 L9.92 12.29 L9.51 14.73 L6.49 14.73 L6.08 12.29 L6.32 12.39 L4.3 13.83 L2.17 11.7 L3.61 9.68 L3.71 9.92 L1.27 9.51 L1.27 6.49 L3.71 6.08 L3.61 6.32 L2.17 4.3 L4.3 2.17 L6.32 3.61 L6.08 3.71 Z" />
      <circle cx="8" cy="8" r="2.2" />
    </Svg>
  )
}

/*
 * 폴더 닫기. 빠져나가는 화살표는 뜻이 흐려서, 새 폴더 아이콘과 같은 폴더 위에
 * X 를 얹었습니다. 나란히 놓였을 때 더하기와 가위표로 뜻이 바로 갈립니다.
 */
export function FolderCloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.6 12V4a1 1 0 0 1 1-1h3.1l1.3 1.6h6.4a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1z" />
      <path d="M6.4 7.5l3.2 3.2M9.6 7.5l-3.2 3.2" />
    </Svg>
  )
}

export function FolderPlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.6 12V4a1 1 0 0 1 1-1h3.1l1.3 1.6h6.4a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1z" />
      <path d="M8 7.4v3.4M6.3 9.1h3.4" />
    </Svg>
  )
}

export function DocPlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 1.9h4.5L12 5.4V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.9a1 1 0 0 1 1-1z" />
      <path d="M8.4 2v3.4h3.4" />
      <path d="M7.5 8.4v3.3M5.9 10.05h3.2" />
    </Svg>
  )
}

/** 첨부 파일. 클립은 이 크기에서도 뜻이 또렷합니다. */
export function ClipIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.6 7.4l-4.3 4.3a2.4 2.4 0 0 1-3.4-3.4l5.2-5.2a1.7 1.7 0 0 1 2.4 2.4l-5 5a.85.85 0 0 1-1.2-1.2l4.6-4.6" />
    </Svg>
  )
}

/** 폴더가 펼쳐졌는지 접혔는지. 펼쳐지면 CSS 로 90도 돌립니다. */
export function ChevronIcon(props: IconProps) {
  return (
    <svg
      className={props.className ? `icon ${props.className}` : 'icon'}
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  )
}

/*
 * 이름 앞에 서는 종류 아이콘입니다. 색으로 종류를 가릅니다.
 * 옅게 채우고 테두리를 둘러야 이 크기에서도 형태와 색이 함께 보입니다.
 */
function TintedSvg({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="currentColor"
      fillOpacity="0.18"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function FolderIcon(props: IconProps) {
  return (
    <TintedSvg {...props}>
      <path d="M1.7 12.2V4.1a.9.9 0 0 1 .9-.9h3l1.3 1.6h6.4a.9.9 0 0 1 .9.9v6.5a.9.9 0 0 1-.9.9H2.6a.9.9 0 0 1-.9-.9z" />
    </TintedSvg>
  )
}

export function DocIcon(props: IconProps) {
  return (
    <TintedSvg {...props}>
      <path d="M3.9 2.2h4.4l3.8 3.7v7.9a.8.8 0 0 1-.8.8H3.9a.8.8 0 0 1-.8-.8V3a.8.8 0 0 1 .8-.8z" />
      <path d="M8.3 2.3v3.7h3.7" fill="none" />
    </TintedSvg>
  )
}

export function ImageIcon(props: IconProps) {
  return (
    <TintedSvg {...props}>
      <rect x="1.9" y="3.2" width="12.2" height="9.6" rx="1.1" />
      <path d="M2.4 11.2l3.3-3.3 2.4 2.4 2.1-2.1 3.3 3.3" fill="none" strokeLinecap="round" />
      <circle cx="5.7" cy="6.1" r="1" fill="none" />
    </TintedSvg>
  )
}

/** 저장. 옛 플로피 디스크 모양이 아직 가장 빨리 읽힙니다. */
export function SaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 2.8h8l2.4 2.4v8a.4.4 0 0 1-.4.4H2.8a.4.4 0 0 1-.4-.4V3.2a.4.4 0 0 1 .4-.4z" />
      <path d="M5.2 2.8v3.6h5.2V2.8" />
      <path d="M5.2 13.6V9.6h5.6v4" />
    </Svg>
  )
}

/** 화면에 맞추기. 네 귀퉁이를 안으로 모으는 모양입니다. */
export function FitIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.6 6V2.6H6M10 2.6h3.4V6M13.4 10v3.4H10M6 13.4H2.6V10" />
      <rect x="5.6" y="5.6" width="4.8" height="4.8" rx="0.6" />
    </Svg>
  )
}

/** 본디 크기(1:1). 그림이 지닌 크기 그대로 봅니다. */
export function ActualSizeIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.2" />
      <path d="M5.6 6.6l1.1-.8v4.4M9.4 10.2h1.8M10.3 6.2v4" />
    </Svg>
  )
}

/** 더하기·빼기. 보기 배율을 키우고 줄일 때 씁니다. */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3.4v9.2M3.4 8h9.2" />
    </Svg>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 8h9.2" />
    </Svg>
  )
}

/*
 * 돌리기와 뒤집기.
 *
 * 돌리기는 둥근 화살로, 뒤집기는 가운데 접는 금과 그 양쪽 쐐기로 그립니다. 같은 모양을
 * 방향만 바꿔 쓰면 네 단추가 서로 구별되지 않아, 돌리기와 뒤집기를 아주 다르게 둡니다.
 */
/*
 * 돌리기.
 *
 * 화살 **머리는 획의 끝**에 붙고, 몸통은 머리가 지나온 쪽으로 뻗습니다. 처음에는 머리를
 * 획의 시작에 붙였더니(12시에서 오른쪽을 가리키는데 획은 3시·6시·9시로 뻗음) 눈에는
 * "9시에서 올라온 반시계" 로 읽혀, 두 단추가 서로 바뀐 것처럼 보였습니다.
 * 그래서 오른쪽 돌리기는 3시에서 시계 방향으로 돌아 12시에서 끝나고(틈은 오른쪽 위),
 * 왼쪽 돌리기는 그것을 거울에 비춘 모양입니다.
 */
export function RotateRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.8 8a4.8 4.8 0 1 1-4.8-4.8" />
      <path d="M6.3 1.5 8.1 3.2 6.3 4.9" />
    </Svg>
  )
}

export function RotateLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.2 8a4.8 4.8 0 1 0 4.8-4.8" />
      <path d="M9.7 1.5 7.9 3.2 9.7 4.9" />
    </Svg>
  )
}

/*
 * 뒤집기는 접는 금을 사이에 두고 마주 보는 두 쐐기로 그립니다. 한쪽만 칠해 두면 "같은
 * 그림이 거울에 비친 것" 이 한눈에 읽힙니다 — 둘 다 테두리로만 그렸더니 16픽셀에서는
 * 두 쐐기가 붙어 마름모 하나로 보여, 좌우와 상하를 가릴 수 없었습니다.
 */
export function FlipXIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.4v11.2" strokeDasharray="1.6 1.6" />
      <path d="M6.2 4.8v6.4L2.8 8z" fill="currentColor" stroke="none" />
      <path d="M9.8 4.8v6.4L13.2 8z" />
    </Svg>
  )
}

export function FlipYIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.4 8h11.2" strokeDasharray="1.6 1.6" />
      <path d="M4.8 6.2h6.4L8 2.8z" fill="currentColor" stroke="none" />
      <path d="M4.8 9.8h6.4L8 13.2z" />
    </Svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.9 4.3h10.2M6.4 4.3V2.9a.7.7 0 0 1 .7-.7h1.8a.7.7 0 0 1 .7.7v1.4" />
      <path d="M4.2 4.3l.6 8.4a.9.9 0 0 0 .9.8h4.6a.9.9 0 0 0 .9-.8l.6-8.4" />
      <path d="M6.7 6.8v4M9.3 6.8v4" />
    </Svg>
  )
}

/*
 * 옆줄 접기·펴기. 지금 접혀 있는지 펴져 있는지가 아니라
 * "누르면 어떻게 되는지"를 보여 줍니다. 꺾쇠가 가는 방향이 곧 트리가 갈 방향입니다.
 */
export function SidebarCloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" />
      <path d="M6.4 2.8v10.4" />
      <path d="M11.6 6.2L9.4 8l2.2 1.8" />
    </Svg>
  )
}

export function SidebarOpenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" />
      <path d="M6.4 2.8v10.4" />
      <path d="M9.4 6.2L11.6 8l-2.2 1.8" />
    </Svg>
  )
}

/** 입력한 것을 지웁니다. */
export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2" />
    </Svg>
  )
}

/** 즐겨찾기. 담아 두었으면 채워서, 아니면 테두리만 그립니다. */
export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={props.className ? `icon ${props.className}` : 'icon'}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 1.9l1.86 3.77 4.16.6-3.01 2.94.71 4.14L8 11.4l-3.72 1.95.71-4.14L1.98 6.27l4.16-.6z" />
    </svg>
  )
}

/** 맨 위로. 가로줄과 위쪽 화살표를 겹쳐 '끝까지' 라는 뜻을 담습니다. */
export function ToTopIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M3 3h10" />
      <path d="M8 13V6" />
      <path d="M5 9l3-3 3 3" />
    </Svg>
  )
}

/** 맨 아래로. */
export function ToBottomIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M3 13h10" />
      <path d="M8 3v7" />
      <path d="M5 7l3 3 3-3" />
    </Svg>
  )
}

/** 목차. 줄 셋을 늘어놓아 차례를 나타냅니다. */
export function ListIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M3 4h10" />
      <path d="M3 8h7" />
      <path d="M3 12h4" />
    </Svg>
  )
}

/** 백링크. 이쪽으로 들어오는 화살표. */
export function InboundIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M13 8H4" />
      <path d="M7 5L4 8l3 3" />
      <path d="M13 3v10" />
    </Svg>
  )
}

/** 자판. 단축키 목록 단추에 씁니다. */
export function KeyboardIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.6}>
      <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" />
      <path d="M4 7h1M6.5 7h1M9 7h1M11.5 7h1M4 9.5h1M6.5 9.5h3.5M11.5 9.5h1" />
    </Svg>
  )
}

/** 줄 셋. 좁은 화면에서 옆줄을 여는 단추입니다. */
export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Svg>
  )
}

/** 폴더로 옮기기. 폴더에 화살표가 들어갑니다. */
export function MoveIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.6}>
      <path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h6.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
      <path d="M5.5 9h4M8 7.5L9.5 9 8 10.5" />
    </Svg>
  )
}
