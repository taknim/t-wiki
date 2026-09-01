import { get, set } from 'idb-keyval'

/**
 * 폴더마다 붙는 표.
 *
 * 설정과 동기화 기준점을 폴더별로 갈라 두려면 폴더를 가리키는 이름이 있어야 합니다.
 * 그런데 FileSystemDirectoryHandle 에는 경로가 없고, 폴더 이름은 겹칠 수 있습니다.
 * 그래서 핸들을 저장해 두고 isSameEntry 로 견주어, 같은 폴더면 같은 표를 돌려줍니다.
 */
const REGISTRY = 'mdwiki:vault-keys'

/** 표를 몇 개까지 들고 있을지. 오래 안 쓴 것부터 버립니다. */
const MAX_KEYS = 20

interface VaultRef {
  handle: FileSystemDirectoryHandle
  key: string
  seenAt: number
}

async function findIndex(refs: VaultRef[], root: FileSystemDirectoryHandle): Promise<number> {
  for (let at = 0; at < refs.length; at += 1) {
    try {
      // 비교는 지금 열려 있는 핸들 쪽에서 겁니다.
      // 저장해 둔 쪽은 브라우저 저장소를 거치며 상태가 온전하지 않을 수 있습니다.
      if (await root.isSameEntry(refs[at].handle)) return at
    } catch {
      // 핸들이 깨졌으면 건너뜁니다.
    }
  }
  return -1
}

/**
 * 이 폴더의 표. 처음 보는 폴더면 새로 매겨 둡니다.
 *
 * 폴더를 가려낼 수 없으면 null 입니다. 그때는 아무 설정도 읽지도 쓰지도 않습니다.
 * 가려내지 못하는데 표를 새로 매기면, 이미 표가 있는 폴더에 표가 하나 더 생깁니다.
 * 그러면 같은 폴더가 둘로 갈려 맞춰 둔 설정이 사라진 것처럼 보입니다.
 */
export async function vaultKeyFor(root: FileSystemDirectoryHandle): Promise<string | null> {
  // 견줄 수단이 없으면 이 폴더가 어느 폴더인지 알 길이 없습니다.
  if (typeof root.isSameEntry !== 'function') return null

  try {
    const refs = (await get<VaultRef[]>(REGISTRY)) ?? []
    const at = await findIndex(refs, root)

    if (at !== -1) {
      refs[at].seenAt = Date.now()
      await set(REGISTRY, refs)
      return refs[at].key
    }

    const key = crypto.randomUUID()
    refs.push({ handle: root, key, seenAt: Date.now() })
    refs.sort((a, b) => b.seenAt - a.seenAt)
    await set(REGISTRY, refs.slice(0, MAX_KEYS))
    return key
  } catch {
    // 저장소를 못 쓰면 폴더를 가려낼 수도 없습니다. 설정 없이 씁니다.
    return null
  }
}
