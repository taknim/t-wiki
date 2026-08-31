import { useState } from 'react'
import {
  FONTS, SIZES, THEMES, WIDTHS,
  type FontId, type ModeSetting, type SizeId, type ThemeId, type WidthId,
} from '../lib/theme'
import type { GitHubSync } from '../hooks/useGitHubSync'
import { GitHubSettings } from './GitHubSettings'
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

type TabId = 'appearance' | 'sync'

const TABS: { id: TabId; name: string; hint: string }[] = [
  { id: 'appearance', name: '모양', hint: '테마와 글꼴' },
  { id: 'sync', name: 'GitHub 동기화', hint: '저장소와 자동 동기화 설정' },
]

export function SettingsPanel({ onClose, sync, onShowReport, initialTab = 'appearance' }: SettingsPanelProps) {
  const { settings, isDark, update } = useTheme()
  const [tab, setTab] = useState<TabId>(initialTab)

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
          <div className="segmented" role="tablist" aria-label="설정 묶음">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'is-active' : ''}
                data-tip={item.hint}
                onClick={() => setTab(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <button type="button" className="btn" data-tip="설정 창을 닫습니다" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="sheet-body">
          {tab === 'sync' && <GitHubSettings sync={sync} onShowReport={onShowReport} />}

          {tab === 'appearance' && (
          <>
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
          </>
          )}
        </div>
      </div>
    </div>
  )
}
