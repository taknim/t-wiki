import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetIndex, DocIndex, VaultNode } from '../types'
import {
  attachmentKind, extensionOf, isAttachment, isMarkdown, isSyncable, MAX_ATTACHMENT_BYTES,
} from '../lib/attachments'
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
  /** 마크다운이 아닌 텍스트 파일을 저장합니다. 문서 색인은 건드리지 않습니다. */
  saveText: (path: string, content: string) => Promise<void>
  createDoc: (dirPath: string, name: string) => Promise<string>
  createFolder: (dirPath: string, name: string) => Promise<void>
  rename: (path: string, nextName: string) => Promise<string>
  move: (path: string, targetDir: string) => Promise<string>
  remove: (path: string) => Promise<void>
  addFiles: (dirPath: string, files: File[]) => Promise<AddResult>
}

export interface AddResult {
  /** 실제로 들어간 경로. */
  added: string[]
  /** 형식이 맞지 않아 넣지 않은 파일 이름. */
  rejected: string[]
  /** 넣긴 했지만 크기 때문에 동기화되지 않을 파일 경로. */
  tooBig: string[]
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function ensureMdExtension(name: string): string {
  return name.toLowerCase().endsWith('.md') ? name : `${name}.md`
}

/**
 * 이름을 바꿀 때 확장자를 지키는 규칙.
 * 사용자가 확장자를 직접 적었으면 그대로 두고, 적지 않았으면 원래 것을 붙입니다.
 * 그러지 않으면 `도표.svg` 를 `구조도` 로 바꿨을 때 확장자가 사라져
 * 첨부로 인식되지 않고 동기화에서도 빠집니다.
 */
function renamedFile(path: string, nextName: string): string {
  if (isMarkdown(path)) return ensureMdExtension(nextName)

  const typed = extensionOf(nextName)
  if (typed) return nextName

  const original = extensionOf(path)
  return original ? `${nextName}.${original}` : nextName
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

  /**
   * 첨부 중 글자로 된 파일을 저장합니다.
   * 문서 색인에는 마크다운만 들어가므로, 여기서는 첨부 정보(크기·시각)만 새로 맞춥니다.
   * 매번 폴더를 다시 훑으면 저장할 때마다 느려집니다.
   */
  const saveText = useCallback(
    async (path: string, content: string) => {
      const root = requireRoot()
      const lastModified = await fs.writeFile(root, path, content)
      setAssets((previous) => {
        const next = new Map(previous)
        const entry = next.get(path)
        const size = new TextEncoder().encode(content).length
        /*
         * 없던 파일이면 새로 답니다. 예전에는 있는 것만 고쳐, 여기서 처음 만든 파일이
         * 목록에 없어 다음 동기화에서 통째로 빠졌습니다.
         */
        next.set(path, entry
          ? { ...entry, size, lastModified }
          : { path, size, lastModified, syncable: isSyncable(path, size) })
        return next
      })
    },
    [requireRoot],
  )

  const createDoc = useCallback(
    async (dirPath: string, name: string) => {
      const root = requireRoot()
      assertSafeName(name)
      const typed = name.trim()

      // 확장자를 직접 적었고 글자로 된 형식이면 그대로 씁니다.
      // 무턱대고 .md 를 붙이면 test.csv 가 test.csv.md 가 됩니다.
      const keepsExtension = attachmentKind(typed) === 'text'
      const path = joinPath(dirPath, keepsExtension ? typed : ensureMdExtension(typed))
      if (await fs.exists(root, path)) throw new Error(`"${path}" 가 이미 있습니다.`)

      // 마크다운에만 제목 줄을 넣습니다. 다른 형식에는 뜻이 없습니다.
      const seed = isMarkdown(path) ? `# ${typed.replace(/\.md$/i, '')}\n\n` : ''
      await fs.writeFile(root, path, seed)
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
      const target = joinPath(dirPath, renamedFile(path, nextName.trim()))
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

  /**
   * 고른 파일을 폴더에 넣습니다.
   * 같은 이름이 있으면 덮지 않고 뒤에 번호를 붙입니다. 실수로 원본을 잃지 않도록.
   */
  const addFiles = useCallback(
    async (dirPath: string, files: File[]): Promise<AddResult> => {
      const root = requireRoot()
      const result: AddResult = { added: [], rejected: [], tooBig: [] }

      for (const file of files) {
        if (!isAttachment(file.name)) {
          result.rejected.push(file.name)
          continue
        }

        const path = await uniquePath(root, joinPath(dirPath, file.name))
        await fs.writeBinaryFile(root, path, file)
        result.added.push(path)
        if (file.size > MAX_ATTACHMENT_BYTES) result.tooBig.push(path)
      }

      if (result.added.length > 0) await refresh()
      return result
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
    saveText,
    createDoc,
    createFolder,
    rename,
    move,
    remove,
    addFiles,
  }
}

/** 이미 있는 이름이면 "그림 (2).png" 처럼 번호를 붙여 비어 있는 자리를 찾습니다. */
async function uniquePath(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  if (!(await fs.exists(root, path))) return path

  const at = path.lastIndexOf('.')
  const stem = at === -1 ? path : path.slice(0, at)
  const extension = at === -1 ? '' : path.slice(at)

  for (let number = 2; number < 1000; number += 1) {
    const candidate = `${stem} (${number})${extension}`
    if (!(await fs.exists(root, candidate))) return candidate
  }
  throw new Error('같은 이름의 파일이 너무 많습니다.')
}
