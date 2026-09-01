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

function Svg({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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

/*
 * 설정. 톱니는 16px 에서 이빨이 서로 붙어 뭉개집니다.
 * 획이 성긴 조절 손잡이 모양이 이 크기에서 훨씬 또렷합니다.
 */
export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.4 5.4h11.2M2.4 10.6h11.2" />
      <circle cx="10.2" cy="5.4" r="2.2" />
      <circle cx="5.8" cy="10.6" r="2.2" />
    </Svg>
  )
}

/** 폴더와의 연결을 끊는다는 뜻으로, 폴더에서 빠져나가는 화살표를 씁니다. */
export function FolderExitIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.2 13H2.6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3.1l1.3 1.6h5.4a1 1 0 0 1 1 1v1.6" />
      <path d="M10.4 10.2h4.2M12.8 8.4l1.8 1.8-1.8 1.8" />
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
