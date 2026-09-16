import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDialogs } from './components/dialogContext'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { AssetView } from './components/AssetView'
import { FolderView } from './components/FolderView'
import { InfoBar, type SelectionInfo } from './components/InfoBar'
import { SearchPanel } from './components/SearchPanel'
import { Favorites } from './components/Favorites'
import { SyncCountdown } from './components/SyncCountdown'
import { ViewModeSwitch } from './components/ViewModeSwitch'
import {
  FolderIcon, GitHubIcon, SettingsIcon, SidebarCloseIcon, SidebarOpenIcon, StarIcon, SyncIcon, XIcon,
} from './components/icons'
import { TextPreview } from './components/TextPreview'
import { SettingsPanel } from './components/SettingsPanel'
import { SplitResizer } from './components/SplitResizer'
import { BackdropSwitch } from './components/BackdropSwitch'
import { SyncReportSheet } from './components/SyncReportSheet'
import { SyncHistorySheet } from './components/SyncHistorySheet'
import { TreeView } from './components/TreeView'
import { useEdgeScroll } from './hooks/useEdgeScroll'
import { useGitHubSync } from './hooks/useGitHubSync'
import { useTextIndex } from './hooks/useTextIndex'
import { useVault } from './hooks/useVault'
import {
  ACCEPT_ATTRIBUTE, attachmentKind, formatBytes, isEditableText, isMarkdown,
  MAX_ATTACHMENT_BYTES,
} from './lib/attachments'
import { extractHeadings, parseFrontmatter, toggleTask } from './lib/markdown'
import { ExternalChangeError } from './lib/fsAccess'
import { TrashView } from './components/TrashView'
import { KeyboardIcon, TrashIcon } from './components/icons'
import { ShortcutsPopover } from './components/ShortcutsPopover'
import { matches, SHORTCUTS } from './lib/shortcuts'
import { readTrashPolicy } from './lib/saveOptions'
import type { TrashItem } from './lib/trash'
import { entryKind, readFile } from './lib/fsAccess'
import { DEFAULT_VIEW_MODE, loadSession, saveSession } from './lib/session'
import { formatTidyFor, textPreviewKind, trimWhitespace } from './lib/textPreview'
import {
  clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH, maxSidebarWidth, MIN_SIDEBAR_WIDTH,
  readImageBackdrop, readImagePreview, readOfficePreview, readSaveOptions, readSidebarOpen,
  readSidebarTab, readSidebarWidth, readSplitRatio, writeImageBackdrop, writeImagePreview,
  writeOfficePreview, writeSidebarOpen, writeSidebarTab, writeSidebarWidth, writeSplitRatio,
} from './lib/saveOptions'
import { displayPath, FAVORITES_FILE, fileNameOf, isAppFile, TRASH_DIR } from './lib/paths'
import { loadFavorites } from './lib/store'
import { favoritesFileBody, readFavoritesFile, reorderFavorites } from './lib/favorites'
import { vaultKeyFor } from './lib/vaultKey'
import type { CSSProperties } from 'react'
import type { ImageBackdrop, SidebarTab, ViewMode, VaultNode } from './types'


const AUTOSAVE_DELAY = 800

/** 옆줄의 두 탭. 접힌 옆줄의 단추도 같은 목록으로 그립니다. */
/*
 * 폴더가 앞에 섭니다. 처음 온 사람에게는 담아 둔 즐겨찾기가 없고, 기본으로 펴는 쪽도
 * 폴더입니다. 기본이 뒤에 서 있으면 고른 탭과 서 있는 자리가 어긋나 보입니다.
 */
const SIDEBAR_TABS: { id: SidebarTab; name: string; hint: string }[] = [
  { id: 'tree', name: '폴더', hint: '폴더 트리와 문서 검색을 봅니다' },
  { id: 'favorites', name: '즐겨찾기', hint: '담아 둔 문서·첨부·폴더만 봅니다' },
]

export default function App() {
  const vault = useVault()
  const dialogs = useDialogs()

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  // 폴더를 고르면 편집기 대신 폴더 정보를 보여 줍니다.
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_VIEW_MODE)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  // 즐겨찾기 탭의 찾기. 폴더 탭의 검색과는 하는 일이 달라 따로 둡니다.
  const [favoriteQuery, setFavoriteQuery] = useState('')
  // 'last' 는 지난번에 보던 자리로. 갈 곳이 정해진 부름(동기화 설정이 덜 됐을 때)만 묶음을 짚습니다.
  const [settingsTab, setSettingsTab] = useState<'general' | 'appearance' | 'sync' | 'last' | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const saveTimer = useRef<number | null>(null)
  // 자동 저장 타이머가 옛 draft 를 붙잡지 않도록 최신 값을 ref 로도 들고 있습니다.
  const draftRef = useRef('')
  /*
   * 밖에서 바뀐 파일을 두고 물었을 때 "취소" 한 글. 같은 글로는 다시 묻지 않습니다.
   * 자동 저장이 잠깐마다 돌므로, 붙들어 두지 않으면 같은 물음이 되풀이됩니다.
   */
  const heldRef = useRef<string | null>(null)
  /** 마지막으로 글자를 친 때. 저절로 도는 동기화가 타자가 멎기를 기다릴 때 봅니다. */
  const typedAtRef = useRef(0)
  const dirtyRef = useRef(false)
  /** 이번 동기화 회차 직전에 휴지통에서 비운 개수. 완료 알림에 실어 보냅니다. */
  const purgedRef = useRef(0)
  const selectedRef = useRef<string | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  useEffect(() => {
    selectedRef.current = selectedPath
  }, [selectedPath])

  // 트리 밖에 파일을 떨어뜨리면 브라우저가 그 파일로 이동해 버립니다.
  // 작업하던 화면이 통째로 날아가므로 문서 전체에서 기본 동작을 막습니다.
  useEffect(() => {
    const swallow = (event: DragEvent) => event.preventDefault()
    document.addEventListener('dragover', swallow)
    document.addEventListener('drop', swallow)
    return () => {
      document.removeEventListener('dragover', swallow)
      document.removeEventListener('drop', swallow)
    }
  }, [])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2600)
  }, [])

  const report = useCallback(
    (cause: unknown) => flash(cause instanceof Error ? cause.message : String(cause)),
    [flash],
  )

  /**
   * 편집 내용을 파일에 씁니다.
   *
   * tidy 는 이 파일에서 벗어날 때만 켭니다. 자동 저장이 돌 때마다 손을 대면
   * 글을 쓰는 도중에 내용이 바뀌어 커서가 엉뚱한 곳으로 튑니다.
   *
   * 손을 댈지 말지는 설정을 따릅니다. 둘 다 꺼져 있으면 쓴 그대로 저장합니다.
   * 저장하는 이 자리에서 곧바로 읽습니다. 설정 창에서 방금 바꾼 값이 바로 먹습니다.
   */
  const commit = useCallback(async (tidy = false, force = false) => {
    const path = selectedRef.current
    if (!path) return

    const original = draftRef.current
    // 이 글로 이미 물었고 물러섰다면, 떠나는 길이 아닌 한 다시 묻지 않습니다.
    if (!tidy && !force && heldRef.current === original) return
    let candidate = original

    if (tidy) {
      const options = readSaveOptions()
      if (options.tidyFormat) candidate = formatTidyFor(path)?.(candidate) ?? candidate
      // 정돈이 끝난 뒤에 지웁니다. 순서가 뒤바뀌면 정돈이 남긴 공백이 그대로 남습니다.
      if (options.trimWhitespace) candidate = trimWhitespace(candidate, path) ?? candidate
    }

    // 이미 그 모양이면 쓸 것이 없습니다.
    const tidied = candidate !== original ? candidate : null

    // 자동 저장이 먼저 돌아 dirty 가 내려갔더라도, 정돈할 것이 있으면 씁니다.
    if (!dirty && tidied === null) return

    const snapshot = tidied ?? original

    /*
     * 마지막으로 읽거나 쓴 시각. 쓰기 직전에 디스크와 견줘, 밖에서 고쳐졌으면 묻습니다.
     * 덮어쓰기로 답했으면(force) 견주지 않습니다.
     */
    const known = force
      ? undefined
      : (isMarkdown(path) ? vault.index.get(path) : vault.assets.get(path))?.lastModified

    try {
      // 마크다운은 문서 색인까지 갱신하고, 그 밖의 텍스트는 파일만 씁니다.
      if (isMarkdown(path)) await vault.save(path, snapshot, known)
      else await vault.saveText(path, snapshot, known)
      heldRef.current = null

      if (tidied !== null) {
        // 정돈한 내용으로 화면도 맞춥니다. 벗어나는 길이라 입력과 부딪히지 않습니다.
        draftRef.current = tidied
        setDraft(tidied)
        setDirty(false)
        return
      }

      // 저장하는 동안 더 입력했거나 다른 문서로 옮겨갔다면 dirty 를 그대로 둡니다.
      // 여기서 무조건 내려버리면 대기 중이던 자동 저장이 취소되어 그 입력이 사라집니다.
      if (draftRef.current === original && selectedRef.current === path) setDirty(false)
    } catch (cause) {
      if (!(cause instanceof ExternalChangeError)) {
        report(cause)
        return
      }

      /*
       * 밖에서 고쳐진 파일. 무엇을 잃을지 읽고 고르게 합니다.
       * 물러서면(취소·Esc) 아무것도 쓰지 않고 글은 편집기에 그대로 둡니다.
       */
      const picked = await dialogs.choose({
        title: '밖에서 바뀐 파일입니다',
        label: `"${displayPath(path)}" 이(가) 이 앱 밖에서 고쳐졌습니다(다른 편집기나 동기화 도구).\n`
          + '다시 읽으면 여기서 친 것이 사라지고, 덮어쓰면 밖에서 고친 것이 사라집니다.\n'
          + '취소하면 저장하지 않고 편집을 이어갑니다.',
        options: [
          { id: 'reload', label: '밖의 내용 다시 읽기' },
          { id: 'overwrite', label: '내 것으로 덮어쓰기', danger: true },
        ],
      })
      if (picked === 'overwrite') {
        await commitRef.current(tidy, true)
        return
      }
      if (picked === 'reload') {
        try {
          const text = await vault.reload(path)
          // 그 사이 다른 문서로 옮겨 갔으면 편집기는 건드리지 않습니다.
          if (selectedRef.current === path) {
            draftRef.current = text
            setDraft(text)
            setDirty(false)
          }
          heldRef.current = null
        } catch (inner) {
          report(inner)
        }
        return
      }
      heldRef.current = original
    }
  }, [dialogs, dirty, report, vault])

  // 저장 안에서 저장을 다시 부를 때 씁니다(덮어쓰기). 제 이름을 안에서 부를 수 없습니다.
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  }, [commit])

  const sync = useGitHubSync({
    root: vault.root,
    docs: vault.index,
    assets: vault.assets,
    /*
     * 저절로 도는 회차는 타자가 멎기를 잠깐 기다립니다.
     * 치는 도중에 돌면 반쯤 쓴 글이 커밋됩니다. 손을 뗀 지 2초가 지나야 저장하고 돌며,
     * 계속 치고 있으면 20초까지만 기다렸다가 그대로 갑니다. 마냥 미룰 수는 없습니다.
     */
    onBeforeSync: async (trigger) => {
      if (trigger === 'auto') {
        const IDLE = 2000
        const LIMIT = 20_000
        const started = Date.now()
        while (dirtyRef.current && Date.now() - typedAtRef.current < IDLE && Date.now() - started < LIMIT) {
          await new Promise((done) => window.setTimeout(done, 200))
        }
      }
      await commitRef.current()

      /*
       * 휴지통을 저절로 비우기로 했으면 여기서 합니다. 동기화가 도는 때가 곧 정리하는 때입니다.
       * 설정은 이 자리에서 곧바로 읽어, 설정 창에서 방금 바꾼 값이 바로 먹습니다.
       */
      const policy = readTrashPolicy()
      if (policy.autoPurge) {
        try {
          purgedRef.current = await vault.purgeTrashOlderThan(policy.days * 86_400_000)
        } catch (cause) {
          report(cause)
        }
      }
    },
    onLocalChanged: async () => {
      await vault.refresh()
      // 저장소에서 즐겨찾기 파일이 내려왔을 수 있습니다.
      if (vault.root) setFavorites(await loadFavoritesFor(vault.root))
    },
  })

  // 동기화가 끝나면 결과를 알려 주고, 문제가 있을 때만 자세한 창을 엽니다.
  const lastReported = useRef(0)
  useEffect(() => {
    const report = sync.report
    if (!report || report.at === lastReported.current) return
    lastReported.current = report.at

    if (report.needsConfirm || report.error || report.log.some((line) => line.status === 'error')) {
      setReportOpen(true)
      return
    }
    // 이번 회차에 휴지통을 비웠으면 그 셈도 같은 알림에 실어 보냅니다. 따로 띄우면 하나가 덮입니다.
    const purged = purgedRef.current
    purgedRef.current = 0
    flash(`동기화 완료 · ${sync.status.message}`
      + (purged > 0 ? ` · 휴지통에서 오래된 ${purged}개 비움` : ''))
  }, [sync.report, sync.status.message, flash])

  // 잠금에 막힌 건 결과가 없어 위 효과가 안 걸립니다. 따로 알려 줍니다.
  const lastBlockedAt = useRef(0)
  useEffect(() => {
    if (sync.status.phase !== 'blocked') return
    const now = Date.now()
    if (now - lastBlockedAt.current < 1000) return
    lastBlockedAt.current = now
    flash(sync.status.message)
  }, [sync.status, flash])

  const closeVault = useCallback(async () => {
    // 자동 저장이 아직 안 돌았을 수 있으므로 먼저 씁니다.
    await commit(true)

    // 닫기 전에 지금 화면 상태를 남겨 둡니다. 다음에 같은 폴더를 열면 이대로 복원됩니다.
    if (vault.root) {
      await saveSession(vault.root, {
        expanded: [...expanded], selectedPath, selectedDir, viewMode,
      })
    }
    restoredFor.current = null
    await vault.close()

    // 닫은 뒤에도 펼침과 선택이 남아 있으면 다른 폴더를 열었을 때 엉뚱한 상태로 시작합니다.
    setExpanded(new Set())
    setSelectedPath(null)
    setSelectedDir(null)
    setDraft('')
    setDirty(false)
    setViewMode(DEFAULT_VIEW_MODE)
  }, [commit, vault, expanded, selectedPath, selectedDir, viewMode])

  const startSync = useCallback(() => {
    // 설정이 덜 됐으면 실행 대신 설정 창을 열어 줍니다.
    if (!sync.isConfigured) {
      setSettingsTab('sync')
      return
    }
    void sync.run('manual')
  }, [sync])

  const openAsset = useCallback(
    async (path: string) => {
      // 이미 보고 있는 파일을 다시 고르면 아무것도 하지 않습니다.
      // 그러지 않으면 누를 때마다 정돈이 걸려, 열기만 해도 파일이 바뀝니다.
      if (path === selectedRef.current) return
      await commit(true)

      // 글자로 된 첨부는 편집기에서 바로 고칠 수 있게 내용을 읽어 둡니다.
      // 화면을 먼저 바꾸고 나중에 채우면, 그 틈에 친 글자가 덮여 사라집니다.
      let content = ''
      if (isEditableText(path) && vault.root) {
        try {
          content = await readFile(vault.root, path)
        } catch (cause) {
          report(cause)
        }
      }

      setSelectedDir(null)
      setSelectedPath(path)
      setDraft(content)
      setDirty(false)
    },
    [commit, report, vault.root],
  )

  // 편집이 멈추면 잠시 뒤 자동 저장합니다.
  useEffect(() => {
    if (!dirty) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void commit(), AUTOSAVE_DELAY)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [draft, dirty, commit])

  const openDoc = useCallback(
    async (path: string) => {
      if (path === selectedRef.current) return
      await commit(true)
      const entry = vault.index.get(path)
      setSelectedDir(null)
      setSelectedPath(path)
      setDraft(entry?.content ?? '')
      setDirty(false)
      // 열린 문서까지의 폴더를 모두 펼쳐 트리에서 위치가 보이게 합니다.
      setExpanded((previous) => {
        const next = new Set(previous)
        const segments = path.split('/')
        for (let depth = 1; depth < segments.length; depth += 1) {
          next.add(segments.slice(0, depth).join('/'))
        }
        return next
      })
    },
    [commit, vault.index],
  )

  /*
   * 동기화 결과에서 파일 이름을 눌렀을 때.
   *
   * 겹쳐 뜬 창을 모두 걷습니다. 한 겹만 걷으면 방금 연 문서가 그 뒤에 가려,
   * 눌렀는데 아무 일도 없는 것처럼 보입니다.
   * 그 사이에 사라진 파일이면 창을 그대로 두고 알리기만 합니다.
   */
  const closeSheets = useCallback(() => {
    setHistoryOpen(false)
    setReportOpen(false)
    setSettingsTab(null)
  }, [])

  const openFromSync = useCallback((path: string) => {
    const isDoc = vault.index.has(path)
    if (!isDoc && !vault.assets.has(path)) {
      flash('그 파일은 이제 이 폴더에 없습니다')
      return
    }
    closeSheets()
    void (isDoc ? openDoc(path) : openAsset(path))
  }, [closeSheets, flash, openAsset, openDoc, vault.assets, vault.index])

  /*
   * 경로 가운데 폴더 이름을 눌렀을 때. 지운 줄에서도 담고 있던 폴더로는 갈 수 있습니다.
   * 여는 방식은 트리에서 폴더를 고를 때와 같고, 트리에서도 보이도록 위쪽을 펴 둡니다.
   */
  const openDirFromSync = useCallback((path: string) => {
    if (!vault.tree || !findNode(vault.tree, path)) {
      flash('그 폴더는 이제 여기에 없습니다')
      return
    }
    closeSheets()
    setSelectedDir(path)
    setSelectedPath(null)
    setExpanded((previous) => {
      const next = new Set(previous)
      const segments = path.split('/')
      for (let depth = 1; depth <= segments.length; depth += 1) {
        next.add(segments.slice(0, depth).join('/'))
      }
      return next
    })
  }, [closeSheets, flash, vault.tree])

  // 볼트를 다시 스캔한 뒤에도 열려 있던 문서의 내용을 최신으로 맞춥니다.
  useEffect(() => {
    if (!selectedPath) return
    const entry = vault.index.get(selectedPath)
    if (!entry) {
      // 첨부는 문서 인덱스에 없습니다. 파일 자체가 사라졌을 때만 선택을 놓습니다.
      if (!vault.assets.has(selectedPath)) {
        setSelectedPath(null)
        setDraft('')
        setDirty(false)
      }
      return
    }
    if (!dirty && entry.content !== draftRef.current) setDraft(entry.content)
    // dirty 를 의존성에 넣으면 편집 중에 되돌려버리므로 제외합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.index, vault.assets, selectedPath])

  /*
   * 같은 폴더를 다시 열면 지난번 화면 상태로 되돌립니다.
   * 폴더마다 한 번씩만 복원하고, 그 뒤의 변경은 사용자의 조작으로 봅니다.
   *
   * 색인과 여는 절차는 의존성에 두지 않고 ref 로 봅니다. 둘은 렌더마다 새것이 되는데,
   * 그때마다 이 효과가 다시 돌면 앞서 시작한 복원이 취소되고, 다시 돈 쪽은 아래
   * 표에 걸려 그대로 물러납니다. 그러면 복원이 통째로 사라집니다.
   * 실제로 폴더를 다시 열 때 열에 넷쯤은 지난 화면이 돌아오지 않았습니다.
   */
  const restoredFor = useRef<FileSystemDirectoryHandle | null>(null)
  const latest = useRef({ vault, openAsset })
  useEffect(() => {
    latest.current = { vault, openAsset }
  })

  useEffect(() => {
    const root = vault.root
    if (vault.status !== 'ready' || !root || restoredFor.current === root) return
    restoredFor.current = root

    let cancelled = false
    void (async () => {
      const saved = await loadSession(root)
      if (!saved || cancelled) return

      setExpanded(new Set(saved.expanded))
      setViewMode(saved.viewMode)

      if (saved.selectedDir !== null) {
        setSelectedDir(saved.selectedDir)
        return
      }
      // 지난번에 보던 문서가 아직 있을 때만 엽니다.
      const path = saved.selectedPath
      if (!path) return

      const { vault: now, openAsset: open } = latest.current
      if (now.index.has(path)) {
        setSelectedPath(path)
        setDraft(now.index.get(path)?.content ?? '')
        setDirty(false)
        return
      }
      // 첨부는 문서 색인에 없으므로 여는 절차를 그대로 씁니다.
      if (now.assets.has(path)) await open(path)
    })()

    return () => {
      cancelled = true
    }
  }, [vault.status, vault.root])

  // 펼친 폴더와 고른 항목이 바뀔 때마다 기억해 둡니다.
  // 사용자가 클릭할 때만 일어나는 변화라 그때그때 써도 부담이 없습니다.
  useEffect(() => {
    const root = vault.root
    if (vault.status !== 'ready' || !root || restoredFor.current !== root) return
    void saveSession(root, { expanded: [...expanded], selectedPath, selectedDir, viewMode })
  }, [vault.status, vault.root, expanded, selectedPath, selectedDir, viewMode])

  const toggleFolder = useCallback((path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  // 파일 고르기 창을 어디서 열었는지 기억해 둡니다. 창은 하나를 돌려 씁니다.
  const pickerDir = useRef<string | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen)

  /** 화면과 저장을 한 자리에서 맞춥니다. 설정을 들여올 때도 이 길로 들어옵니다. */
  const applySidebarOpen = useCallback((open: boolean) => {
    setSidebarOpen(open)
    writeSidebarOpen(open)
  }, [])

  /*
   * 고른 이미지를 그려 볼지. 설정 창이 아니라 여기서 들고 있습니다.
   * 켜고 끄는 곳은 설정이지만 그림을 그리는 곳은 본문이라, 한쪽만 알면 창을 닫기
   * 전까지 화면이 따라오지 않습니다.
   */
  const [imagePreview, setImagePreview] = useState(readImagePreview)

  const applyImagePreview = useCallback((on: boolean) => {
    setImagePreview(on)
    writeImagePreview(on)
  }, [])

  /*
   * 그림 뒤에 깔 바탕. 고르는 곳은 그림 위지만 설정 꾸러미에도 실리므로
   * 이미지 미리보기와 같은 자리에서 들고 있습니다.
   */
  const [imageBackdrop, setImageBackdrop] = useState<ImageBackdrop>(readImageBackdrop)

  const applyImageBackdrop = useCallback((next: ImageBackdrop) => {
    setImageBackdrop(next)
    writeImageBackdrop(next)
  }, [])

  /*
   * 워드·엑셀을 그려 볼지. 읽는 벌이 커서 열 때마다 내려받는 것이 달갑지 않을 수 있습니다.
   * 이미지 미리보기와 같은 자리에서 들고 있습니다.
   */
  const [officePreview, setOfficePreview] = useState(readOfficePreview)

  const applyOfficePreview = useCallback((on: boolean) => {
    setOfficePreview(on)
    writeOfficePreview(on)
  }, [])

  /*
   * 나란히 볼 때 원문이 차지하는 몫. 그리는 자리가 두 군데(마크다운·글 첨부)라
   * 여기서 한 번만 들고 양쪽에 내려보냅니다.
   */
  const [splitRatio, setSplitRatio] = useState(readSplitRatio)

  const applySplitRatio = useCallback((percent: number) => {
    setSplitRatio(percent)
    writeSplitRatio(percent)
  }, [])

  /*
   * 즐겨찾기. 폴더마다 따로 두므로 폴더가 바뀌면 다시 읽어 옵니다.
   * 표를 못 얻으면(폴더를 가려낼 수 없으면) 담아 두지 않습니다.
   * 남의 폴더 즐겨찾기를 여기에 붙여 봐야 가리키는 곳이 없습니다.
   */
  const [favorites, setFavorites] = useState<string[]>([])

  /*
   * 즐겨찾기는 폴더 안 파일에 적어 둡니다. 그래야 동기화를 타고 다른 기기로도 갑니다.
   * 폴더별로 갈리는 것은 그대로입니다. 파일이 그 폴더 안에 있으니까요.
   */
  const loadFavoritesFor = useCallback(async (root: FileSystemDirectoryHandle) => {
    const fromFile = await readFavoritesFile(root)
    if (fromFile) return fromFile

    // 파일이 아직 없으면, 브라우저에만 두던 시절의 것을 한 번 넘겨받습니다.
    const key = await vaultKeyFor(root)
    return key ? await loadFavorites(key) : []
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!vault.root) {
        if (!cancelled) setFavorites([])
        return
      }
      const saved = await loadFavoritesFor(vault.root)
      if (!cancelled) setFavorites(saved)
    })()
    return () => {
      cancelled = true
    }
  }, [vault.root, loadFavoritesFor])

  /** 화면과 파일을 한 자리에서 맞춥니다. 이름을 바꾸거나 옮길 때도 이 길로 들어옵니다. */
  const applyFavorites = useCallback((next: string[]) => {
    setFavorites(next)
    void vault.saveText(FAVORITES_FILE, favoritesFileBody(next)).catch(report)
  }, [report, vault])

  const toggleFavorite = useCallback((path: string) => {
    setFavorites((previous) => {
      const next = previous.includes(path)
        ? previous.filter((one) => one !== path)
        : [...previous, path]
      void vault.saveText(FAVORITES_FILE, favoritesFileBody(next)).catch(report)
      return next
    })
  }, [report, vault])

  /*
   * 옆줄에 즐겨찾기와 폴더 중 어느 쪽을 펴 두었는지.
   * 한 번에 하나만 보이므로, 접힌 옆줄의 단추로 탭을 고르면 펴면서 그 탭으로 갑니다.
   */
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(readSidebarTab)

  /*
   * 검색 재료. 텍스트 첨부 본문은 검색을 시작할 때 읽어 옵니다.
   * 마크다운과 달리 폴더를 열 때 미리 읽어 두면 여는 일이 느려집니다.
   */
  const { texts, loading: textsLoading } = useTextIndex(
    vault.root, vault.assets, query.trim().length > 0,
  )
  const searchSource = useMemo(
    () => ({ docs: vault.index, texts, tree: vault.tree }),
    [vault.index, texts, vault.tree],
  )

  const applySidebarTab = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab)
    writeSidebarTab(tab)
  }, [])

  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const dragging = useRef(false)

  /*
   * 끄는 동안에는 화면만 바꾸고, 손을 뗄 때 한 번 저장합니다.
   * 움직일 때마다 저장하면 한 번 끄는 사이에 수백 번을 쓰게 됩니다.
   */
  const applySidebarWidth = useCallback((width: number, save = true) => {
    const next = clampSidebarWidth(width)
    setSidebarWidth(next)
    if (save) writeSidebarWidth(next)
  }, [])

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragging.current = true
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    // 끄는 동안 글자가 딸려 잡히지 않게 합니다.
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [])

  const moveResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    // 옆줄 왼쪽 끝에서 지금 손가락까지가 곧 너비입니다.
    const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0
    applySidebarWidth(event.clientX - left, false)
  }, [applySidebarWidth])

  const endResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    writeSidebarWidth(sidebarWidth)
  }, [sidebarWidth])
  const currentDir = selectedDir ?? (selectedPath ? selectedPath.split('/').slice(0, -1).join('/') : '')

  const filePicker = useRef<HTMLInputElement>(null)

  /*
   * 옆줄의 굴림 칸. 끌고 가다 위아래 끝에 닿으면 저절로 굴러갑니다.
   * 트리와 즐겨찾기가 같은 칸을 쓰므로 여기 한 번만 걸어 둡니다.
   */
  const sidebarScroll = useEdgeScroll()

  const handleAddFiles = useCallback(
    async (files: File[], targetDir?: string) => {
      if (files.length === 0) return
      const dir = targetDir ?? currentDir
      try {
        const result = await vault.addFiles(dir, files)

        const parts: string[] = []
        if (result.added.length > 0) parts.push(`${result.added.length}개 추가`)
        if (result.rejected.length > 0) parts.push(`${result.rejected.length}개는 지원하지 않는 형식`)
        if (result.tooBig.length > 0) {
          parts.push(`${result.tooBig.length}개는 ${formatBytes(MAX_ATTACHMENT_BYTES)} 초과로 동기화 제외`)
        }
        flash(parts.join(' · ') || '추가한 파일이 없습니다')

        // 방금 넣은 파일을 바로 보여 줍니다.
        // 다만 폴더를 보고 있었다면 그대로 둡니다. 이어서 더 넣을 수 있게.
        // 여는 방식은 트리에서 고를 때와 같아야 합니다. 직접 상태를 만지면
        // 글자로 된 첨부의 내용을 못 읽어, 편집기가 빈 채로 열리고 고치는 순간 잘려 나갑니다.
        const first = result.added[0]
        if (first && selectedDir === null) {
          await (isMarkdown(first) ? openDoc(first) : openAsset(first))
        }
      } catch (cause) {
        report(cause)
      }
    },
    [currentDir, flash, openAsset, openDoc, report, selectedDir, vault],
  )


  // 문서 맨 앞 `---` 블록은 메타데이터로 떼어내고 본문만 렌더합니다.
  const selection = useMemo<SelectionInfo | null>(() => {
    // 휴지통은 폴더 트리 밖의 자리라 크기·시각을 셀 나무가 없습니다. 제 화면이 머리를 답니다.
    if (selectedDir === TRASH_DIR) return null
    if (selectedDir !== null && vault.tree) {
      const node = findNode(vault.tree, selectedDir)
      const rolled = node ? rollUp(node) : { size: 0, items: 0, lastModified: null }
      return {
        kind: 'dir',
        path: selectedDir,
        name: selectedDir.split('/').pop() || vault.vaultName,
        size: rolled.size,
        itemCount: rolled.items,
        lastModified: rolled.lastModified,
      }
    }

    if (!selectedPath) return null

    const doc = vault.index.get(selectedPath)
    if (doc) {
      return {
        kind: 'markdown',
        path: selectedPath,
        name: selectedPath.split('/').pop() ?? selectedPath,
        size: new TextEncoder().encode(doc.content).length,
        lastModified: doc.lastModified,
      }
    }

    const asset = vault.assets.get(selectedPath)
    if (asset) {
      return {
        kind: attachmentKind(selectedPath) === 'image' ? 'image' : 'document',
        path: selectedPath,
        name: selectedPath.split('/').pop() ?? selectedPath,
        size: asset.size,
        lastModified: asset.lastModified,
      }
    }
    return null
  }, [selectedDir, selectedPath, vault.index, vault.assets, vault.tree, vault.vaultName])

  // 마크다운은 아니지만 글자로 되어 있어 고쳐 쓸 수 있는 첨부인지.
  const editableText =
    selection !== null && selection.kind !== 'dir' && isEditableText(selection.path)
  // 표나 코드처럼 그려서 보여 줄 것이 있는 형식인지.
  const textPreview = editableText && selection ? textPreviewKind(selection.path) : null

  const { fields, body } = useMemo(() => parseFrontmatter(draft), [draft])
  /*
   * 제목의 글자 자리는 편집기에 든 글(draft)을 기준으로 맞춰 둡니다.
   *
   * 제목은 앞머리(frontmatter)를 뗀 본문에서 뽑습니다. 앞머리 안의 `# 메모` 같은
   * 주석 줄까지 제목으로 셀 수는 없기 때문입니다. 그런데 편집기에는 앞머리도
   * 들어 있어, 뗀 만큼 자리를 밀어 주지 않으면 엉뚱한 줄로 뛰어갑니다.
   */
  const headings = useMemo(() => {
    const ahead = draft.length - body.length
    return extractHeadings(body).map((one) => ({ ...one, offset: one.offset + ahead }))
  }, [draft, body])

  /*
   * 미리보기에서 누른 할 일 네모를 원문에도 적습니다.
   *
   * 제목 자리와 같은 셈입니다. 앞머리를 뗀 본문에서 자리를 짚고, 편집기에 든 글에는
   * 앞머리가 그대로 있으므로 뗀 조각을 다시 앞에 붙여 돌려 놓습니다.
   * 저장은 늘 하던 대로 자동 저장이 이어받습니다.
   */
  const toggleTaskAt = (at: number) => {
    const next = toggleTask(body, at)
    if (next === null) return
    setDraft(draft.slice(0, draft.length - body.length) + next)
    setDirty(true)
  }

  const handleNewDoc = useCallback(
    async (dirPath: string) => {
      const name = await dialogs.prompt({
        title: '새 문서',
        label: dirPath ? `"${dirPath}" 안에 만듭니다.` : '최상위 폴더에 만듭니다.',
        defaultValue: '제목 없는 문서',
        confirmText: '만들기',
      })
      if (!name) return
      try {
        const path = await vault.createDoc(dirPath, name)
        await openDoc(path)
      } catch (cause) {
        report(cause)
      }
    },
    [dialogs, openDoc, report, vault],
  )

  /*
   * 앱 전역 단축키.
   *
   * 편집기 안의 서식 단축키(⌘B 등)는 편집기가 제 자리에서 처리하고, 여기는 어디서 눌러도
   * 같은 일을 하는 것만 봅니다. 브라우저가 먼저 가져가는 글쇠(⌘N)는 오지 않으므로
   * 목록에 사연을 적어 두었습니다.
   */
  /*
   * 자판으로 옆줄 목록에 들어올 때 잡을 줄.
   *
   * 지금 열어 둔 것이 있으면 그 줄에서 시작합니다. 맨 위(뿌리)에서 시작하면 열어 둔
   * 문서까지 한 줄씩 내려가야 해서 어색합니다. 없으면 첫 줄입니다.
   * querySelector 에 선택자를 여럿 주면 DOM 차례로 첫 것을 돌려주지 선택자 차례가
   * 아니므로, 고른 줄을 따로 먼저 찾습니다.
   */
  const listEntry = useCallback((): HTMLElement | null => {
    const inTree = sidebarTabRef.current === 'tree'
    const current = document.querySelector<HTMLElement>(
      inTree ? '.tree .tree-row.is-selected' : '.favorites-item.is-current',
    )
    if (current) return current
    return document.querySelector<HTMLElement>(
      inTree ? '.tree .tree-row:not(.tree-root), .tree .tree-root' : '.favorites-item',
    )
  }, [])
  const sidebarTabRef = useRef(sidebarTab)
  useEffect(() => {
    sidebarTabRef.current = sidebarTab
  }, [sidebarTab])

  const sidebarOpenRef = useRef(sidebarOpen)
  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen
  }, [sidebarOpen])
  const shortcutRefs = useRef({ handleNewDoc, currentDir, textPreview, hasDoc: false })
  useEffect(() => {
    shortcutRefs.current = {
      handleNewDoc, currentDir, textPreview,
      hasDoc: selectedPath !== null && (isMarkdown(selectedPath) || textPreview !== null),
    }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const hit = SHORTCUTS.find((one) => one.scope === '앱 어디서나' && matches(event, one.keys))
      // ⌘N 이 오는 브라우저에서는 그것도 새 문서입니다.
      const newDocPlain = event.key.toLowerCase() === 'n' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
      const id = hit?.id ?? (newDocPlain ? 'new-doc' : null)
      if (!id) return
      event.preventDefault()

      const { handleNewDoc: newDoc, currentDir: dir, hasDoc } = shortcutRefs.current
      switch (id) {
        case 'search':
          if (!vault.tree) return
          applySidebarOpen(true)
          // 옆줄이 접혀 있었으면 입력란이 이제야 그려집니다. 한 박자 뒤에 잡습니다.
          window.setTimeout(() => searchInput.current?.select(), 0)
          return
        case 'new-doc':
          if (vault.tree) void newDoc(dir)
          return
        case 'view-mode':
          if (!hasDoc) return
          setViewMode((mode) => (mode === 'edit' ? 'split' : mode === 'split' ? 'preview' : 'edit'))
          return
        case 'tab-tree':
        case 'tab-favorites':
          if (!vault.tree) return
          applySidebarOpen(true)
          applySidebarTab(id === 'tab-tree' ? 'tree' : 'favorites')
          // 옮겨 간 목록에 자리를 줍니다. 그래야 곧바로 화살표로 오갈 수 있습니다. 그려진 뒤에 잡습니다.
          window.setTimeout(() => {
            sidebarTabRef.current = id === 'tab-tree' ? 'tree' : 'favorites'
            ;(listEntry() ?? searchInput.current)?.focus()
          }, 0)
          return
        case 'sidebar':
          if (!vault.tree) return
          applySidebarOpen(!sidebarOpenRef.current)
          return
        case 'settings':
          setSettingsTab((open) => open ?? 'last')
          return
        case 'help':
          setShortcutsOpen((open) => !open)
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applySidebarOpen, applySidebarTab, listEntry, vault.tree])

  const handleNewFolder = useCallback(
    async (dirPath: string) => {
      const name = await dialogs.prompt({
        title: '새 폴더',
        label: dirPath ? `"${dirPath}" 안에 만듭니다.` : '최상위 폴더에 만듭니다.',
        defaultValue: '새 폴더',
        confirmText: '만들기',
      })
      if (!name) return
      try {
        await vault.createFolder(dirPath, name)
        setExpanded((previous) => new Set(previous).add(dirPath ? `${dirPath}/${name}` : name))
      } catch (cause) {
        report(cause)
      }
    },
    [dialogs, report, vault],
  )

  const handleRename = useCallback(
    async (path: string) => {
      const current = fileNameOf(path)
      const name = await dialogs.prompt({
        title: '이름 바꾸기',
        label: displayPath(path),
        defaultValue: current,
        confirmText: '바꾸기',
      })
      if (!name || name === current) return
      try {
        await commit()
        const next = await vault.rename(path, name)
        if (selectedPath === path) setSelectedPath(next)
        applyFavorites(movedFavorites(favorites, path, next))
      } catch (cause) {
        report(cause)
      }
    },
    [applyFavorites, commit, dialogs, favorites, report, selectedPath, vault],
  )

  /*
   * 지우기. 휴지통으로 옮기는 것이 먼저이고, 곧바로 없애는 길은 빨간 단추로 따로 둡니다.
   * 물러서는 길(취소·Esc)은 아무것도 하지 않습니다.
   */
  const handleDelete = useCallback(
    async (path: string) => {
      const isDoc = path.toLowerCase().endsWith('.md')
      const picked = await dialogs.choose({
        title: isDoc ? '문서를 지울까요?' : '폴더를 지울까요?',
        label: (isDoc
          ? `${displayPath(path)}\n`
          : `"${displayPath(path)}" 와 그 안의 모든 내용이 함께 갑니다.\n`)
          + '휴지통으로 옮기면 트리 맨 아래 휴지통에서 되돌릴 수 있습니다. 완전 삭제는 되돌릴 수 없습니다.',
        options: [
          { id: 'trash', label: '휴지통으로 이동' },
          { id: 'purge', label: '완전 삭제', danger: true },
        ],
      })
      if (picked === null) return
      try {
        if (picked === 'trash') {
          await vault.trashPath(path)
          flash(`휴지통으로 옮겼습니다: ${displayPath(path)}`)
        } else {
          await vault.remove(path)
        }
        // 지워진 것과 그 아래 것들을 즐겨찾기에서도 뺍니다.
        setFavorites((previous) => {
          const next = previous.filter((one) => one !== path && !one.startsWith(`${path}/`))
          if (next.length !== previous.length) {
            void vault.saveText(FAVORITES_FILE, favoritesFileBody(next)).catch(report)
          }
          return next
        })
        if (selectedPath === path || selectedPath?.startsWith(`${path}/`)) {
          setSelectedPath(null)
          setDraft('')
          setDirty(false)
        }
      } catch (cause) {
        report(cause)
      }
    },
    [dialogs, flash, report, selectedPath, vault],
  )

  /** 휴지통에서 되돌립니다. 그 자리에 다른 것이 생겼으면 덮을지 묻습니다. */
  const handleRestore = useCallback(
    async (item: TrashItem) => {
      try {
        const result = await vault.restoreTrash(item)
        if (result.ok) {
          flash(`되돌렸습니다: ${displayPath(item.path)}`)
          return
        }
        const ok = await dialogs.confirm({
          title: '같은 이름이 있습니다',
          label: `"${displayPath(item.path)}" 자리에 이미 다른 것이 있습니다.\n`
            + (item.kind === 'dir'
              ? '덮어쓰면 지금 그 자리에 있는 폴더와 그 안의 내용이 사라집니다.'
              : '덮어쓰면 지금 그 자리에 있는 파일이 사라집니다.'),
          confirmText: '덮어쓰기',
          danger: true,
        })
        if (!ok) return
        await vault.restoreTrash(item, true)
        flash(`되돌렸습니다: ${displayPath(item.path)}`)
      } catch (cause) {
        report(cause)
      }
    },
    [dialogs, flash, report, vault],
  )

  const handlePurge = useCallback(
    async (item: TrashItem) => {
      const ok = await dialogs.confirm({
        title: '완전히 지울까요?',
        label: `${displayPath(item.path)}\n휴지통에서도 없어집니다. 되돌릴 수 없습니다.`,
        confirmText: '완전 삭제',
        danger: true,
      })
      if (!ok) return
      try {
        await vault.purgeTrash(item)
      } catch (cause) {
        report(cause)
      }
    },
    [dialogs, report, vault],
  )

  const handleEmptyTrash = useCallback(async () => {
    const ok = await dialogs.confirm({
      title: '휴지통을 비울까요?',
      label: `${vault.trash.length}개가 모두 없어집니다. 되돌릴 수 없습니다.`,
      confirmText: '휴지통 비우기',
      danger: true,
    })
    if (!ok) return
    try {
      const count = await vault.emptyTrash()
      flash(`휴지통에서 ${count}개를 없앴습니다.`)
    } catch (cause) {
      report(cause)
    }
  }, [dialogs, flash, report, vault])

  const handleMove = useCallback(
    async (from: string, targetDir: string) => {
      const currentDirOfNode = from.split('/').slice(0, -1).join('/')
      if (currentDirOfNode === targetDir) return
      try {
        await commit()

        /*
         * 옮겨 갈 자리에 같은 이름이 이미 있으면 묻습니다.
         *
         * 예전에는 "이미 있습니다" 한 줄을 띄우고 말았습니다. 그러면 덮어쓰려는 사람은
         * 옮길 길이 없고, 실수로 끌어다 놓은 사람은 무슨 일이 벌어졌는지 알기 어렵습니다.
         * 폴더를 덮어쓰면 그 안엣것까지 사라지므로 그 말을 창에 그대로 적어 둡니다.
         */
        const name = from.split('/').pop() ?? from
        const target = targetDir ? `${targetDir}/${name}` : name
        const standing = vault.root ? await entryKind(vault.root, target) : null

        if (standing !== null) {
          const ok = await dialogs.confirm({
            title: '같은 이름이 이미 있습니다',
            label: `${displayPath(target)} 자리에 ${standing === 'dir' ? '같은 이름의 폴더가' : '같은 이름의 파일이'} 있습니다.\n`
              + (standing === 'dir'
                ? '덮어쓰면 그 폴더와 안에 든 것이 모두 사라지고 되돌릴 수 없습니다.'
                : '덮어쓰면 그 파일은 사라지고 되돌릴 수 없습니다.'),
            confirmText: '덮어쓰기',
            danger: true,
          })
          if (!ok) return
        }

        const next = await vault.move(from, targetDir, standing !== null)
        if (selectedPath === from) setSelectedPath(next)
        applyFavorites(movedFavorites(favorites, from, next))
      } catch (cause) {
        report(cause)
      }
    },
    [applyFavorites, commit, dialogs, favorites, report, selectedPath, vault],
  )

  const handleOpenLink = useCallback(
    async (target: string, resolved: string | null) => {
      if (resolved) return openDoc(resolved)
      const ok = await dialogs.confirm({
        title: '문서를 새로 만들까요?',
        label: `"${target}" 문서가 아직 없습니다. ${displayPath(currentDir)} 에 만듭니다.`,
        confirmText: '만들기',
      })
      if (!ok) return
      try {
        const path = await vault.createDoc(currentDir, target)
        await openDoc(path)
      } catch (cause) {
        report(cause)
      }
    },
    [currentDir, dialogs, openDoc, report, vault],
  )

  if (vault.status === 'unsupported') {
    return (
      <div className="gate">
        <h1>t-WiKi</h1>
        <p>
          이 브라우저는 File System Access API 를 지원하지 않습니다. Chrome, Edge 등
          Chromium 계열 데스크톱 브라우저에서 열어 주세요.
        </p>
      </div>
    )
  }

  if (vault.status === 'empty' || vault.status === 'needs-permission' || vault.status === 'error') {
    return (
      <div className="gate">
        <h1>t-WiKi</h1>
        <p>마크다운 문서를 담아둘 로컬 폴더를 지정하면 그 폴더가 곧 위키가 됩니다.</p>
        {vault.status === 'needs-permission' ? (
          <>
            <p className="hint">
              지난번에 쓰던 폴더 <strong>{vault.vaultName}</strong> 가 있습니다. 브라우저 정책상
              접근 권한은 클릭으로만 다시 받을 수 있습니다.
            </p>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                data-tip="지난번에 쓰던 폴더를 다시 엽니다"
                onClick={() => void vault.reconnect()}
              >
                “{vault.vaultName}” 다시 열기
              </button>
              <button
                type="button"
                className="btn"
                data-tip="다른 폴더를 지정합니다"
                onClick={() => void vault.open()}
              >
                다른 폴더 고르기
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            data-tip="마크다운을 담아둘 폴더를 고릅니다. 그 폴더가 위키가 됩니다"
            onClick={() => void vault.open()}
          >
            폴더 열기
          </button>
        )}
        {vault.error && <p className="status status-error">{vault.error}</p>}
      </div>
    )
  }

  /*
   * 버튼 너비를 고정했으므로 진행 건수를 글자로 붙이면 잘립니다.
   * 숫자는 안내로 옮기고, 진행은 버튼 안쪽을 채우는 막대로 보여 줍니다.
   */
  const progress = sync.status.phase === 'running' ? sync.status.progress : null
  const syncProgressTip = progress
    ? `${progress.done}/${progress.total} 처리 중입니다`
    : '동기화하는 중입니다'
  const syncFillStyle = progress && progress.total > 0
    ? ({ '--sync-fill': `${Math.round((progress.done / progress.total) * 100)}%` } as CSSProperties)
    : undefined

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <strong className="brand">t-WiKi</strong>
          <span className="vault-name">{vault.vaultName}</span>
        </div>
        <div className="topbar-right">
          {sync.nextAutoSyncAt !== null && (
            <SyncCountdown
              nextAt={sync.nextAutoSyncAt}
              minutes={sync.config.autoSyncMinutes}
              running={sync.status.phase === 'running'}
            />
          )}
          <button
            type="button"
            className={sync.status.phase === 'error' ? 'btn btn-warned' : 'btn'}
            data-tip={
              sync.status.phase === 'running'
                ? syncProgressTip
                : sync.isConfigured
                  ? `${sync.config.owner}/${sync.config.repo} 와 지금 동기화합니다`
                  : '아직 저장소가 지정되지 않았습니다. 눌러서 설정하세요'
            }
            onClick={startSync}
            disabled={sync.status.phase === 'running'}
            style={syncFillStyle}
          >
            {sync.status.phase === 'running' ? <SyncIcon className="is-spinning" /> : <GitHubIcon />}
            <span className="btn-label">
              <span>{sync.status.phase === 'running' ? '동기화 중…' : 'GitHub 동기화'}</span>
              {/*
                글자가 바뀌어도 단추 너비가 흔들리지 않도록, 가장 긴 글자를
                보이지 않게 겹쳐 두어 자리를 잡습니다. px 로 못 박으면
                글꼴이 바뀔 때 글자가 잘립니다.
              */}
              <span className="btn-label-ghost" aria-hidden="true">GitHub 동기화</span>
            </span>
          </button>
          <div className="shortcuts-anchor" data-shortcuts-anchor>
            <button
              type="button"
              className={shortcutsOpen ? 'btn is-active' : 'btn'}
              data-tip="단축키 목록을 봅니다 (⌘/)"
              aria-label="단축키"
              aria-expanded={shortcutsOpen}
              onClick={() => setShortcutsOpen((open) => !open)}
            >
              <KeyboardIcon />
              <span>단축키</span>
            </button>
            {shortcutsOpen && <ShortcutsPopover onClose={() => setShortcutsOpen(false)} />}
          </div>
          <button
            type="button"
            className="btn"
            data-tip="테마, 글꼴, GitHub 동기화를 설정합니다 (⌘,)"
            aria-label="설정"
            onClick={() => setSettingsTab('last')}
          >
            <SettingsIcon />
            <span>설정</span>
          </button>
        </div>
      </header>

      <div className="body">
        <aside
          className={sidebarOpen ? 'sidebar' : 'sidebar is-rail'}
          style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
        >
          {/*
            * 머리 칸. 위에 탭 줄, 아래에 검색란입니다.
            * 접으면 탭 줄은 펴기 단추만 남고, 그 아래에 탭 두 개가 세로로 섭니다.
            * 접힌 채로도 어느 쪽을 볼지 고를 수 있어야 펴는 걸음이 하나로 끝납니다.
            */}
          <div className="sidebar-head">
            <div className="sidebar-tabs">
              {sidebarOpen && (
                <div className="sidebar-tablist" role="tablist" aria-label="옆줄 내용">
                  {SIDEBAR_TABS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={sidebarTab === item.id}
                      className={sidebarTab === item.id ? 'is-active' : ''}
                      data-tip={item.hint}
                      onClick={() => applySidebarTab(item.id)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="sidebar-toggle"
                aria-label={sidebarOpen ? '옆줄 접기' : '옆줄 펴기'}
                aria-expanded={sidebarOpen}
                data-tip={sidebarOpen ? '옆줄 접기' : '옆줄 펴기'}
                onClick={() => applySidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <SidebarCloseIcon /> : <SidebarOpenIcon />}
              </button>
            </div>

            {/* 접혔을 때만 서는 탭. 누르면 펴면서 그 탭으로 갑니다. */}
            {!sidebarOpen && (
              <div className="sidebar-rail-tabs">
                {SIDEBAR_TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={sidebarTab === item.id ? 'is-active' : ''}
                    aria-label={item.name}
                    data-tip={`${item.name} 탭을 펴서 봅니다`}
                    onClick={() => {
                      applySidebarTab(item.id)
                      applySidebarOpen(true)
                    }}
                  >
                    {item.id === 'favorites' ? <StarIcon filled /> : <FolderIcon />}
                  </button>
                ))}
              </div>
            )}

            {/*
              * 검색란은 두 탭이 나눠 씁니다. 생김새는 같지만 하는 일이 달라
              * 친 글자도 따로 들고 있습니다. 폴더 탭에서는 이름과 본문을 뒤지고,
              * 즐겨찾기 탭에서는 담아 둔 것을 이름으로 거릅니다.
              */}
            {sidebarOpen && (
              <div className="sidebar-search">
                <div className="search-field">
                  <input
                    ref={searchInput}
                    className="search-input"
                    value={sidebarTab === 'tree' ? query : favoriteQuery}
                    placeholder={sidebarTab === 'tree' ? '문서 검색' : '즐겨찾기에서 찾기'}
                    onChange={(event) => {
                      if (sidebarTab === 'tree') setQuery(event.target.value)
                      else setFavoriteQuery(event.target.value)
                    }}
                    onKeyDown={(event) => {
                      // 아래 방향키로 결과 목록, 검색어가 없으면 트리·즐겨찾기의 지금 열어 둔 줄로 내려갑니다.
                      if (event.key !== 'ArrowDown') return
                      const first = document.querySelector<HTMLElement>('.search-results button') ?? listEntry()
                      if (!first) return
                      event.preventDefault()
                      first.focus()
                    }}
                  />
                  {/* 한 글자라도 있으면 지울 수 있게 합니다. */}
                  {(sidebarTab === 'tree' ? query : favoriteQuery).length > 0 && (
                    <button
                      type="button"
                      className="search-clear"
                      aria-label="검색어 지우기"
                      data-tip="검색어 지우기"
                      onClick={() => {
                        if (sidebarTab === 'tree') setQuery('')
                        else setFavoriteQuery('')
                        // 지운 뒤 바로 다시 칠 수 있도록 자리를 돌려 줍니다.
                        searchInput.current?.focus()
                      }}
                    >
                      <XIcon />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 파일 고르기 창은 브라우저가 띄웁니다. 목록에 있는 형식만 걸러 보여 줍니다. */}
            <input
              ref={filePicker}
              id="add-files"
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="visually-hidden"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])]
                event.target.value = ''
                // 뿌리 줄에서 열었으면 최상위로, 그 밖에는 고른 폴더로 갑니다.
                const target = pickerDir.current
                pickerDir.current = null
                void handleAddFiles(files, target ?? undefined)
              }}
            />
          </div>

          {/* 고른 탭 하나만 그립니다. 둘을 함께 두면 좁은 칸을 나눠 쓰게 됩니다. */}
          {sidebarOpen && (
          <div className="sidebar-panes">
            <div className="sidebar-scroll" ref={sidebarScroll}>
            {sidebarTab === 'favorites' ? (
              <Favorites
                paths={favorites}
                query={favoriteQuery}
                root={vault.tree}
                onOpen={(path) => void (isMarkdown(path) ? openDoc(path) : openAsset(path))}
                onOpenDir={(path) => {
                  setSelectedDir(path)
                  setSelectedPath(null)
                }}
                onRemove={toggleFavorite}
                onReorder={(from, to, place) =>
                  applyFavorites(reorderFavorites(favorites, from, to, place))}
                onLeaveTop={() => searchInput.current?.focus()}
                selectedPath={selectedDir ?? selectedPath}
              />
            ) : query.trim() ? (
              <SearchPanel
                query={query}
                source={searchSource}
                loading={textsLoading}
                onOpen={(path) => void (isMarkdown(path) ? openDoc(path) : openAsset(path))}
                onOpenDir={(path) => {
                  setSelectedDir(path)
                  setSelectedPath(null)
                }}
                onLeaveTop={() => {
                  const box = searchInput.current
                  if (!box) return
                  box.focus()
                  // 이어서 칠 수 있도록 글자 끝에 자리를 둡니다.
                  box.setSelectionRange(box.value.length, box.value.length)
                }}
              />
            ) : vault.status === 'loading' && !vault.tree ? (
              /*
               * 폴더가 크면 다 훑는 데 한참 걸립니다. 그동안 아무것도 그리지 않으면
               * 빈 폴더를 연 것처럼 보입니다. 어디까지 왔는지 세어 보여 줍니다.
               */
              <p className="tree-loading">
                <span className="spinner" aria-hidden="true" />
                폴더를 읽는 중…
                {vault.read > 0 && <span className="tree-loading-count">{vault.read}개</span>}
              </p>
            ) : (
              vault.tree && (
                <TreeView
                  root={vault.tree}
                  rootName={vault.vaultName}
                  selectedPath={selectedDir ?? selectedPath}
                  onPickFiles={() => {
                    pickerDir.current = ''
                    filePicker.current?.click()
                  }}
                  onRefresh={() => void vault.refresh()}
                  onCloseVault={() => void closeVault()}
                  onLeaveTop={() => searchInput.current?.focus()}
                  expanded={expanded}
                  onToggle={toggleFolder}
                  onSelect={(path) => void (isMarkdown(path) ? openDoc(path) : openAsset(path))}
                  onSelectDir={(path: string) => {
                    setSelectedDir(path)
                    setSelectedPath(null)
                  }}
                  onNewDoc={(dir) => void handleNewDoc(dir)}
                  onNewFolder={(dir) => void handleNewFolder(dir)}
                  onRename={(path) => void handleRename(path)}
                  onDelete={(path) => void handleDelete(path)}
                  onMove={(from, dir) => void handleMove(from, dir)}
                  onDropFiles={(dir, files) => void handleAddFiles(files, dir)}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onPickFilesFor={(dir) => {
                    pickerDir.current = dir
                    filePicker.current?.click()
                  }}
                />
              )
            )}
            </div>
            {vault.tree && sidebarTab !== 'favorites' && (
              /*
               * 휴지통은 트리 밖의 줄입니다. 트리 안에 폴더처럼 두면 안엣것을 열어 고치거나
               * 끌어 옮기게 되는데, 지운 것은 되돌리거나 없애는 두 길만 있어야 합니다.
               */
              <button
                type="button"
                className={selectedDir === TRASH_DIR ? 'trash-row is-selected' : 'trash-row'}
                data-tip="지운 것을 보고 되돌리거나 완전히 없앱니다"
                aria-pressed={selectedDir === TRASH_DIR}
                onClick={() => {
                  setSelectedDir(TRASH_DIR)
                  setSelectedPath(null)
                }}
              >
                <TrashIcon />
                <span>휴지통</span>
                <span className="trash-row-count">{vault.trash.length}</span>
              </button>
            )}
          </div>
          )}

          {sidebarOpen && (
            /*
             * 너비 손잡이. 자판으로도 옮길 수 있어야 하므로 나눔 막대로 알립니다.
             * 두 번 누르면 처음 폭으로 돌아갑니다.
             */
            <div
              className="sidebar-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="폴더 트리 너비"
              aria-valuenow={sidebarWidth}
              aria-valuemin={MIN_SIDEBAR_WIDTH}
              aria-valuemax={maxSidebarWidth()}
              tabIndex={0}
              data-tip="끌어서 너비를 조절합니다. 두 번 누르면 처음 폭으로 돌아갑니다"
              onPointerDown={startResize}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onDoubleClick={() => applySidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 48 : 16
                if (event.key === 'ArrowLeft') applySidebarWidth(sidebarWidth - step)
                else if (event.key === 'ArrowRight') applySidebarWidth(sidebarWidth + step)
                else if (event.key === 'Home') applySidebarWidth(DEFAULT_SIDEBAR_WIDTH)
                else return
                event.preventDefault()
              }}
            />
          )}
        </aside>

        <main className="main">
          {selectedDir === TRASH_DIR ? (
            <>
              <div className="doc-head">
                <h1>휴지통</h1>
                <span className="pill">{vault.trash.length}개</span>
              </div>
              <TrashView
                items={vault.trash}
                onRestore={(item) => void handleRestore(item)}
                onPurge={(item) => void handlePurge(item)}
                onEmpty={() => void handleEmptyTrash()}
              />
            </>
          ) : selection && selection.kind !== 'markdown' ? (
            <>
              <div className="doc-head">
                <h1>{selection.name}</h1>
                {editableText && (
                  <span className={dirty ? 'pill' : 'pill pill-ok'}>{dirty ? '저장 중…' : '저장됨'}</span>
                )}
                {selection.kind !== 'dir' && !editableText && <span className="pill">읽기 전용</span>}
                {/*
                  앱이 쓰는 살림 파일입니다. 트리에는 감춰 두었지만 동기화 결과에서는
                  이름이 나오고, 그 이름을 눌러 여기까지 올 수 있습니다.
                  손대면 즐겨찾기가 통째로 흐트러지므로 열자마자 눈에 띄게 알립니다.
                */}
                {isAppFile(selection.path) && (
                  <span className="head-warn">
                    앱이 쓰는 파일입니다. 고치면 즐겨찾기가 흐트러질 수 있습니다
                  </span>
                )}
                {editableText && textPreview && (
                  <ViewModeSwitch mode={viewMode} onChange={setViewMode} />
                )}
                {selection.kind === 'image' && imagePreview && (
                  <BackdropSwitch backdrop={imageBackdrop} onChange={applyImageBackdrop} />
                )}
              </div>

              {editableText ? (
                // 보여 줄 것이 있으면 마크다운처럼 나란히 놓고, 없으면 편집기만 넓게 씁니다.
                <div
                  className={`doc-body mode-${textPreview ? viewMode : 'edit'}`}
                  style={{ '--split-a': `${splitRatio}%` } as CSSProperties}
                >
                  {(!textPreview || viewMode !== 'preview') && (
                    <Editor
                      path={selection.path}
                      value={draft}
                      onChange={(next) => {
                        setDraft(next)
                        setDirty(true)
                        typedAtRef.current = Date.now()
                      }}
                      onSave={() => void commit()}
                    />
                  )}
                  {textPreview && viewMode === 'split' && (
                    <SplitResizer ratio={splitRatio} onRatio={applySplitRatio} />
                  )}
                  {textPreview && viewMode !== 'edit' && (
                    <TextPreview kind={textPreview} path={selection.path} text={draft} />
                  )}
                </div>
              ) : selection.kind !== 'dir' && vault.root ? (
                <AssetView
                  root={vault.root}
                  path={selection.path}
                  size={selection.size}
                  imagePreview={imagePreview}
                  officePreview={officePreview}
                  backdrop={imageBackdrop}
                />
              ) : (
                <FolderView
                  onDropFiles={(files) => void handleAddFiles(files, selection.path)}
                  onPickFiles={() => filePicker.current?.click()}
                />
              )}
            </>
          ) : selectedPath ? (
            <>
              <div className="doc-head">
                <h1>{fileNameOf(selectedPath)}</h1>
                <span className={dirty ? 'pill' : 'pill pill-ok'}>{dirty ? '저장 중…' : '저장됨'}</span>
                <ViewModeSwitch mode={viewMode} onChange={setViewMode} />
              </div>

              {fields.length > 0 && (
                <dl className="frontmatter">
                  {fields.map((field) => (
                    <div key={field.key}>
                      <dt>{field.key}</dt>
                      <dd>
                        {field.values.length === 0
                          ? <span className="fm-empty">—</span>
                          : field.values.map((value) => (
                              <span key={value} className="fm-value">{value}</span>
                            ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <div
                className={`doc-body mode-${viewMode}`}
                style={{ '--split-a': `${splitRatio}%` } as CSSProperties}
              >
                {viewMode !== 'preview' && (
                  <Editor
                    path={selectedPath}
                    value={draft}
                    onChange={(next) => {
                      setDraft(next)
                      setDirty(true)
                      typedAtRef.current = Date.now()
                    }}
                    onSave={() => void commit()}
                  />
                )}
                {viewMode === 'split' && (
                  <SplitResizer ratio={splitRatio} onRatio={applySplitRatio} />
                )}
                {viewMode !== 'edit' && vault.root && (
                  <Preview
                    markdown={body}
                    index={vault.index}
                    assets={vault.assets}
                    root={vault.root}
                    docPath={selectedPath}
                    onOpenLink={(target, resolved) => void handleOpenLink(target, resolved)}
                    onToggleTask={(at) => toggleTaskAt(at)}
                  />
                )}
              </div>

            </>
          ) : vault.status === 'loading' && !vault.tree ? (
            // 옆줄만 알리고 본문을 비워 두면, 넓은 쪽이 멎은 것처럼 보입니다.
            <div className="placeholder">
              <p className="tree-loading">
                <span className="spinner" aria-hidden="true" />
                폴더를 읽는 중…
                {vault.read > 0 && <span className="tree-loading-count">{vault.read}개</span>}
              </p>
              <p className="hint">파일이 많으면 조금 걸립니다. 다 읽으면 트리가 나타납니다.</p>
            </div>
          ) : (
            <div className="placeholder">
              <p>왼쪽에서 문서를 고르거나 새로 만들어 보세요.</p>
              <p className="hint">
                본문에 <code>[[다른 문서]]</code> 라고 쓰면 위키 링크가 되고, 없는 문서는 클릭해서 바로 만들 수 있습니다.
              </p>
            </div>
          )}

          {selection && (
            <InfoBar
              info={selection}
              headings={headings}
              index={vault.index}
              onOpen={(path) => void openDoc(path)}
              vaultName={vault.vaultName}
              onNotice={flash}
            />
          )}
        </main>
      </div>

      {notice && <div className="toast">{notice}</div>}

      {settingsTab && (
        <SettingsPanel
          initialTab={settingsTab}
          sync={sync}
          vaultName={vault.vaultName ?? null}
          vaultRoot={vault.root}
          sidebarOpen={sidebarOpen}
          onSidebarOpen={applySidebarOpen}
          sidebarWidth={sidebarWidth}
          onSidebarWidth={(width) => applySidebarWidth(width)}
          sidebarTab={sidebarTab}
          onSidebarTab={applySidebarTab}
          splitRatio={splitRatio}
          onSplitRatio={applySplitRatio}
          imagePreview={imagePreview}
          onImagePreview={applyImagePreview}
          imageBackdrop={imageBackdrop}
          onImageBackdrop={applyImageBackdrop}
          officePreview={officePreview}
          onOfficePreview={applyOfficePreview}
          onShowHistory={() => setHistoryOpen(true)}
          onClose={() => setSettingsTab(null)}
        />
      )}

      {historyOpen && (
        <SyncHistorySheet
          runs={sync.history}
          config={sync.config}
          onClose={() => setHistoryOpen(false)}
          onOpen={openFromSync}
          onOpenDir={openDirFromSync}
        />
      )}

      {reportOpen && sync.report && (
        <SyncReportSheet
          report={sync.report}
          config={sync.config}
          onClose={() => setReportOpen(false)}
          onConfirm={() => {
            setReportOpen(false)
            void sync.confirmTarget()
          }}
          onOpen={openFromSync}
          onOpenDir={openDirFromSync}
        />
      )}
    </div>
  )
}

/** 트리에서 경로에 해당하는 마디를 찾습니다. */
function findNode(root: VaultNode, path: string): VaultNode | null {
  if (root.path === path) return root
  for (const child of root.children ?? []) {
    const found = findNode(child, path)
    if (found) return found
  }
  return null
}

/**
 * 폴더 아래에 든 항목 수와 크기 합계, 그리고 마지막으로 고친 때.
 *
 * 세는 것은 파일만이 아니라 하위 폴더까지입니다. 표시줄에 '항목'이라 적으므로
 * 폴더를 빼고 세면 눈에 보이는 것과 숫자가 어긋납니다.
 * 폴더 자체에는 고친 시각이 없습니다. 안에서 가장 최근 것을 폴더의 시각으로 씁니다.
 */
function rollUp(node: VaultNode): { size: number; items: number; lastModified: number | null } {
  // 파일은 제 아래에 든 것이 없습니다. 크기와 시각만 위로 올려 보냅니다.
  if (node.kind === 'file') {
    return { size: node.size ?? 0, items: 0, lastModified: node.lastModified ?? null }
  }

  let size = 0
  let items = 0
  let lastModified: number | null = null
  for (const child of node.children ?? []) {
    const inner = rollUp(child)
    size += inner.size
    items += 1 + inner.items
    if (inner.lastModified !== null && (lastModified === null || inner.lastModified > lastModified)) {
      lastModified = inner.lastModified
    }
  }
  return { size, items, lastModified }
}

/**
 * 이름을 바꾸거나 옮겼을 때 즐겨찾기를 따라 옮깁니다.
 * 폴더를 옮기면 그 안에 있던 것들의 경로도 함께 바뀝니다.
 */
function movedFavorites(paths: string[], from: string, to: string): string[] {
  return paths.map((one) => {
    if (one === from) return to
    return one.startsWith(`${from}/`) ? to + one.slice(from.length) : one
  })
}
