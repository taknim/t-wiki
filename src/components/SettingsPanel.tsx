import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FONTS, SIZES, THEMES, WIDTHS,
  type FontId, type ModeSetting, type SizeId, type ThemeId, type WidthId,
} from '../lib/theme'
import type { GitHubSync } from '../hooks/useGitHubSync'
import { GitHubSettings } from './GitHubSettings'
import { clearSessions, isRememberEnabled, setRememberEnabled } from '../lib/session'
import {
  readIncludeToken, readSaveOptions, writeIncludeToken, writeSaveOptions, type SaveOptions,
} from '../lib/saveOptions'
import { buildBundle, bundleFileName, parseBundle } from '../lib/settingsFile'
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
  onShowReport: () => void
  /** 설정 창을 열 때 바로 보여 줄 묶음. */
  initialTab?: TabId
  /** 지금 열려 있는 폴더 이름. 내보낸 파일에 적어 둡니다. */
  vaultName: string | null
  /** 트리를 펴 두었는지. 내보내고 들여올 때 함께 다룹니다. */
  sidebarOpen: boolean
  onSidebarOpen: (open: boolean) => void
  /** 트리 너비. 내보내고 들여올 때 함께 다룹니다. */
  sidebarWidth: number
  onSidebarWidth: (width: number) => void
  /** 즐겨찾기 칸을 펴 두었는지. 내보내고 들여올 때 함께 다룹니다. */
  favoritesOpen: boolean
  onFavoritesOpen: (open: boolean) => void
}

type TabId = 'general' | 'appearance' | 'sync'

const TABS: { id: TabId; name: string; hint: string }[] = [
  { id: 'general', name: '일반', hint: '저장 방식과 마지막 화면 상태 기억으로 이동' },
  { id: 'appearance', name: '모양', hint: '테마와 글꼴로 이동' },
  { id: 'sync', name: 'GitHub 동기화', hint: '저장소와 자동 동기화 설정으로 이동' },
]

export function SettingsPanel({
  onClose, sync, onShowReport, vaultName,
  sidebarOpen, onSidebarOpen, sidebarWidth, onSidebarWidth, favoritesOpen, onFavoritesOpen,
  initialTab = 'general',
}: SettingsPanelProps) {
  const { settings, isDark, update } = useTheme()
  const dialogs = useDialogs()
  const [tab, setTab] = useState<TabId>(initialTab)
  const [saveOptions, setSaveOptions] = useState<SaveOptions>(readSaveOptions)
  const [includeToken, setIncludeToken] = useState(readIncludeToken)
  const [transfer, setTransfer] = useState<string | null>(null)
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
        ? '내려받는 파일에 액세스 토큰이 그대로 적힙니다.\n'
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
      favoritesOpen,
      saveOptions,
      github: sync.isConfigured || sync.config.token ? sync.config : null,
      includeToken,
    })

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = bundleFileName(vaultName)
    link.click()
    // 브라우저가 다 읽을 틈을 주고 치웁니다.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setTransfer(includeToken ? '내보냈습니다. 토큰이 들어 있으니 파일을 잘 간수해 주세요.' : '내보냈습니다.')
  }

  const importSettings = async (file: File) => {
    const bundle = parseBundle(await file.text())
    if (!bundle) {
      setTransfer('t-WiKi 설정 파일이 아닙니다.')
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
    onFavoritesOpen(bundle.general.favoritesOpen)
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

    setTransfer(
      bundle.github
        ? `가져왔습니다${vaultName ? ` · 저장소 설정은 "${vaultName}" 에 넣었습니다` : ''}.`
        : '가져왔습니다.',
    )
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

  const jumpTo = useCallback((id: TabId) => {
    setTab(id)
    jumpingTo.current = id
    sectionRefs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    // 목적지에 정확히 닿지 않아도 잠시 뒤에는 다시 스크롤을 따르게 풀어 줍니다.
    window.clearTimeout(releaseTimer.current)
    releaseTimer.current = window.setTimeout(() => {
      jumpingTo.current = null
    }, 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    // 부드럽게 움직이는 중이면 목적지에 닿았을 때만 놓아 줍니다.
    if (jumpingTo.current) {
      if (jumpingTo.current === current) jumpingTo.current = null
      return
    }
    setTab(current)
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

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="설정">
        <header className="sheet-head">
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
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={tab === item.id ? 'location' : undefined}
                className={tab === item.id ? 'is-active' : ''}
                data-tip={item.hint}
                onClick={() => jumpTo(item.id)}
              >
                {item.name}
              </button>
            ))}
          </nav>

          <div className="settings-content" ref={contentRef} onScroll={onScroll}>
            <section className="settings-section" ref={sectionRefs.general}>
              <h3 className="settings-heading">일반</h3>
            <section className="field">
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

            <section className="field">
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

            <section className="field">
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
                  data-tip="지금 설정을 파일로 내려받습니다"
                  onClick={() => void exportSettings()}
                >
                  설정 내보내기
                </button>
                <button
                  type="button"
                  className="btn"
                  data-tip="내려받아 둔 설정 파일을 읽어 옵니다"
                  onClick={() => bundleInput.current?.click()}
                >
                  설정 가져오기
                </button>
                {transfer && <span className="hint" style={{ margin: 0 }}>{transfer}</span>}
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

          <section className="field">
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

          <section className="field">
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

          <section className="field">
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

          <section className="field">
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

          <section className="field">
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
                      : `한 줄이 ${width.value} 를 넘지 않게 가운데로 모읍니다`
                  }
                  aria-pressed={width.id === settings.width}
                  onClick={() => update({ width: width.id as WidthId })}
                >
                  {width.name}
                </button>
              ))}
            </div>
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
              <GitHubSettings sync={sync} onShowReport={onShowReport} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
