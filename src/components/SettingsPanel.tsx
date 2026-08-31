import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FONTS, SIZES, THEMES, WIDTHS,
  type FontId, type ModeSetting, type SizeId, type ThemeId, type WidthId,
} from '../lib/theme'
import type { GitHubSync } from '../hooks/useGitHubSync'
import { GitHubSettings } from './GitHubSettings'
import { clearSessions, isRememberEnabled, setRememberEnabled } from '../lib/session'
import { useTheme } from './themeContext'

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
}

type TabId = 'general' | 'appearance' | 'sync'

const TABS: { id: TabId; name: string; hint: string }[] = [
  { id: 'general', name: '일반', hint: '마지막 화면 상태 기억으로 이동' },
  { id: 'appearance', name: '모양', hint: '테마와 글꼴로 이동' },
  { id: 'sync', name: 'GitHub 동기화', hint: '저장소와 자동 동기화 설정으로 이동' },
]

export function SettingsPanel({ onClose, sync, onShowReport, initialTab = 'general' }: SettingsPanelProps) {
  const { settings, isDark, update } = useTheme()
  const [tab, setTab] = useState<TabId>(initialTab)

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
