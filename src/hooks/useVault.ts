import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetIndex, DocIndex, VaultNode } from '../types'
import { clearAssetCache } from '../lib/assets'
import * as fs from '../lib/fsAccess'
import { clearVaultHandle, loadVaultHandle, saveVaultHandle } from '../lib/store'

export type VaultStatus = 'unsupported' | 'empty' | 'needs-permission' | 'loading' | 'ready' | 'error'

export interface Vault {
  status: VaultStatus
  error: string | null
  root: FileSystemDirectoryHandle | null
  tree: VaultNode | null
  index: DocIndex
  assets: AssetIndex
  vaultName: string
  open: () => Promise<void>
  reconnect: () => Promise<void>
  close: () => Promise<void>
  refresh: () => Promise<void>
  save: (path: string, content: string) => Promise<void>
  createDoc: (dirPath: string, name: string) => Promise<string>
  createFolder: (dirPath: string, name: string) => Promise<void>
  rename: (path: string, nextName: string) => Promise<string>
  move: (path: string, targetDir: string) => Promise<string>
  remove: (path: string) => Promise<void>
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function ensureMdExtension(name: string): string {
  return name.toLowerCase().endsWith('.md') ? name : `${name}.md`
}

/** 파일명에 쓸 수 없는 문자를 걸러냅니다. */
function assertSafeName(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('이름을 입력해 주세요.')
  if (/[/\\:*?"<>|]/.test(trimmed)) throw new Error('이름에 / \\ : * ? " < > | 는 쓸 수 없습니다.')
  if (trimmed.startsWith('.')) throw new Error('점으로 시작하는 이름은 쓸 수 없습니다.')
}

export function useVault(): Vault {
  const [status, setStatus] = useState<VaultStatus>(() => (fs.isSupported() ? 'empty' : 'unsupported'))
  const [error, setError] = useState<string | null>(null)
  const [tree, setTree] = useState<VaultNode | null>(null)
  const [index, setIndex] = useState<DocIndex>(() => new Map())
  const [assets, setAssets] = useState<AssetIndex>(() => new Map())
  // 렌더에는 state 를, 콜백에는 ref 를 씁니다.
  // 콜백이 오래된 클로저를 붙잡는 것과, 렌더 중 ref 를 읽는 것을 둘 다 피하기 위해서입니다.
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null)
  const rootRef = useRef<FileSystemDirectoryHandle | null>(null)
  const [vaultName, setVaultName] = useState('')

  const attachRoot = useCallback((next: FileSystemDirectoryHandle | null) => {
    rootRef.current = next
    setRoot(next)
  }, [])

  const scan = useCallback(async (root: FileSystemDirectoryHandle) => {
    setStatus('loading')
    try {
      const result = await fs.scanVault(root)
      setTree(result.tree)
      setIndex(result.index)
      setAssets(result.assets)
      setVaultName(root.name)
      setError(null)
      setStatus('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }, [])

  const adopt = useCallback(
    async (picked: FileSystemDirectoryHandle) => {
      attachRoot(picked)
      await saveVaultHandle(picked)
      await scan(picked)
    },
    [attachRoot, scan],
  )

  // 지난 세션에서 쓰던 폴더를 되살립니다.
  // 권한이 이미 'granted' 일 때만 자동으로 열고, 아니면 사용자 클릭을 기다립니다.
  // (requestPermission 은 사용자 제스처 없이는 호출할 수 없습니다.)
  useEffect(() => {
    if (!fs.isSupported()) return
    let cancelled = false

    void (async () => {
      try {
        const saved = await loadVaultHandle()
        if (!saved || cancelled) return

        attachRoot(saved)
        setVaultName(saved.name)
        const permission = await saved.queryPermission({ mode: 'readwrite' })
        if (cancelled) return
        if (permission === 'granted') await scan(saved)
        else setStatus('needs-permission')
      } catch {
        // 저장해 둔 핸들을 못 쓰는 경우(브라우저 저장소 손상 등)에는
        // 조용히 버리고 처음 화면으로 돌아갑니다.
        if (cancelled) return
        await clearVaultHandle()
        attachRoot(null)
        setVaultName('')
        setStatus('empty')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [attachRoot, scan])

  const open = useCallback(async () => {
    try {
      const picked = await fs.pickVault()
      await adopt(picked)
    } catch (cause) {
      // 사용자가 피커를 그냥 닫은 경우는 오류로 취급하지 않습니다.
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }, [adopt])

  const reconnect = useCallback(async () => {
    const saved = rootRef.current ?? (await loadVaultHandle())
    if (!saved) return open()
    attachRoot(saved)
    if (await fs.ensurePermission(saved, 'readwrite')) await scan(saved)
    else setStatus('needs-permission')
  }, [attachRoot, open, scan])

  const close = useCallback(async () => {
    await clearVaultHandle()
    clearAssetCache()
    attachRoot(null)
    setTree(null)
    setIndex(new Map())
    setAssets(new Map())
    setVaultName('')
    setError(null)
    setStatus('empty')
  }, [attachRoot])

  const refresh = useCallback(async () => {
    if (rootRef.current) await scan(rootRef.current)
  }, [scan])

  const requireRoot = useCallback((): FileSystemDirectoryHandle => {
    if (!rootRef.current) throw new Error('먼저 폴더를 열어 주세요.')
    return rootRef.current
  }, [])

  /** 저장은 트리 전체를 다시 읽지 않고 해당 문서만 인덱스에서 갱신합니다. */
  const save = useCallback(
    async (path: string, content: string) => {
      const root = requireRoot()
      const lastModified = await fs.writeFile(root, path, content)
      setIndex((previous) => {
        const next = new Map(previous)
        next.set(path, { path, content, lastModified })
        return next
      })
    },
    [requireRoot],
  )

  const createDoc = useCallback(
    async (dirPath: string, name: string) => {
      const root = requireRoot()
      assertSafeName(name)
      const path = joinPath(dirPath, ensureMdExtension(name.trim()))
      if (await fs.exists(root, path)) throw new Error(`"${path}" 가 이미 있습니다.`)
      await fs.writeFile(root, path, `# ${name.trim().replace(/\.md$/i, '')}\n\n`)
      await refresh()
      return path
    },
    [refresh, requireRoot],
  )

  const createFolder = useCallback(
    async (dirPath: string, name: string) => {
      const root = requireRoot()
      assertSafeName(name)
      const path = joinPath(dirPath, name.trim())
      if (await fs.exists(root, path)) throw new Error(`"${path}" 가 이미 있습니다.`)
      await fs.createDir(root, path)
      await refresh()
    },
    [refresh, requireRoot],
  )

  const rename = useCallback(
    async (path: string, nextName: string) => {
      const root = requireRoot()
      assertSafeName(nextName)
      const dirPath = path.split('/').slice(0, -1).join('/')
      const isDoc = path.toLowerCase().endsWith('.md')
      const target = joinPath(dirPath, isDoc ? ensureMdExtension(nextName.trim()) : nextName.trim())
      await fs.movePath(root, path, target)
      await refresh()
      return target
    },
    [refresh, requireRoot],
  )

  const move = useCallback(
    async (path: string, targetDir: string) => {
      const root = requireRoot()
      const name = path.split('/').pop()!
      const target = joinPath(targetDir, name)
      await fs.movePath(root, path, target)
      await refresh()
      return target
    },
    [refresh, requireRoot],
  )

  const remove = useCallback(
    async (path: string) => {
      const root = requireRoot()
      await fs.removeEntry(root, path)
      await refresh()
    },
    [refresh, requireRoot],
  )

  return {
    status,
    error,
    root,
    tree,
    index,
    assets,
    vaultName,
    open,
    reconnect,
    close,
    refresh,
    save,
    createDoc,
    createFolder,
    rename,
    move,
    remove,
  }
}
