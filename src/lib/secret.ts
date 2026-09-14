import { get, set } from 'idb-keyval'

/*
 * 액세스 토큰을 봉해 두는 자리.
 *
 * 토큰은 브라우저 IndexedDB 에만 두지만, 그대로 적어 두면 개발자 도구의 저장소
 * 탭에서 글자 그대로 읽힙니다. 화면에 띄우거나 남에게 보이는 자리마다 가리기보다
 * 저장하는 자리에서 한 번 봉하고, 읽는 자리에서 한 번 풀어 쓰는 편이 빠뜨릴 곳이
 * 없습니다.
 *
 * 열쇠는 이 브라우저가 만들어 같은 IndexedDB 에 둡니다. **꺼낼 수 없는(extractable:
 * false) 열쇠**라 자바스크립트로 열쇠 자체를 읽어 낼 길은 없고, 봉한 것을 푸는 데만
 * 쓸 수 있습니다. 다만 같은 출처의 코드는 그 열쇠로 풀 수 있으므로, 이것은 저장소를
 * 들여다보는 눈에서 글자를 감추는 일이지 브라우저 프로필을 통째로 가져간 사람까지
 * 막는 일은 아닙니다. 그런 데까지 막으려면 매번 암호를 받아야 하는데, 그 값은
 * 여기서 치르지 않기로 했습니다.
 */

const SECRET_KEY = 'mdwiki:secret-key'

/** 봉한 꼴. 옛 글자 그대로의 토큰과 구별되도록 꼴을 갖춥니다. */
export interface Sealed {
  v: 1
  /** AES-GCM 초기값. 봉할 때마다 새로 뽑습니다. */
  iv: string
  /** 봉한 바이트. base64. */
  data: string
}

export function isSealed(value: unknown): value is Sealed {
  return typeof value === 'object' && value !== null
    && (value as Sealed).v === 1
    && typeof (value as Sealed).iv === 'string'
    && typeof (value as Sealed).data === 'string'
}

/*
 * 열쇠는 한 번만 만듭니다.
 *
 * 처음 봉하는 자리가 둘이 겹치면 열쇠도 둘이 생겨, 한쪽으로 봉한 것을 다른 쪽
 * 열쇠로는 풀 수 없게 됩니다. 만드는 약속을 하나로 붙들어 두고 모두 그것을 기다립니다.
 */
let pending: Promise<CryptoKey> | null = null

function loadKey(): Promise<CryptoKey> {
  pending ??= (async () => {
    const stored = await get<CryptoKey>(SECRET_KEY)
    if (stored) return stored
    const made = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
    await set(SECRET_KEY, made)
    return made
  })().catch((cause: unknown) => {
    // 실패한 약속을 붙들고 있으면 다음 시도도 같은 실패를 돌려받습니다.
    pending = null
    throw cause
  })
  return pending
}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (one) => one.charCodeAt(0))

export async function seal(plain: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await loadKey(),
    new TextEncoder().encode(plain),
  )
  return { v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
}

/**
 * 봉한 것을 풉니다. 열쇠가 바뀌었거나 값이 손상됐으면 던집니다.
 * 부르는 쪽에서 그때는 토큰이 없는 것으로 다루고 다시 받습니다.
 */
export async function open(sealed: Sealed): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
    await loadKey(),
    fromBase64(sealed.data),
  )
  return new TextDecoder().decode(plain)
}

/*
 * 파일로 내보낼 때는 다른 열쇠가 필요합니다.
 *
 * 위의 열쇠는 이 브라우저 안에만 있어, 그것으로 봉한 것은 다른 기기에서 풀 수 없습니다.
 * 설정 파일은 다른 기기로 옮기려고 만드는 것이므로, 사람이 아는 암호에서 열쇠를
 * 끌어냅니다(PBKDF2). 같은 암호를 아는 쪽만 풉니다.
 */

/** 암호로 잠근 꼴. 파일에 그대로 적힙니다. */
export interface Locked {
  v: 1
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  iv: string
  data: string
}

/** 암호에서 열쇠를 끌어내는 횟수. 느린 기계에서도 반 초 안쪽입니다. */
const ITERATIONS = 310_000

export function isLocked(value: unknown): value is Locked {
  const one = value as Locked
  return typeof value === 'object' && value !== null
    && one.v === 1 && one.kdf === 'PBKDF2-SHA-256'
    && typeof one.iterations === 'number'
    && typeof one.salt === 'string' && typeof one.iv === 'string' && typeof one.data === 'string'
}

async function keyFromPassphrase(
  passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function lock(plain: string, passphrase: string): Promise<Locked> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFromPassphrase(passphrase, salt, ITERATIONS)
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain),
  )
  return {
    v: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
  }
}

/** 암호가 다르면 던집니다. 부르는 쪽에서 다시 묻습니다. */
export async function unlock(locked: Locked, passphrase: string): Promise<string> {
  const key = await keyFromPassphrase(passphrase, fromBase64(locked.salt), locked.iterations)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(locked.iv) }, key, fromBase64(locked.data),
  )
  return new TextDecoder().decode(plain)
}
