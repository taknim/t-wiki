import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FONTS, IMAGE_ALIGNS, IMAGE_WIDTHS, LEADINGS, SIZES, THEMES, WIDTHS,
  type FontId, type LeadingId, type ModeSetting, type SizeId, type ThemeId, type WidthId,
} from '../lib/theme'
import type { GitHubSync } from '../hooks/useGitHubSync'
import { GitHubSettings } from './GitHubSettings'
import { ChevronIcon } from './icons'
import { clearSessions, isRememberEnabled, setRememberEnabled } from '../lib/session'
import {
  readIncludeToken, readSaveOptions, writeIncludeToken, writeSaveOptions, type SaveOptions,
} from '../lib/saveOptions'
import { removeEntry } from '../lib/fsAccess'
import { buildBundle, bundleFileName, parseBundle } from '../lib/settingsFile'
import type { ImageBackdrop, SidebarTab } from '../types'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { useTheme } from './themeContext'
import { useDialogs } from './dialogContext'

const MODES: { id: ModeSetting; name: string; hint: string }[] = [
  { id: 'system', name: '시스템 따름', hint: '운영체제의 밝게/어둡게 설정을 그대로 따릅니다' },
  { id: 'light', name: '밝게', hint: '시스템 설정과 상관없이 항상 밝은 화면' },
  { id: 'dark', name: '어둡게', hint: '시스템 설정과 상관없이 항상 어두운 화면' },
]

interface SettingsPanelProps {
  onClose: () => void
  sync: GitHubSync
  onShowHistory: () => void
  /** 설정 창을 열 때 바로 보여 줄 묶음. */
  initialTab?: TabId
  /** 지금 열려 있는 폴더 이름. 내보낸 파일에 적어 둡니다. */
  vaultName: string | null
  /** 지금 열려 있는 폴더. 내보낸 파일이 그 안에 떨어졌는지 가리는 데 씁니다. */
  vaultRoot: FileSystemDirectoryHandle | null
  /** 트리를 펴 두었는지. 내보내고 들여올 때 함께 다룹니다. */
  sidebarOpen: boolean
  onSidebarOpen: (open: boolean) => void
  /** 트리 너비. 내보내고 들여올 때 함께 다룹니다. */
  sidebarWidth: number
  onSidebarWidth: (width: number) => void
  /** 나란히 볼 때 원문이 차지하는 몫. 내보내고 들여올 때 함께 다룹니다. */
  splitRatio: number
  onSplitRatio: (percent: number) => void
  /** 옆줄에 어느 탭을 펴 두었는지. 내보내고 들여올 때 함께 다룹니다. */
  sidebarTab: SidebarTab
  onSidebarTab: (tab: SidebarTab) => void
  /** 고른 이미지를 그려 볼지. 본문이 바로 따라오도록 값은 App 이 들고 있습니다. */
  imagePreview: boolean
  imageBackdrop: ImageBackdrop
  onImageBackdrop: (next: ImageBackdrop) => void
  onImagePreview: (on: boolean) => void
  /** 워드·엑셀을 그려 볼지. */
  officePreview: boolean
  onOfficePreview: (on: boolean) => void
}

type TabId = 'general' | 'appearance' | 'sync'

/*
 * 왼쪽 메뉴는 묶음과 그 안의 갈래로 이룹니다.
 *
 * 설정이 늘면서 묶음 셋만으로는 굴려 찾아야 했습니다. 갈래 이름을 펼쳐 두면
 * 무엇이 어디 있는지 한눈에 보이고, 눌러 곧바로 갈 수 있습니다.
 *
 * 갈래는 설정 하나가 아니라 **한 갈래에 드는 설정 몇 개**를 가리킵니다.
 * '미리보기' 는 이미지와 오피스 둘을, '본문' 은 글꼴·크기·줄 간격·너비를 데리고 갑니다.
 * 설정마다 한 줄씩 세우면 메뉴가 화면보다 길어져, 목록을 굴려 찾던 처음으로 돌아갑니다.
 * id 는 그 갈래의 **첫 설정**을 가리킵니다. 눌러 첫 설정에 닿으면 나머지는 그 아래
 * 이어져 있으므로, 굴리는 동안 그 갈래가 계속 짙게 남습니다.
 * 둘이 어긋나면 눌러도 아무 데도 가지 않으므로, 새 갈래를 더할 때는 section 에도
 * 같은 id 를 답니다.
 */
const TABS: { id: TabId; name: string; hint: string; items: { id: string; name: string }[] }[] = [
  {
    id: 'general',
    name: '일반',
    hint: '마지막 화면 상태·미리보기·저장 방식으로 이동',
    items: [
      { id: 'set-session', name: '마지막 화면 상태' },
      { id: 'set-image-preview', name: '미리보기' },
      { id: 'set-tidy', name: '저장할 때 정돈' },
      { id: 'set-transfer', name: '설정 주고받기' },
    ],
  },
  {
    id: 'appearance',
    name: '모양',
    hint: '테마와 글꼴로 이동',
    items: [
      { id: 'set-theme', name: '테마' },
      { id: 'set-font', name: '본문' },
      { id: 'set-image-align', name: '이미지' },
    ],
  },
  {
    id: 'sync',
    name: 'GitHub 동기화',
    hint: '저장소와 자동 동기화 설정으로 이동',
    items: [
      { id: 'set-token', name: '저장소 연결' },
      { id: 'set-conflict', name: '동기화 방식' },
      { id: 'set-run', name: '동기화 실행' },
      { id: 'set-reset', name: '이 폴더의 설정' },
    ],
  },
]

export function SettingsPanel({
  onClose, sync, onShowHistory, vaultName, vaultRoot,
  sidebarOpen, onSidebarOpen, sidebarWidth, onSidebarWidth, sidebarTab, onSidebarTab,
  splitRatio, onSplitRatio,
  imagePreview, onImagePreview, imageBackdrop, onImageBackdrop,
  officePreview, onOfficePreview,
  initialTab = 'general',
}: SettingsPanelProps) {
  const { settings, isDark, update } = useTheme()
  const dialogs = useDialogs()
  const [tab, setTab] = useState<TabId>(initialTab)
  const [saveOptions, setSaveOptions] = useState<SaveOptions>(readSaveOptions)
  const [includeToken, setIncludeToken] = useState(readIncludeToken)
  /** 주고받기 결과 한 줄. 조심해야 할 결과는 눈에 띄게 그립니다. */
  const [transfer, setTransfer] = useState<{ text: string; danger?: boolean } | null>(null)
  const bundleInput = useRef<HTMLInputElement>(null)

  const exportSettings = async () => {
    /*
     * 토큰이 실리는 회차는 되돌릴 수 없습니다. 파일이 한번 나가면 거두어들일 수 없으므로
     * 무엇이 담기는지 밝히고 확인을 받습니다.
     */
    const holding = sync.isConfigured ? `, "${vaultName ?? '이 폴더'}"의 저장소 설정` : ''
    const ok = await dialogs.confirm({
      title: includeToken ? '액세스 토큰까지 내보낼까요?' : '설정을 내보낼까요?',
      label: includeToken
        ? '저장하는 파일에 액세스 토큰이 그대로 적힙니다.\n'
          + '그 토큰으로 저장소를 읽고 쓸 수 있으니, 메일·채팅·공유 폴더로 주고받지 마시고'
          + ' 옮긴 뒤에는 지워 주세요.\n\n'
          + `담기는 것: 모양, 저장 방식, 트리 접힘${holding}\n`
          + '동기화 기준점은 담기지 않습니다.'
        : `담기는 것: 모양, 저장 방식, 트리 접힘${holding}\n`
          + '액세스 토큰과 동기화 기준점은 담기지 않습니다.',
      confirmText: '내보내기',
      danger: includeToken,
    })
    if (!ok) return

    const bundle = buildBundle({
      vaultName: vaultName,
      appearance: settings,
      rememberSession: remember,
      sidebarOpen,
      sidebarWidth,
      splitRatio,
      sidebarTab,
      imagePreview,
      imageBackdrop,
      officePreview,
      saveOptions,
      github: sync.isConfigured || sync.config.token ? sync.config : null,
      includeToken,
    })

    /*
     * 내려받기 폴더로 흘려보내지 않고 고른 자리에 곧바로 씁니다.
     * 이 앱은 이미 폴더 손잡이로 파일을 다루므로, 설정 파일도 같은 길로 나갑니다.
     */
    let handle: FileSystemFileHandle
    try {
      handle = await window.showSaveFilePicker({
        id: 'mdwiki-settings',
        suggestedName: bundleFileName(vaultName),
        types: [{ description: 't-WiKi 설정 파일', accept: { 'application/json': ['.json'] } }],
      })
    } catch {
      // 저장 창을 그냥 닫으면 여기로 옵니다. 알릴 것이 없습니다.
      return
    }

    /*
     * 고른 자리가 볼트 안이면 그 파일도 동기화 대상이 됩니다.
     * 토큰이 든 파일이 저장소에 올라가는 일은 되돌리기 어려우므로, 쓰기 전에 묻습니다.
     * 아직 아무것도 쓰지 않았으니 여기서 물러서면 파일도 생기지 않습니다.
     */
    const inside = vaultRoot ? await vaultRoot.resolve(handle) : null
    if (inside && includeToken) {
      const go = await dialogs.confirm({
        title: '열어 둔 폴더 안에 저장할까요?',
        label: `"${inside.join('/')}" 는 지금 열어 둔 폴더 안입니다.\n`
          + '이 자리에 두면 다음 동기화 때 액세스 토큰이 담긴 채로 저장소에 올라갑니다.\n'
          + '올라간 토큰은 커밋 기록에 남아 지워도 되돌리기 어렵습니다.',
        confirmText: '그래도 저장',
        danger: true,
      })
      if (!go) {
        /*
         * 저장 창에서 이름을 정하는 순간 브라우저가 빈 파일을 만들어 둡니다.
         * 여기서 물러서면 아무 내용도 쓰지 않았으니 그 빈 껍데기를 치웁니다.
         * 원래 있던 파일을 골랐다면 비어 있지 않으므로 손대지 않습니다.
         */
        try {
          if ((await handle.getFile()).size === 0) {
            await removeEntry(vaultRoot!, inside.join('/'))
          }
        } catch {
          // 치우지 못해도 내용은 쓰지 않았습니다. 알릴 것은 없습니다.
        }
        return
      }
    }

    try {
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(bundle, null, 2))
      await writable.close()
    } catch (cause) {
      setTransfer({
        text: `저장하지 못했습니다: ${cause instanceof Error ? cause.message : String(cause)}`,
        danger: true,
      })
      return
    }

    if (inside) {
      setTransfer({
        text: `"${handle.name}" 를 열어 둔 폴더 안에 저장했습니다.`
          + ' 다음 동기화 때 저장소로 함께 올라갑니다.'
          + (includeToken ? ' 토큰이 들어 있으니 폴더 밖으로 옮겨 주세요.' : ''),
        danger: includeToken,
      })
      return
    }

    setTransfer({
      text: includeToken
        ? `"${handle.name}" 로 저장했습니다. 토큰이 들어 있으니 파일을 잘 간수해 주세요.`
        : `"${handle.name}" 로 저장했습니다.`,
    })
  }

  const importSettings = async (file: File) => {
    const bundle = parseBundle(await file.text())
    if (!bundle) {
      setTransfer({ text: 't-WiKi 설정 파일이 아닙니다.', danger: true })
      return
    }

    /*
     * 파일을 읽은 뒤에 묻습니다. 고르기 전에 물으면 무엇이 들었는지 모른 채
     * 답해야 합니다. 읽고 나면 어디서 온 것인지, 저장소 설정이 함께 오는지 밝힐 수 있습니다.
     */
    const day = bundle.exportedAt ? `${bundle.exportedAt.slice(0, 10)} · ` : ''
    const from = bundle.vaultName ? `${day}"${bundle.vaultName}" 에서 내보낸 파일로 ` : ''
    const landing = bundle.github
      ? `\n저장소 설정은 지금 열려 있는 ${vaultName ? `"${vaultName}" 에` : '폴더에'}만 들어갑니다.`
        + (bundle.github.token ? ' (액세스 토큰 포함)' : ' (액세스 토큰은 들어 있지 않습니다)')
        + '\n저장소 설정이 되어 동기화가 진행되면 기존에 내용을 덮어씌우거나 내용이 삭제될 수'
        + ' 있으니 주의하십시오.'
        + '\n자동 동기화 설정이 되어 있는 경우 동기화가 자동으로 진행될 수 있습니다.'
      : '\n저장소 설정은 들어 있지 않습니다.'

    const ok = await dialogs.confirm({
      title: '이 설정을 적용할까요?',
      label: `${from}지금 설정을 덮어씁니다.${landing}`,
      confirmText: '적용',
    })
    if (!ok) return

    update(bundle.appearance)
    setRemember(bundle.general.rememberSession)
    setRememberEnabled(bundle.general.rememberSession)
    onSidebarOpen(bundle.general.sidebarOpen)
    onSidebarWidth(bundle.general.sidebarWidth)
    onSplitRatio(bundle.general.splitRatio)
    onSidebarTab(bundle.general.sidebarTab)
    onImagePreview(bundle.general.imagePreview)
    onImageBackdrop(bundle.general.imageBackdrop)
    onOfficePreview(bundle.general.officePreview)
    setIncludeToken(bundle.general.includeToken)
    writeIncludeToken(bundle.general.includeToken)
    const next = {
      trimWhitespace: bundle.general.trimWhitespace,
      tidyFormat: bundle.general.tidyFormat,
    }
    setSaveOptions(next)
    writeSaveOptions(next)

    if (bundle.github) {
      // 저장소 설정은 지금 열려 있는 폴더에만 넣습니다.
      // 토큰이 비어 있으면 여기 있던 것을 지우지 않고 그대로 둡니다.
      const { token, ...rest } = bundle.github
      sync.update(token ? bundle.github : rest)
      /*
       * 잡아 둔 자동 차례를 버리고 새 설정으로 처음부터 다시 셉니다.
       * 대상이 달라졌는데 앞 설정으로 세던 시간이 그대로 이어지면,
       * 화면에 뜬 남은 시간이 어느 저장소를 향한 것인지 알 수 없습니다.
       * 켜짐 여부와 간격이 우연히 같아도 다시 셉니다.
       */
      sync.restartAutoSync()
    }

    setTransfer({
      text: bundle.github
        ? `가져왔습니다${vaultName ? ` · 저장소 설정은 "${vaultName}" 에 넣었습니다` : ''}.`
        : '가져왔습니다.',
    })
  }

  const changeSave = (patch: Partial<SaveOptions>) => {
    const next = { ...saveOptions, ...patch }
    setSaveOptions(next)
    writeSaveOptions(next)
  }

  const contentRef = useRef<HTMLDivElement>(null)
  const sectionRefs = {
    general: useRef<HTMLElement>(null),
    appearance: useRef<HTMLElement>(null),
    sync: useRef<HTMLElement>(null),
  }
  // 메뉴를 눌러 움직이는 동안에는 스크롤 위치로 강조를 바꾸지 않습니다.
  const jumpingTo = useRef<TabId | null>(null)
  const releaseTimer = useRef(0)
  /** 지금 보고 있는 갈래. 왼쪽 나무에서 그 줄만 짙게 그립니다. */
  const [field, setField] = useState<string | null>(null)
  /*
   * 접어 둔 묶음. 접힌 쪽만 들고 있어, 나중에 묶음을 더해도 저절로 펴진 채로 나옵니다.
   * 창을 닫으면 잊습니다. 설정 창은 잠깐 들르는 자리라, 접어 둔 것을 기억해 두면
   * 그런 적이 있는 줄 모르는 사람에게는 설정이 사라진 것처럼 보입니다.
   */
  const [folded, setFolded] = useState<Set<TabId>>(() => new Set())

  /** 갈래 한 줄로 곧장 갑니다. 묶음 안에서 다시 굴려 찾지 않아도 됩니다. */
  const jumpToField = useCallback((tabId: TabId, fieldId: string) => {
    setTab(tabId)
    setField(fieldId)
    jumpingTo.current = tabId
    document.getElementById(fieldId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    window.clearTimeout(releaseTimer.current)
    releaseTimer.current = window.setTimeout(() => {
      jumpingTo.current = null
    }, 800)
  }, [])

  const jumpTo = useCallback((id: TabId) => {
    setTab(id)
    setField(null)
    jumpingTo.current = id
    sectionRefs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    // 목적지에 정확히 닿지 않아도 잠시 뒤에는 다시 스크롤을 따르게 풀어 줍니다.
    window.clearTimeout(releaseTimer.current)
    releaseTimer.current = window.setTimeout(() => {
      jumpingTo.current = null
    }, 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 묶음 이름을 눌렀을 때.
   *
   * 트리의 폴더 줄과 같은 규칙입니다. 처음 누르면 그 자리로 가고, 이미 보고 있는
   * 묶음을 다시 누르면 접습니다. 누를 때마다 접혔다 펴지면 옆 묶음으로 건너가려던
   * 사람이 번번이 목록을 잃습니다.
   * 접힌 묶음은 펴면서 그 자리로 갑니다. 펴는 까닭이 대개 그것입니다.
   */
  const tapGroup = useCallback((id: TabId) => {
    if (folded.has(id)) {
      setFolded((previous) => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
      jumpTo(id)
      return
    }
    if (tab === id) {
      setFolded((previous) => new Set(previous).add(id))
      return
    }
    jumpTo(id)
  }, [folded, jumpTo, tab])

  /** 스크롤에 따라 지금 보고 있는 묶음을 강조합니다. */
  const onScroll = useCallback(() => {
    const container = contentRef.current
    if (!container) return

    // 위로 뛸 때 scroll-padding 만큼 여백이 남으므로, 그보다 넉넉한 기준을 씁니다.
    const THRESHOLD = 24
    const top = container.getBoundingClientRect().top
    let current: TabId = 'general'
    for (const id of TABS.map((item) => item.id)) {
      const element = sectionRefs[id].current
      // 위쪽 경계를 살짝 넘긴 마지막 묶음이 지금 보고 있는 것입니다.
      if (element && element.getBoundingClientRect().top - top <= THRESHOLD) current = id
    }

    // 갈래도 같은 잣대로 가립니다. 위쪽 경계를 넘긴 마지막 갈래가 지금 보는 줄입니다.
    let here: string | null = null
    for (const group of TABS) {
      for (const item of group.items) {
        const element = document.getElementById(item.id)
        if (element && element.getBoundingClientRect().top - top <= THRESHOLD) here = item.id
      }
    }

    // 부드럽게 움직이는 중이면 목적지에 닿았을 때만 놓아 줍니다.
    if (jumpingTo.current) {
      if (jumpingTo.current === current) jumpingTo.current = null
      return
    }
    setTab(current)
    setField(here)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 창을 열 때 지정된 묶음으로 바로 이동합니다.
  useEffect(() => {
    if (initialTab === 'general') return
    sectionRefs[initialTab].current?.scrollIntoView({ block: 'start' })
    setTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab])
  const [remember, setRemember] = useState(isRememberEnabled)
  const [cleared, setCleared] = useState(false)

  /*
   * 창을 끌어 옮긴 거리.
   *
   * 자리는 여전히 가운데 정렬이 잡고, 여기서는 그 자리에서 얼마나 밀렸는지만 셉니다.
   * 창 크기가 바뀌어도 가운데를 기준으로 다시 잡히므로 화면 밖으로 달아나지 않습니다.
   */
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragFrom = useRef<
    { x: number; y: number; left: number; top: number; width: number } | null
  >(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  /** 창을 아무리 끌어도 화면에 남겨 둘 만큼. 이만큼은 남아야 다시 잡을 수 있습니다. */
  const KEEP_ON_SCREEN = 80

  const startDrag = (event: React.PointerEvent) => {
    // 머리줄의 단추(닫기)를 누른 것이면 끌기가 아닙니다.
    if ((event.target as HTMLElement).closest('button')) return
    const sheet = sheetRef.current
    if (!sheet) return

    /*
     * 옮기기 전 자리와 크기를 잡을 때 한 번만 재 둡니다.
     * 끄는 동안 다시 재면 방금 준 값이 아직 화면에 그려지기 전이라 기준이 흔들립니다.
     */
    const rect = sheet.getBoundingClientRect()
    dragFrom.current = {
      x: event.clientX - offset.x,
      y: event.clientY - offset.y,
      left: rect.left - offset.x,
      top: rect.top - offset.y,
      width: rect.width,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onDrag = (event: React.PointerEvent) => {
    const from = dragFrom.current
    if (!from) return

    /*
     * 창을 완전히 밀어내지는 못하게 막습니다. 머리줄이 위로 사라지면 다시 잡을
     * 방법이 없으므로 위쪽은 화면 끝에서 멈추고, 나머지 세 방향은 조금 남겨 둡니다.
     */
    const clamp = (value: number, least: number, most: number) =>
      Math.min(Math.max(value, least), most)

    setOffset({
      x: clamp(
        event.clientX - from.x,
        KEEP_ON_SCREEN - from.width - from.left,
        window.innerWidth - KEEP_ON_SCREEN - from.left,
      ),
      y: clamp(
        event.clientY - from.y,
        -from.top,
        window.innerHeight - KEEP_ON_SCREEN - from.top,
      ),
    })
  }

  const endDrag = (event: React.PointerEvent) => {
    dragFrom.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // Esc 로 닫습니다. 위에 동기화 결과나 확인 창이 떠 있으면 그쪽이 먼저입니다.
  useEscapeClose(onClose)

  return (
    <div
      /*
       * 바탕을 어둡게 덮지 않습니다. 설정을 바꾸면서 화면이 어떻게 바뀌는지
       * 바로 보여야 합니다. 대신 이 칸이 그대로 덮고 있어 뒤쪽은 눌리지 않습니다.
       */
      className="overlay is-clear"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={sheetRef}
        className="sheet is-movable"
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <header
          className="sheet-head sheet-grab"
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <h2>설정</h2>
          <button
            type="button"
            className="btn sheet-close"
            aria-label="닫기"
            data-tip="설정 창을 닫습니다"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="sheet-body settings-layout">
          <nav className="settings-nav" aria-label="설정 묶음">
            {TABS.map((group) => (
              <div key={group.id} className="settings-nav-group">
                <button
                  type="button"
                  aria-current={tab === group.id && field === null ? 'location' : undefined}
                  aria-expanded={!folded.has(group.id)}
                  className={tab === group.id ? 'is-active' : ''}
                  data-tip={
                    folded.has(group.id)
                      ? `${group.name} 갈래를 펼치고 그 자리로 갑니다`
                      : tab === group.id ? `${group.name} 갈래를 접습니다` : group.hint
                  }
                  onClick={() => tapGroup(group.id)}
                >
                  <span className={folded.has(group.id) ? 'settings-nav-caret' : 'settings-nav-caret is-open'}>
                    <ChevronIcon />
                  </span>
                  {group.name}
                </button>
                {/* 갈래를 펼쳐 두면 무엇이 어디 있는지 굴려 보지 않아도 압니다. */}
                {!folded.has(group.id) && group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={field === item.id ? 'settings-nav-item is-here' : 'settings-nav-item'}
                    aria-current={field === item.id ? 'location' : undefined}
                    onClick={() => jumpToField(group.id, item.id)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="settings-content" ref={contentRef} onScroll={onScroll}>
            <section className="settings-section" ref={sectionRefs.general}>
              <h3 className="settings-heading">일반</h3>
            <section className="field" id="set-session">
              <label>마지막 화면 상태</label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => {
                    setRemember(event.target.checked)
                    setRememberEnabled(event.target.checked)
                    setCleared(false)
                  }}
                />
                폴더를 다시 열면 마지막 상태로 되돌리기
                <span className="hint">
                  펼쳐 두었던 폴더와 마지막으로 고른 문서를 기억합니다.
                  새로고침하거나 폴더를 닫았다 다시 열어도 그대로 이어집니다.
                  폴더는 이름이 아니라 실제 위치로 구분하므로, 같은 이름의 다른 폴더와 섞이지 않습니다.
                </span>
              </label>

              <div className="row" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn"
                  data-tip="기억해 둔 모든 폴더의 화면 상태를 지웁니다"
                  onClick={() => {
                    void clearSessions()
                    setCleared(true)
                  }}
                >
                  기억한 상태 지우기
                </button>
                {cleared && <span className="hint" style={{ margin: 0 }}>지웠습니다.</span>}
              </div>

              <p className="hint" style={{ marginTop: 14 }}>
                최근 연 폴더 10개까지 기억하고, 그보다 오래된 것은 버립니다.
                이 기록은 이 브라우저에만 남고 저장소로 올라가지 않습니다.
              </p>
            </section>

            <section className="field" id="set-image-preview">
              <label>이미지 미리보기</label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={imagePreview}
                  onChange={(event) => onImagePreview(event.target.checked)}
                />
                고른 이미지를 화면에 그리기
                <span className="hint">
                  트리에서 이미지를 고르면 그림을 띄웁니다.
                  끄면 파일을 읽지 않고 안내만 내놓습니다. 큰 그림이 많은 폴더에서 쓸모가 있습니다.
                  어느 쪽이든 파일은 그대로 폴더에 있고, 문서 안에 넣은 그림은 미리보기에 그대로 나옵니다.
                </span>
              </label>
            </section>

            <section className="field" id="set-office-preview">
              <label>오피스 미리보기</label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={officePreview}
                  onChange={(event) => onOfficePreview(event.target.checked)}
                />
                워드·엑셀 문서를 화면에 그리기
                <span className="hint">
                  트리에서 <code>docx</code>·<code>xlsx</code>·<code>xls</code> 를 고르면
                  엑셀은 표로, 워드는 글로 풀어 보여 줍니다.
                  읽는 벌이 큰 편이라 그 파일을 열 때 한 번 내려받습니다.
                  끄면 파일을 읽지도, 벌을 내려받지도 않고 안내만 내놓습니다.
                  어느 쪽이든 파일은 그대로 폴더에 있고, 동기화에도 영향이 없습니다.
                </span>
              </label>
            </section>

            <section className="field" id="set-tidy">
              <label>저장할 때 정돈</label>
              <p className="hint" style={{ marginTop: 0 }}>
                아무것도 켜지 않으면 <strong>쓴 그대로</strong> 저장합니다.
                미리보기는 설정과 상관없이 늘 형식에 맞춰 보여 주지만, 그때는 파일을 건드리지 않습니다.
                정돈은 그 문서에서 벗어날 때 한 번만 합니다. 글을 쓰는 도중에 손대면 커서가 튑니다.
              </p>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={saveOptions.trimWhitespace}
                  onChange={(event) => changeSave({ trimWhitespace: event.target.checked })}
                />
                줄 끝 공백과 문서 앞뒤의 빈 줄 지우기
                <span className="hint">
                  줄 끝에 남은 공백·탭을 지우고, 문서 앞뒤의 빈 줄을 걷어낸 뒤 줄바꿈 하나로 끝맺습니다.
                  뜻을 가진 공백은 남깁니다. 마크다운에서 줄 끝의 공백 둘 이상은 줄바꿈이라 그대로 두고,
                  YAML 블록 스칼라(<code>|</code>, <code>&gt;</code>) 안쪽도 전부 내용이라 손대지 않습니다.
                </span>
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={saveOptions.tidyFormat}
                  onChange={(event) => changeSave({ tidyFormat: event.target.checked })}
                />
                문서 형식에 맞춰 들여쓰기 다시 잡기
                <span className="hint">
                  JSON·XML 은 들여쓰기를 맞추고, YAML 은 규격이 금하는 들여쓰기의 탭을 공백으로 바꿉니다.
                  YAML 의 깊이 자체는 건드리지 않습니다. 들여쓰기가 곧 뜻이라 다시 잡으면 문서가 달라집니다.
                  마크다운·글(txt)·표(csv·tsv)는 정해진 모양이 없어 그대로 둡니다.
                </span>
              </label>
            </section>

            <section className="field" id="set-transfer">
              <label>설정 주고받기</label>
              <p className="hint" style={{ marginTop: 0 }}>
                모양·저장 방식과 <strong>지금 열려 있는 폴더</strong>의 저장소 설정을 파일 하나로 담습니다.
                다른 기기에서는 폴더를 먼저 연 뒤 가져오면 그 폴더에 들어갑니다.
                동기화 기준점은 담지 않습니다. 그 폴더가 저장소와 어디까지 맞췄는지는 기기마다 다르고,
                남의 기준점을 들여오면 여기 없는 파일이 지워진 것으로 읽힙니다.
              </p>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={includeToken}
                  onChange={(event) => {
                    setIncludeToken(event.target.checked)
                    writeIncludeToken(event.target.checked)
                  }}
                />
                액세스 토큰도 함께 내보내기
                <span className="hint">
                  파일에 토큰이 그대로 적힙니다. 메일이나 채팅으로 주고받지 마세요.
                  켜지 않으면 나머지 설정만 담기고, 가져온 뒤 토큰만 새로 넣으면 됩니다.
                </span>
              </label>

              <div className="row" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn"
                  data-tip="지금 설정을 파일로 저장합니다. 저장할 자리는 다음 창에서 고릅니다"
                  onClick={() => void exportSettings()}
                >
                  설정 내보내기
                </button>
                <button
                  type="button"
                  className="btn"
                  data-tip="저장해 둔 설정 파일을 읽어 옵니다"
                  onClick={() => bundleInput.current?.click()}
                >
                  설정 가져오기
                </button>
                {transfer && (
                  <span
                    className={transfer.danger ? 'hint transfer-warn' : 'hint'}
                    style={{ margin: 0 }}
                  >
                    {transfer.text}
                  </span>
                )}
              </div>

              <input
                ref={bundleInput}
                id="settings-bundle"
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void importSettings(file)
                }}
              />
            </section>
            </section>


            <section className="settings-section" ref={sectionRefs.appearance}>
              <h3 className="settings-heading">모양</h3>

          <section className="field" id="set-theme">
            <label>테마</label>
            <div className="theme-grid">
              {THEMES.map((theme) => {
                const palette = isDark ? theme.dark : theme.light
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={theme.id === settings.theme ? 'theme-card is-active' : 'theme-card'}
                    data-tip={theme.description}
                    aria-pressed={theme.id === settings.theme}
                    onClick={() => update({ theme: theme.id as ThemeId })}
                  >
                    <span
                      className="theme-swatch"
                      style={{ background: palette.bg, borderColor: palette.borderStrong }}
                    >
                      <span style={{ background: palette.text }} />
                      <span style={{ background: palette.accent }} />
                      <span style={{ background: palette.ok }} />
                      <span style={{ background: palette.warn }} />
                    </span>
                    <span className="theme-name">{theme.name}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="field" id="set-mode">
            <label>밝기</label>
            <div className="segmented" role="group" aria-label="밝기">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={mode.id === settings.mode ? 'is-active' : ''}
                  data-tip={mode.hint}
                  aria-pressed={mode.id === settings.mode}
                  onClick={() => update({ mode: mode.id })}
                >
                  {mode.name}
                </button>
              ))}
            </div>
          </section>

          <section className="field" id="set-font">
            <label>본문 글꼴</label>
            <div className="segmented" role="group" aria-label="본문 글꼴">
              {FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  className={font.id === settings.font ? 'is-active' : ''}
                  style={{ fontFamily: font.stack }}
                  data-tip={`미리보기 본문을 ${font.name} 글꼴로 표시합니다`}
                  aria-pressed={font.id === settings.font}
                  onClick={() => update({ font: font.id as FontId })}
                >
                  {font.name}
                </button>
              ))}
            </div>
            <p className="hint">편집기는 코드를 다루기 좋게 고정폭을 그대로 씁니다.</p>
          </section>

          <section className="field" id="set-size">
            <label>글자 크기</label>
            <div className="segmented" role="group" aria-label="글자 크기">
              {SIZES.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  className={size.id === settings.size ? 'is-active' : ''}
                  data-tip={`본문 글자를 ${size.value} 로 표시합니다`}
                  aria-pressed={size.id === settings.size}
                  onClick={() => update({ size: size.id as SizeId })}
                >
                  {size.name}
                </button>
              ))}
            </div>
          </section>

          <section className="field" id="set-leading">
            <label>줄 간격</label>
            <div className="segmented" role="group" aria-label="줄 간격">
              {LEADINGS.map((leading) => (
                <button
                  key={leading.id}
                  type="button"
                  className={leading.id === settings.leading ? 'is-active' : ''}
                  data-tip={`줄 높이를 글자 크기의 ${leading.value} 배로 둡니다`}
                  aria-pressed={leading.id === settings.leading}
                  onClick={() => update({ leading: leading.id as LeadingId })}
                >
                  {leading.name}
                </button>
              ))}
            </div>
            <p className="hint">
              미리보기와 편집기에 함께 걸립니다. 읽는 쪽과 쓰는 쪽이 따로 놀면 어지럽습니다.
              배수라서 글자 크기를 바꿔도 비율은 그대로입니다.
              빽빽한 표를 볼 때와 긴 글을 읽을 때 알맞은 간격이 달라, 다섯 단계로 나눠 두었습니다.
            </p>
          </section>

          <section className="field" id="set-width">
            <label>본문 너비</label>
            <div className="segmented" role="group" aria-label="본문 너비">
              {WIDTHS.map((width) => (
                <button
                  key={width.id}
                  type="button"
                  className={width.id === settings.width ? 'is-active' : ''}
                  data-tip={
                    width.value === 'none'
                      ? '창 너비를 다 씁니다'
                      : `글·표·코드가 ${width.value} 를 넘지 않게 묶습니다`
                  }
                  aria-pressed={width.id === settings.width}
                  onClick={() => update({ width: width.id as WidthId })}
                >
                  {width.name}
                </button>
              ))}
            </div>
          </section>

          <section className="field" id="set-image-align">
            <label>이미지 정렬</label>
            <div className="segmented" role="group" aria-label="이미지 정렬">
              {IMAGE_ALIGNS.map((align) => (
                <button
                  key={align.id}
                  type="button"
                  className={align.id === settings.imageAlign ? 'is-active' : ''}
                  data-tip={`한 줄을 통째로 차지하는 그림을 ${align.name}에 세웁니다`}
                  aria-pressed={align.id === settings.imageAlign}
                  onClick={() => update({ imageAlign: align.id })}
                >
                  {align.name}
                </button>
              ))}
            </div>
            <p className="hint">
              문서 안의 그림과 그림 파일 미리보기에 함께 걸립니다.
              글줄 사이에 섞여 흐르는 그림은 글을 따라가므로 건드리지 않습니다.
            </p>
          </section>

          <section className="field" id="set-image-width">
            <label>이미지 최대 너비</label>
            <div className="segmented" role="group" aria-label="이미지 최대 너비">
              {IMAGE_WIDTHS.map((width) => (
                <button
                  key={width.id}
                  type="button"
                  className={width.id === settings.imageWidth ? 'is-active' : ''}
                  data-tip={
                    width.value === '100%'
                      ? '본문 너비까지 그대로 씁니다'
                      : `${width.value} 보다 큰 그림만 줄여 보여 줍니다`
                  }
                  aria-pressed={width.id === settings.imageWidth}
                  onClick={() => update({ imageWidth: width.id })}
                >
                  {width.name}
                </button>
              ))}
            </div>
            <p className="hint">
              <strong>큰 그림만 줄이고 작은 그림은 늘리지 않습니다.</strong>
              본문 너비보다 커지는 일도 없습니다. 둘 가운데 좁은 쪽을 씁니다.
            </p>
          </section>

          <section className="field">
            <p className="hint">
              설정은 이 브라우저에 저장되고 바로 적용됩니다.
              코드 하이라이팅과 다이어그램 색도 고른 테마를 따라갑니다.
            </p>
          </section>

            </section>

            <section className="settings-section" ref={sectionRefs.sync}>
              <h3 className="settings-heading">GitHub 동기화</h3>
              <GitHubSettings sync={sync} onShowHistory={onShowHistory} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
