import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AssetIndex, DocIndex, GitHubConfig, LastCommit, SyncLogLine, SyncPlanItem, SyncRun,
} from '../types'
import { applyPlan, buildPlan, localShas, scanRemote } from '../lib/github/sync'
import { vaultKeyFor } from '../lib/vaultKey'
import {
  appendSyncRun,
  clearSyncHistory,
  loadSyncHistory,
  loadGitHubConfig,
  loadLastCommit,
  loadLastSyncAt,
  loadSyncState,
  saveGitHubConfig,
  saveLastCommit,
  saveLastSyncAt,
  saveSyncState,
  syncSignature,
  hasAnyBaseline,
  migrateLegacy,
  clearGitHubConfig,
} from '../lib/store'

export const DEFAULT_GITHUB_CONFIG: GitHubConfig = {
  token: '',
  owner: '',
  repo: '',
  branch: 'main',
  basePath: '',
  conflictPolicy: 'keep-both',
  propagateDeletes: false,
  autoSync: false,
  autoSyncMinutes: 10,
}

export type SyncPhase = 'idle' | 'running' | 'done' | 'error' | 'blocked' | 'needs-confirm'

export interface SyncStatus {
  phase: SyncPhase
  message: string
  progress: { done: number; total: number } | null
}

export interface SyncReport {
  at: number
  trigger: 'manual' | 'auto'
  plan: SyncPlanItem[]
  log: SyncLogLine[]
  commitSha: string | null
  error: string | null
  /**
   * 동기화 대상이 바뀌어 아직 적용하지 않은 계획.
   * 사용자가 보고 진행 여부를 정해야 합니다.
   */
  needsConfirm?: boolean
  /** 왜 멈춰 세웠는지. 대상이 바뀐 것과 저장소를 비우는 것은 다른 이야기입니다. */
  confirmReason?: 'target' | 'wipe'
  /** 저장소에서 지우려는 건수. 비우려 할 때만 있습니다. */
  removing?: number
}

export interface GitHubSync {
  config: GitHubConfig
  loaded: boolean
  isConfigured: boolean
  status: SyncStatus
  report: SyncReport | null
  /** 지난 회차들. 새것이 앞에 옵니다. */
  history: SyncRun[]
  lastSyncAt: number | null
  /** 마지막으로 올린 커밋. 아직 아무것도 올리지 않았으면 null 입니다. */
  lastCommit: LastCommit | null
  /** 다음 자동 동기화 예정 시각. 꺼져 있으면 null. */
  nextAutoSyncAt: number | null
  update: (patch: Partial<GitHubConfig>) => void
  run: (trigger?: 'manual' | 'auto') => Promise<void>
  /** 대상이 바뀌어 멈춘 계획을 그대로 진행합니다. */
  confirmTarget: () => Promise<void>
  /** 이 폴더의 저장소 설정을 지웁니다. */
  reset: () => Promise<void>
  /** 잡아 둔 자동 차례를 버리고 지금 설정으로 처음부터 다시 셉니다. */
  restartAutoSync: () => void
  dismissReport: () => void
}

interface Options {
  root: FileSystemDirectoryHandle | null
  docs: DocIndex
  assets: AssetIndex
  /**
   * 동기화 전에 편집 중인 내용을 파일에 반영합니다.
   * 저절로 도는 회차인지 알려 줍니다. 그쪽은 타자가 멎기를 잠깐 기다릴 수 있습니다.
   */
  onBeforeSync: (trigger: 'manual' | 'auto') => Promise<void>
  /** 로컬 파일이 바뀌었을 때 볼트를 다시 읽습니다. */
  onLocalChanged: () => Promise<void>
}

const IDLE: SyncStatus = { phase: 'idle', message: '', progress: null }

/** 자동 동기화가 켜져 있을 때, 볼트를 연 직후 한 번 돌기까지 두는 여유. */

/** 저장소가 그 사이에 바뀌었을 때 다시 맞춰 볼 횟수. */
const MAX_ATTEMPTS = 3

/**
 * 브라우저 전체에서 하나만 잡을 수 있는 이름.
 * 저장소나 하위 폴더를 이름에 넣으면, 설정이 어긋난 탭끼리는 서로 다른 잠금을 잡아
 * 정작 막아야 할 상황을 못 막습니다. 그래서 일부러 고정된 이름을 씁니다.
 */
const SYNC_LOCK = 'mdwiki:github-sync'

const BUSY = Symbol('다른 탭이 동기화 중')

/**
 * 같은 볼트를 연 탭이 여럿이면 각자 자동 동기화를 돌려 서로의 결과를 되돌립니다.
 * 한쪽이 원격에서 지운 문서를 다른 쪽이 "사라졌네" 하며 복원하는 식입니다.
 * Web Locks 로 브라우저 전체에서 한 번에 하나만 돌게 막습니다.
 */
async function runExclusively<T>(task: () => Promise<T>): Promise<T | typeof BUSY> {
  const manager = navigator.locks
  if (!manager) return task()

  return manager.request(SYNC_LOCK, { ifAvailable: true }, async (lock) => {
    // 이미 다른 탭이 잡고 있으면 기다리지 않고 이번 회차를 건너뜁니다.
    if (!lock) return BUSY
    return task()
  })
}

export function useGitHubSync({ root, docs, assets, onBeforeSync, onLocalChanged }: Options): GitHubSync {
  const [config, setConfig] = useState<GitHubConfig>(DEFAULT_GITHUB_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<SyncStatus>(IDLE)
  const [report, setReport] = useState<SyncReport | null>(null)
  const [history, setHistory] = useState<SyncRun[]>([])
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [lastCommit, setLastCommit] = useState<LastCommit | null>(null)
  const [nextAutoSyncAt, setNextAutoSyncAt] = useState<number | null>(null)
  // 지금 열려 있는 폴더의 표. 설정과 기준점을 이 표 아래에 둡니다.
  const [vaultKey, setVaultKey] = useState<string | null>(null)
  /*
   * 자동 차례를 다시 잡게 하는 표. 올리면 아래 효과가 다시 돌아, 잡아 둔 것을 버리고
   * 새로 셉니다. 설정을 통째로 갈아 끼울 때 씁니다. 켜짐 여부와 간격이 그대로면
   * 효과가 다시 돌지 않아 앞서 세던 시간이 그대로 이어지기 때문입니다.
   */
  const [scheduleEpoch, setScheduleEpoch] = useState(0)

  // 타이머에서 부를 때 오래된 값을 붙잡지 않도록 최신 상태를 ref 로도 들고 있습니다.
  // 설정만은 실행 직전에 저장소에서 다시 읽으므로 여기 두지 않습니다.
  const rootRef = useRef(root)
  const docsRef = useRef(docs)
  const assetsRef = useRef(assets)
  const busyRef = useRef(false)
  // 자동 동기화가 켜져 있는 동안, 다음 차례를 처음부터 다시 세게 하는 손잡이입니다.
  const restartCountdownRef = useRef<(() => void) | null>(null)
  const pendingSaveRef = useRef<Promise<void>>(Promise.resolve())
  const vaultKeyRef = useRef<string | null>(null)
  // 사용자가 "이 대상으로 진행" 을 누른 서명. 한 번 확인하면 다시 묻지 않습니다.
  const confirmedRef = useRef<string | null>(null)
  const callbacksRef = useRef({ onBeforeSync, onLocalChanged })

  // ref 쓰기는 렌더가 아니라 커밋 뒤에 해야 합니다.
  // 의존성 배열이 없으므로 렌더할 때마다 최신 값으로 갱신됩니다.
  useEffect(() => {
    rootRef.current = root
    docsRef.current = docs
    assetsRef.current = assets
    callbacksRef.current = { onBeforeSync, onLocalChanged }
  })

  /*
   * 폴더가 바뀌면 설정을 그 폴더 것으로 갈아 끼웁니다.
   *
   * 예전에는 설정이 한 벌뿐이라, A 폴더에 맞춰 둔 저장소 설정을 B 폴더가 그대로
   * 물려받았습니다. 그 상태로 동기화하면 A 의 파일들이 B 에 없으니 "지워졌다" 로
   * 읽혀 저장소에서 사라집니다. 처음 보는 폴더는 빈 설정으로 시작해야 합니다.
   */
  useEffect(() => {
    let cancelled = false

    void (async () => {
      vaultKeyRef.current = null
      confirmedRef.current = null

      if (!root) {
        if (cancelled) return
        setVaultKey(null)
        setConfig(DEFAULT_GITHUB_CONFIG)
        setHistory([])
        setLastSyncAt(null)
        setLastCommit(null)
        setLoaded(false)
        return
      }

      // 옛 한 벌짜리 값이 남아 있으면 먼저 제 주인에게 옮겨 둡니다.
      await migrateLegacy()
      const key = await vaultKeyFor(root)
      if (!key) {
        // 어느 폴더인지 가려내지 못했습니다. 남의 설정을 끌어다 쓰느니 빈 채로 둡니다.
        if (cancelled) return
        setVaultKey(null)
        setConfig(DEFAULT_GITHUB_CONFIG)
        setHistory([])
        setLastSyncAt(null)
        setLastCommit(null)
        setLoaded(false)
        return
      }

      const saved = await loadGitHubConfig(key)
      const at = await loadLastSyncAt(key)
      const commit = await loadLastCommit(key)
      const past = await loadSyncHistory(key)
      if (cancelled) return

      vaultKeyRef.current = key
      setVaultKey(key)
      setConfig({ ...DEFAULT_GITHUB_CONFIG, ...saved })
      setHistory(past)
      setLastSyncAt(at ?? null)
      setLastCommit(commit ?? null)
      setLoaded(true)
    })()

    return () => {
      cancelled = true
    }
  }, [root])

  const update = useCallback((patch: Partial<GitHubConfig>) => {
    setConfig((previous) => ({ ...previous, ...patch }))
  }, [])

  // 저장은 상태 갱신 함수 안이 아니라 여기서 합니다.
  // 실행 직전에 저장이 끝났는지 기다릴 수 있도록 마지막 저장을 붙잡아 둡니다.
  useEffect(() => {
    if (!loaded || !vaultKey) return
    pendingSaveRef.current = saveGitHubConfig(vaultKey, config)
  }, [config, loaded, vaultKey])

  /**
   * 한 회차를 마무리합니다. 화면에 결과를 띄우고 지난 기록에도 남깁니다.
   *
   * 두 자리를 따로 부르면 언젠가 한쪽을 빠뜨립니다. 확인을 기다리는 회차는
   * 아직 아무 일도 벌어지지 않았으니 이리로 오지 않습니다. 기록에 실패하더라도
   * 동기화 자체는 이미 끝난 일이므로 흐름을 끊지 않습니다.
   *
   * **상태 글귀를 먼저 세워 두고 부릅니다.** 화면은 결과가 바뀌는 것을 신호로
   * 삼아 알림을 띄우는데, 여기서 기다리는 사이에 그 신호가 먼저 나가면
   * 알림에 앞 단계의 글귀("비교하는 중…")가 실립니다.
   */
  const finish = useCallback(async (key: string, run: SyncReport) => {
    setReport(run)
    try {
      setHistory(await appendSyncRun(key, {
        at: run.at,
        trigger: run.trigger,
        commitSha: run.commitSha,
        error: run.error,
        log: run.log,
      }))
    } catch {
      // 자취를 못 남겨도 이번 회차의 결과는 화면에 그대로 있습니다.
    }
  }, [])

  /**
   * 한 번의 비교와 적용. 저장소가 그 사이에 바뀌어 커밋이 거부되면 true 를 돌려주고,
   * 그러면 바깥에서 다시 읽어 처음부터 세웁니다.
   */
  const attemptSync = useCallback(
    async (
      current: GitHubConfig,
      vault: FileSystemDirectoryHandle,
      key: string,
      trigger: 'manual' | 'auto',
      attempt: number,
    ): Promise<boolean> => {
      try {
        // 편집 중이던 내용이 아직 파일에 없으면 그대로 덮어써질 수 있습니다.
        await callbacksRef.current.onBeforeSync(trigger)

        const remote = await scanRemote(current)
        if (remote.truncated) {
          throw new Error('저장소가 너무 커서 파일 목록을 다 받지 못했습니다. 하위 폴더를 지정해 범위를 좁혀 주세요.')
        }

        // 기준점은 이 저장소·브랜치·하위 폴더 조합의 것만 씁니다.
        const signature = syncSignature(current)
        const synced = await loadSyncState(key, signature)
        const local = await localShas(vault, docsRef.current, assetsRef.current, key)
        const plan = buildPlan(local, remote.files, synced, current)
        const pending = plan.filter((item) => item.action !== 'skip')
        const at = Date.now()

        /*
         * 저장소를 크게 비우는 회차는 손을 멈추고 묻습니다.
         *
         * 어떤 까닭으로든 기준점이 실제와 어긋나면 저장소에 있던 것이 통째로
         * "로컬에서 지워졌다" 로 읽힙니다. 그 회차는 되돌리기 어렵습니다.
         * 몇 개를 지우는 평범한 회차는 그대로 두고, 절반 넘게 걷어내는 회차만 세웁니다.
         */
        const removing = plan.filter((item) => item.action === 'delete-remote').length
        const wipesRepo = remote.files.size >= 2 && removing * 2 >= remote.files.size

        // 저장소·브랜치·하위 폴더를 바꾸면 문서가 올라갈 경로가 통째로 달라집니다.
        // 그대로 밀면 옛 경로와 새 경로에 같은 문서가 복제되므로,
        // 처음 보는 대상이면 무엇이 오갈지 보여 주고 확인을 받습니다.
        const changedTarget = Object.keys(synced).length === 0 && (await hasAnyBaseline(key))

        if (pending.length > 0 && confirmedRef.current !== signature && (changedTarget || wipesRepo)) {
          setReport({
            at, trigger, plan, log: [], commitSha: null, error: null, needsConfirm: true,
            confirmReason: wipesRepo ? 'wipe' : 'target',
            removing,
          })
          setStatus({
            phase: 'needs-confirm',
            message: wipesRepo
              ? `저장소에서 ${removing}건을 지우려 합니다. 무엇이 오갈지 확인해 주세요.`
              : '동기화 대상이 바뀌었습니다. 무엇이 오갈지 확인해 주세요.',
            progress: null,
          })
          return false
        }

        if (pending.length === 0) {
          await saveSyncState(key, signature, synced)
          await saveLastSyncAt(key, at)
          setLastSyncAt(at)
          setStatus({ phase: 'done', message: '이미 저장소와 같습니다', progress: null })
          await finish(key, { at, trigger, plan, log: [], commitSha: null, error: null })
          return false
        }

        setStatus({ phase: 'running', message: '동기화하는 중…', progress: { done: 0, total: pending.length } })

        const result = await applyPlan({
          root: vault,
          config: current,
          plan,
          remote,
          synced,
          onProgress: (done, total) => setStatus((previous) => ({ ...previous, progress: { done, total } })),
        })

        await saveSyncState(key, signature, result.synced)
        if (result.localChanged) await callbacksRef.current.onLocalChanged()

        // 커밋이 거부됐을 뿐이라면 결과를 남기지 않고 다시 시도합니다.
        if (result.staleRemote && attempt < MAX_ATTEMPTS) return true

        await saveLastSyncAt(key, at)
        setLastSyncAt(at)

        // 올릴 것이 없었으면 커밋도 없습니다. 그때는 지난 커밋을 그대로 둡니다.
        if (result.commitSha) {
          const commit = { sha: result.commitSha, at }
          await saveLastCommit(key, commit)
          setLastCommit(commit)
        }

        const failures = result.log.filter((line) => line.status === 'error')
        setStatus({
          phase: failures.length > 0 ? 'error' : 'done',
          message: failures.length > 0 ? `${failures.length}건 실패` : summarize(result.log),
          progress: null,
        })
        await finish(key, {
          at, trigger, plan, log: result.log, commitSha: result.commitSha, error: null,
        })
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        setStatus({ phase: 'error', message, progress: null })
        await finish(key, {
          at: Date.now(), trigger, plan: [], log: [], commitSha: null, error: message,
        })
      }
      return false
    },
    [finish],
  )

  const run = useCallback(async (trigger: 'manual' | 'auto' = 'manual') => {
    const vault = rootRef.current
    if (busyRef.current || !vault) return

    // 중복 실행 막기와 진행 표시를 먼저 겁니다.
    // 설정을 읽는 동안 버튼이 열려 있으면 같은 탭에서 두 번 눌릴 수 있습니다.
    busyRef.current = true
    setStatus({ phase: 'running', message: '설정을 확인하는 중…', progress: null })

    /*
     * 시작 시점의 손잡이를 적어 둡니다. 도는 동안 자동 동기화가 새로 켜지면
     * (다른 탭에서 켠 설정을 이 동기화가 읽어 오는 경우가 그렇습니다)
     * 그쪽이 곧바로 첫 회차를 잡아 둡니다. 끝나면서 우리가 되돌려 놓으면
     * 그 첫 회차를 지우고 간격만큼 미뤄 버립니다.
     */
    const countdownAtStart = restartCountdownRef.current

    try {
      // 설정은 메모리가 아니라 저장소에서 다시 읽습니다.
      // 다른 탭에서 바꾼 값이 이 탭 메모리에는 남아 있지 않아,
      // 굳은 옛 설정으로 돌면 한쪽이 지운 문서를 다른 쪽이 되살립니다.
      await pendingSaveRef.current
      // 표가 아직 없으면 폴더를 여는 중입니다. 그때는 돌 것이 없습니다.
      const key = vaultKeyRef.current
      if (!key) {
        setStatus(IDLE)
        return
      }

      const current = { ...DEFAULT_GITHUB_CONFIG, ...(await loadGitHubConfig(key)) }
      setConfig(current)

      if (!isReady(current)) {
        setStatus(IDLE)
        return
      }

      setStatus({ phase: 'running', message: '변경 사항을 비교하는 중…', progress: null })

      const outcome = await runExclusively(async () => {
        // 우리가 저장소를 읽은 뒤 다른 쪽이 먼저 올리면 커밋이 거부됩니다.
        // 잘못된 게 아니라 기준이 낡은 것뿐이라, 다시 읽고 다시 세워 시도합니다.
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          const again = await attemptSync(current, vault, key, trigger, attempt)
          if (!again) return
          setStatus({
            phase: 'running',
            message: '저장소가 그 사이에 바뀌었습니다. 다시 맞추는 중…',
            progress: null,
          })
          // 정말로 다른 쪽이 쓰는 중이라면 조금 쉬었다 가는 편이 낫습니다.
          await new Promise((done) => setTimeout(done, 400 * attempt))
        }
      })

      if (outcome === BUSY) {
        // 자동 회차는 조용히 건너뜁니다. 직접 누른 경우에만 왜 안 됐는지 알려 줍니다.
        // 실패가 아니라 '지금은 못 돈다' 이므로 오류와 구분되는 상태로 둡니다.
        setStatus(
          trigger === 'manual'
            ? { phase: 'blocked', message: '다른 탭에서 동기화 중입니다. 끝난 뒤 다시 눌러 주세요.', progress: null }
            : IDLE,
        )
      }
    } finally {
      busyRef.current = false
      // 직접 눌러 돌렸어도 다음 자동 차례는 간격만큼 처음부터 다시 셉니다.
      // 방금 맞춰 놓고 몇십 초 뒤에 또 도는 것은 의미가 없습니다.
      if (restartCountdownRef.current === countdownAtStart) restartCountdownRef.current?.()
    }
  }, [attemptSync])

  /** 이 폴더의 저장소 설정을 지웁니다. 토큰까지 함께 지웁니다. */
  const reset = useCallback(async () => {
    const key = vaultKeyRef.current
    if (!key) return
    // 방금까지의 저장이 끝난 뒤에 지워야 지운 것이 되살아나지 않습니다.
    await pendingSaveRef.current
    await clearGitHubConfig(key)
    // 자취는 그 저장소와 주고받은 기록입니다. 설정을 지우면 함께 지웁니다.
    await clearSyncHistory(key)
    confirmedRef.current = null
    setConfig(DEFAULT_GITHUB_CONFIG)
    setHistory([])
    setReport(null)
    setStatus(IDLE)
  }, [])

  const restartAutoSync = useCallback(() => setScheduleEpoch((epoch) => epoch + 1), [])

  const confirmTarget = useCallback(async () => {
    const key = vaultKeyRef.current
    if (!key) return
    const current = { ...DEFAULT_GITHUB_CONFIG, ...(await loadGitHubConfig(key)) }
    confirmedRef.current = syncSignature(current)
    setReport(null)
    await run('manual')
  }, [run])

  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  }, [run])

  const isConfigured = isReady(config)
  const autoOn = loaded && config.autoSync && isConfigured && root !== null

  /**
   * 켜져 있으면 정해진 간격마다 돕니다.
   *
   * setInterval 대신 한 번 돌 때마다 다시 잡습니다.
   * 그래야 동기화에 걸린 시간과 무관하게 다음 예정 시각이 정확해지고,
   * 그 값을 화면에 남은 시간으로 보여 줄 수 있습니다.
   *
   * 폴더가 바뀌면 셈도 처음부터 다시 시작합니다. 폴더마다 맞춰 둔 저장소가
   * 다른데, 앞 폴더에서 세던 시간을 그대로 이어 가면 남은 시간이 지금 폴더와
   * 아무 상관 없는 값이 됩니다.
   */
  useEffect(() => {
    if (!autoOn || !vaultKey) return

    const minutes = Math.min(Math.max(config.autoSyncMinutes, 1), 1440)
    let timer = 0
    let cancelled = false

    // 이미 잡아 둔 차례가 있으면 버리고 새로 잡습니다. 두 번 겹쳐 돌지 않습니다.
    const schedule = (delay: number) => {
      window.clearTimeout(timer)
      setNextAutoSyncAt(Date.now() + delay)
      timer = window.setTimeout(() => {
        void (async () => {
          await runRef.current('auto')
          if (!cancelled) schedule(minutes * 60_000)
        })()
      }, delay)
    }

    restartCountdownRef.current = () => {
      if (!cancelled) schedule(minutes * 60_000)
    }
    // 새로 시작할 때도 정해진 간격을 그대로 씁니다. 화면에 뜬 남은 시간이 곧 예정 시각입니다.
    schedule(minutes * 60_000)

    return () => {
      cancelled = true
      restartCountdownRef.current = null
      window.clearTimeout(timer)
      setNextAutoSyncAt(null)
    }
  }, [autoOn, config.autoSyncMinutes, vaultKey, scheduleEpoch])

  const dismissReport = useCallback(() => setReport(null), [])

  return {
    config, loaded, isConfigured, status, report, history, lastSyncAt, lastCommit,
    // 꺼져 있으면 예정 시각도 없는 것으로 봅니다. 상태가 남아 있어도 화면에는 안 나옵니다.
    nextAutoSyncAt: autoOn ? nextAutoSyncAt : null,
    update, run, confirmTarget, dismissReport, reset, restartAutoSync,
  }
}

function isReady(config: GitHubConfig): boolean {
  return Boolean(config.token.trim() && config.owner.trim() && config.repo.trim() && config.branch.trim())
}

function summarize(log: SyncLogLine[]): string {
  const uploaded = log.filter((line) => line.action.startsWith('upload')).length
  const downloaded = log.filter((line) => line.action.startsWith('download')).length
  const removed = log.filter((line) => line.action.startsWith('delete')).length
  const conflicts = log.filter((line) => line.action === 'conflict').length

  const parts: string[] = []
  if (uploaded > 0) parts.push(`${uploaded}건 커밋`)
  if (downloaded > 0) parts.push(`${downloaded}건 내려받음`)
  if (removed > 0) parts.push(`${removed}건 삭제`)
  if (conflicts > 0) parts.push(`충돌 ${conflicts}건`)
  return parts.length > 0 ? parts.join(' · ') : '변경 없음'
}
