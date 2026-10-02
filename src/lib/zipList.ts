/*
 * 압축 파일 안에 무엇이 들었는지 봅니다.
 *
 * **풀지 않습니다.** zip 은 파일 끝에 목차(중앙 디렉터리)를 두므로, 끝의 몇 킬로바이트만
 * 읽으면 안엣것의 이름과 크기를 알 수 있습니다. 100MB 짜리라도 읽는 양은 같습니다.
 * 내용을 꺼내려면 풀어야 하고 그러려면 deflate 를 들여야 하는데, 여기서 하려는 일은
 * "이 압축 파일이 무엇이었더라" 를 가리는 것이지 파일을 꺼내 쓰는 것이 아닙니다.
 */

/** 압축 안의 한 항목. */
export interface ZipEntry {
  path: string
  /** 푼 뒤의 크기. */
  bytes: number
  /** 압축된 크기. */
  packed: number
  /** 마지막으로 고친 때. 없거나 읽을 수 없으면 null. */
  at: number | null
  /**
   * 지은 때. **기본 기록에는 없습니다** — 윈도에서 만든 압축이 덧붙이는 칸(NTFS)에만
   * 들어 있어, 없는 압축이 더 많습니다. 없으면 null.
   */
  created: number | null
  /** 폴더 자리인지. zip 은 폴더를 이름 끝의 빗금으로만 적습니다. */
  dir: boolean
}

export interface ZipListing {
  entries: ZipEntry[]
  /** 압축이 적어 둔 전체 항목 수. 잘라 보여 줄 때 얼마나 더 있는지 알립니다. */
  total: number
  /** 너무 많아 잘랐는지. */
  cut: boolean
}

/** 중앙 디렉터리의 자리. */
export interface ZipTail {
  offset: number
  size: number
  count: number
}

const EOCD = 0x06054b50
const EOCD64_LOCATOR = 0x07064b50
const CENTRAL = 0x02014b50
/** 한 번에 보여 줄 항목 수. 더 있으면 몇 개가 더 있는지만 적습니다. */
export const MAX_ZIP_ENTRIES = 2000

/**
 * 끝자락에서 목차의 자리를 찾습니다.
 *
 * zip 끝에는 EOCD 라는 표가 있고 그 뒤에 주석이 붙을 수 있어, 뒤에서부터 표를 찾습니다.
 * 주석은 최대 64KB 이므로 끝의 66KB 만 보면 넉넉합니다.
 */
export function findTail(tail: Uint8Array): ZipTail | null {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  for (let at = tail.byteLength - 22; at >= 0; at -= 1) {
    if (view.getUint32(at, true) !== EOCD) continue
    const count = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 12, true)
    const offset = view.getUint32(at + 16, true)
    /*
     * 4GB 를 넘거나 항목이 65535 개를 넘으면 zip64 로 적히고, 여기에는 전부 1 로 채운
     * 자리 지킴이만 남습니다. 그 꼴이면 읽을 수 없다고 밝힙니다 — 틀린 목록을 보여 주는
     * 것보다 못 읽는다고 말하는 편이 낫습니다.
     */
    if (offset === 0xffffffff || size === 0xffffffff || count === 0xffff) return null
    return { offset, size, count }
  }
  return null
}

/** 끝자락에 zip64 자리 지킴이가 있는지. 있으면 우리가 읽을 수 있는 꼴이 아닙니다. */
export function isZip64(tail: Uint8Array): boolean {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  for (let at = tail.byteLength - 4; at >= 0; at -= 1) {
    if (view.getUint32(at, true) === EOCD64_LOCATOR) return true
  }
  return false
}

/**
 * MS-DOS 로 적힌 때를 옮깁니다. 1980년을 기준으로 삼고 2초 단위로 적습니다.
 * 0 은 "적지 않음" 이라 null 로 둡니다.
 */
export function dosTime(date: number, time: number): number | null {
  if (date === 0) return null
  const year = 1980 + ((date >> 9) & 0x7f)
  const month = (date >> 5) & 0x0f
  const day = date & 0x1f
  if (month < 1 || day < 1) return null
  return new Date(year, month - 1, day, (time >> 11) & 0x1f, (time >> 5) & 0x3f, (time & 0x1f) * 2).getTime()
}

/**
 * 이름에 쓰였을 만한 글자 꼴.
 *
 * zip 규격은 "깃발이 서 있으면 UTF-8, 아니면 CP437" 이라고만 말합니다. 그러나 실제로는
 * **깃발 없이 UTF-8 로 적는 압축기가 흔하고**(맥의 압축이 그렇습니다), 윈도 압축기는
 * 저마다 제 나라 글자 꼴로 적습니다. 그래서 깃발만 믿으면 이름이 깨집니다.
 * 읽어 보고 **가장 그럴듯한 것**을 고릅니다.
 */
const CANDIDATES = ['utf-8', 'euc-kr', 'shift_jis', 'gbk', 'big5']

/**
 * 옮긴 글이 이름답게 생겼는지 점수를 냅니다.
 *
 * 깨진 글자(U+FFFD)나 제어 문자가 있으면 이름일 수 없습니다. 한글·가나·한자는 이름에
 * 흔히 쓰이므로 높게 치고, 쓰이지 않는 기호가 늘어서면 깎습니다. 같은 바이트라도
 * 엉뚱한 꼴로 읽으면 이 기호들이 쏟아지므로, 그것으로 옳은 꼴을 가립니다.
 */
export function nameScore(text: string): number {
  let total = 0
  for (const letter of text) {
    const code = letter.codePointAt(0) ?? 0
    if (code === 0xfffd) return Number.NEGATIVE_INFINITY
    if (code < 0x20) return Number.NEGATIVE_INFINITY
    else if (code < 0x80) total += 1
    else if (code >= 0xac00 && code <= 0xd7a3) total += 3
    else if (code >= 0x3040 && code <= 0x30ff) total += 3
    else if (code >= 0x4e00 && code <= 0x9fff) total += 3
    else if (code >= 0x3131 && code <= 0x318e) total += 2
    else if (code >= 0xe000 && code <= 0xf8ff) total -= 5
    else total -= 1
  }
  return total
}

/**
 * 이름 바이트들을 보고 글자 꼴 하나를 고릅니다.
 *
 * **압축 하나에는 한 가지 꼴**로 적혀 있으므로, 이름을 모두 모아 함께 재서 한 번만
 * 정합니다. 이름 하나하나로 정하면 짧은 이름에서 갈팡질팡합니다.
 * 읽다가 막히는 꼴(fatal)은 그 자리에서 떨어뜨립니다.
 */
export function guessEncoding(samples: Uint8Array[]): string {
  let best = 'utf-8'
  let bestScore = Number.NEGATIVE_INFINITY

  for (const label of CANDIDATES) {
    let decoder: TextDecoder
    try {
      decoder = new TextDecoder(label, { fatal: true })
    } catch {
      continue
    }
    let total = 0
    for (const raw of samples) {
      try {
        total += nameScore(decoder.decode(raw))
      } catch {
        total = Number.NEGATIVE_INFINITY
        break
      }
      if (total === Number.NEGATIVE_INFINITY) break
    }
    if (total > bestScore) {
      best = label
      bestScore = total
    }
  }
  return best
}

/**
 * 압축기가 따로 적어 둔 UTF-8 이름(Info-ZIP Unicode Path, 0x7075).
 *
 * 제 나라 글자 꼴로 적으면서 **원래 이름을 UTF-8 로 한 번 더** 적어 두는 압축기가 있습니다.
 * 있으면 추측할 까닭이 없습니다 — 적어 둔 것이 가장 미덥습니다.
 */
export function unicodePath(extra: Uint8Array): string | null {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength)
  let at = 0
  while (at + 4 <= extra.byteLength) {
    const tag = view.getUint16(at, true)
    const size = view.getUint16(at + 2, true)
    const body = at + 4
    if (body + size > extra.byteLength) break
    // 1바이트 버전 + 4바이트 본디 이름의 검사값 뒤부터가 UTF-8 이름입니다.
    if (tag === 0x7075 && size > 5) return new TextDecoder('utf-8').decode(extra.subarray(body + 5, body + size))
    at = body + size
  }
  return null
}

/**
 * 덧붙은 칸에서 때를 읽습니다.
 *
 * zip 의 기본 기록은 MS-DOS 꼴이라 2초 단위이고 **지은 때가 없습니다.** 윈도에서 만든
 * 압축은 NTFS 칸(0x000a)에 고친 때·본 때·지은 때를 100나노초 단위로 덧붙이고, 유닉스
 * 쪽은 0x5455 칸에 초 단위로 적습니다. 있으면 그것을 씁니다 — 없는 것을 지어내지 않습니다.
 */
export function readExtra(extra: Uint8Array): { at: number | null; created: number | null } {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength)
  let at = 0
  let modified: number | null = null
  let created: number | null = null

  while (at + 4 <= extra.byteLength) {
    const tag = view.getUint16(at, true)
    const size = view.getUint16(at + 2, true)
    const body = at + 4
    if (body + size > extra.byteLength) break

    if (tag === 0x000a && size >= 32) {
      /*
       * NTFS 칸. 속에 또 쪽지(tag 1)가 들어 있고, 때는 1601년부터 100나노초로 셉니다.
       * 자바스크립트의 때는 1970년부터 밀리초이므로 그만큼 빼고 나눕니다.
       */
      const inner = body + 4
      if (view.getUint16(inner, true) === 0x0001) {
        const toMs = (whenAt: number) => {
          const ticks = view.getBigUint64(whenAt, true)
          return ticks === 0n ? null : Number(ticks / 10000n) - 11644473600000
        }
        modified = toMs(inner + 4) ?? modified
        created = toMs(inner + 20) ?? created
      }
    }
    if (tag === 0x5455 && size >= 5) {
      // 유닉스 쪽. 첫 바이트의 깃발이 어떤 때가 들었는지 알리고, 고친 때가 맨 앞입니다.
      if ((view.getUint8(body) & 1) !== 0) modified = view.getUint32(body + 1, true) * 1000
    }
    at = body + size
  }

  return { at: modified, created }
}

/**
 * 목차를 읽어 항목을 늘어놓습니다.
 *
 * 두 번 훑습니다. 먼저 자리와 이름 바이트만 모아 **글자 꼴을 한 번 정하고**, 그다음 그
 * 꼴로 이름을 옮깁니다. 이름 하나하나로 정하면 같은 압축 안에서 어떤 이름은 한글로,
 * 어떤 이름은 한자로 읽히는 일이 생깁니다.
 */
export function readEntries(directory: Uint8Array, count: number, limit = MAX_ZIP_ENTRIES): ZipListing {
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength)
  const found: {
    raw: Uint8Array
    utf8: boolean
    told: string | null
    bytes: number
    packed: number
    at: number | null
    created: number | null
  }[] = []
  let at = 0
  let seen = 0

  while (at + 46 <= directory.byteLength && view.getUint32(at, true) === CENTRAL) {
    const flags = view.getUint16(at + 8, true)
    const time = view.getUint16(at + 12, true)
    const date = view.getUint16(at + 14, true)
    const packed = view.getUint32(at + 20, true)
    const bytes = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const raw = directory.subarray(at + 46, at + 46 + nameLength)
    const extra = directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength)
    const stamps = readExtra(extra)
    seen += 1
    if (found.length < limit) {
      found.push({
        raw,
        utf8: (flags & 0x800) !== 0,
        told: unicodePath(extra),
        bytes,
        packed,
        // 덧붙은 칸이 더 촘촘합니다(MS-DOS 꼴은 2초 단위). 있으면 그쪽을 씁니다.
        at: stamps.at ?? dosTime(date, time),
        created: stamps.created,
      })
    }
    at += 46 + nameLength + extraLength + commentLength
  }

  /*
   * 글자 꼴은 **적어 두지도 깃발을 세우지도 않은 이름들만** 보고 정합니다.
   * 이미 UTF-8 이라고 밝힌 이름까지 섞으면 그쪽으로 쏠려 가려낼 수가 없습니다.
   */
  const guessing = found.filter((one) => !one.utf8 && one.told === null).map((one) => one.raw)
  const label = guessing.length > 0 ? guessEncoding(guessing) : 'utf-8'
  const decoder = new TextDecoder(label)
  const entries: ZipEntry[] = found.map((one) => {
    const path = one.told ?? (one.utf8 ? new TextDecoder('utf-8').decode(one.raw) : decoder.decode(one.raw))
    return { path, bytes: one.bytes, packed: one.packed, at: one.at, created: one.created, dir: path.endsWith('/') }
  })

  return { entries, total: Math.max(count, seen), cut: seen > entries.length }
}

/**
 * 압축 파일의 목록을 읽습니다. 끝자락과 목차만 읽으므로 파일이 아무리 커도 읽는 양은 같습니다.
 */
export async function listZip(blob: Blob, limit = MAX_ZIP_ENTRIES): Promise<ZipListing> {
  const tailSize = Math.min(blob.size, 66 * 1024)
  const tail = new Uint8Array(await blob.slice(blob.size - tailSize).arrayBuffer())
  const found = findTail(tail)
  if (!found) {
    throw new Error(isZip64(tail)
      ? '4GB 를 넘거나 항목이 아주 많은 압축 파일(zip64)은 목록을 읽지 못합니다.'
      : '압축 파일의 목차를 찾지 못했습니다. 조각난 파일이거나 zip 이 아닐 수 있습니다.')
  }
  const directory = new Uint8Array(await blob.slice(found.offset, found.offset + found.size).arrayBuffer())
  return readEntries(directory, found.count, limit)
}

/**
 * 나눠 담은 조각을 차례로 이어 하나처럼 봅니다.
 *
 * `new Blob([...])` 은 바이트를 모아 두지 않고 **가리키기만** 합니다. 이어 붙인 것을
 * 잘라 읽으면 그 자리의 조각만 읽히므로, 4GB 를 나눠 담았어도 메모리로 들어오는 것은
 * 목차 몇 킬로바이트뿐입니다.
 */
export function joinParts(parts: Blob[]): Blob {
  return new Blob(parts)
}
