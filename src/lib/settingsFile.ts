import { DEFAULT_SETTINGS, FONTS, SIZES, THEMES, WIDTHS, type ThemeSettings } from './theme'
import { clampSidebarWidth, DEFAULT_SAVE_OPTIONS, DEFAULT_SIDEBAR_WIDTH, type SaveOptions } from './saveOptions'
import { DEFAULT_GITHUB_CONFIG } from '../hooks/useGitHubSync'
import type { GitHubConfig } from '../types'

/**
 * 설정을 파일 하나로 주고받습니다.
 *
 * 담는 것은 취향과 지금 폴더의 저장소 설정뿐입니다.
 *
 * 동기화 기준점은 담지 않습니다. 기준점은 "이 폴더가 저장소와 어디까지 맞췄는지" 이고,
 * 다른 기기의 폴더는 내용이 다릅니다. 남의 기준점을 들여오면 여기 없는 파일이
 * "지워졌다" 로 읽혀 저장소에서 사라집니다. 폴더 손잡이도 담지 않습니다.
 * 브라우저 밖에서는 뜻이 없는 값입니다.
 */
export interface SettingsBundle {
  app: 't-WiKi'
  version: 1
  exportedAt: string
  /** 어느 폴더에서 내보냈는지. 사람이 알아보라고 적어 둡니다. */
  vaultName: string | null
  appearance: ThemeSettings
  general: {
    rememberSession: boolean
    sidebarOpen: boolean
    sidebarWidth: number
    includeToken: boolean
  } & SaveOptions
  github: GitHubConfig | null
}

export interface ExportInput {
  vaultName: string | null
  appearance: ThemeSettings
  rememberSession: boolean
  sidebarOpen: boolean
  sidebarWidth: number
  saveOptions: SaveOptions
  github: GitHubConfig | null
  /** 액세스 토큰까지 담을지. 파일에 그대로 적히므로 기본은 담지 않습니다. */
  includeToken: boolean
}

export function buildBundle(input: ExportInput): SettingsBundle {
  return {
    app: 't-WiKi',
    version: 1,
    exportedAt: new Date().toISOString(),
    vaultName: input.vaultName,
    appearance: input.appearance,
    general: {
      rememberSession: input.rememberSession,
      sidebarOpen: input.sidebarOpen,
      sidebarWidth: input.sidebarWidth,
      includeToken: input.includeToken,
      ...input.saveOptions,
    },
    github: input.github
      ? { ...input.github, token: input.includeToken ? input.github.token : '' }
      : null,
  }
}

/** 내려받을 파일 이름. 폴더 이름과 날짜를 넣어 여러 벌을 구분합니다. */
export function bundleFileName(vaultName: string | null): string {
  const day = new Date().toISOString().slice(0, 10)
  const where = (vaultName ?? '설정').replace(/[/\\:*?"<>|]/g, '_')
  return `t-WiKi ${where} ${day}.json`
}

const pick = <T extends string>(value: unknown, allowed: readonly { id: T }[], fallback: T): T =>
  allowed.some((entry) => entry.id === value) ? (value as T) : fallback

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/*
 * 들여올 때는 파일을 믿지 않습니다. 사람이 손으로 고쳤을 수도, 다른 판에서 온 것일
 * 수도 있습니다. 아는 값만 골라 담고 나머지는 기본값으로 둡니다.
 */
export function parseBundle(raw: string): SettingsBundle | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null

  const source = data as Record<string, unknown>
  if (source.app !== 't-WiKi') return null

  const appearance = (source.appearance ?? {}) as Record<string, unknown>
  const general = (source.general ?? {}) as Record<string, unknown>
  const github = source.github as Record<string, unknown> | null | undefined

  return {
    app: 't-WiKi',
    version: 1,
    exportedAt: text(source.exportedAt),
    vaultName: typeof source.vaultName === 'string' ? source.vaultName : null,
    appearance: {
      theme: pick(appearance.theme, THEMES, DEFAULT_SETTINGS.theme),
      mode: (['system', 'light', 'dark'] as const).includes(appearance.mode as 'system')
        ? (appearance.mode as ThemeSettings['mode'])
        : DEFAULT_SETTINGS.mode,
      font: pick(appearance.font, FONTS, DEFAULT_SETTINGS.font),
      size: pick(appearance.size, SIZES, DEFAULT_SETTINGS.size),
      width: pick(appearance.width, WIDTHS, DEFAULT_SETTINGS.width),
    },
    general: {
      rememberSession: bool(general.rememberSession, true),
      sidebarOpen: bool(general.sidebarOpen, true),
      // 다른 기기는 창이 더 좁을 수 있습니다. 그쪽 잣대로 다시 재 둡니다.
      sidebarWidth: typeof general.sidebarWidth === 'number'
        ? clampSidebarWidth(general.sidebarWidth)
        : DEFAULT_SIDEBAR_WIDTH,
      includeToken: bool(general.includeToken, false),
      trimWhitespace: bool(general.trimWhitespace, DEFAULT_SAVE_OPTIONS.trimWhitespace),
      tidyFormat: bool(general.tidyFormat, DEFAULT_SAVE_OPTIONS.tidyFormat),
    },
    github: github
      ? {
          ...DEFAULT_GITHUB_CONFIG,
          token: text(github.token),
          owner: text(github.owner),
          repo: text(github.repo),
          branch: text(github.branch) || DEFAULT_GITHUB_CONFIG.branch,
          basePath: text(github.basePath),
          conflictPolicy: (['keep-both', 'local-wins', 'remote-wins'] as const)
            .includes(github.conflictPolicy as 'keep-both')
            ? (github.conflictPolicy as GitHubConfig['conflictPolicy'])
            : DEFAULT_GITHUB_CONFIG.conflictPolicy,
          propagateDeletes: bool(github.propagateDeletes, DEFAULT_GITHUB_CONFIG.propagateDeletes),
          autoSync: bool(github.autoSync, DEFAULT_GITHUB_CONFIG.autoSync),
          autoSyncMinutes:
            typeof github.autoSyncMinutes === 'number' && Number.isFinite(github.autoSyncMinutes)
              ? Math.min(Math.max(Math.round(github.autoSyncMinutes), 1), 1440)
              : DEFAULT_GITHUB_CONFIG.autoSyncMinutes,
        }
      : null,
  }
}
