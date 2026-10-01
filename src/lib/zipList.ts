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
 * 이름을 글자로 옮깁니다.
 *
 * 규격은 UTF-8 깃발이 섰을 때만 UTF-8 이고 그 밖에는 CP437 이라고 하지만, 우리나라에서
 * 만든 압축은 대개 CP949(EUC-KR) 로 적혀 있습니다. 깃발이 없고 ASCII 를 벗어난 바이트가
 * 있으면 EUC-KR 로 읽습니다 — CP437 로 읽으면 한글 이름이 모두 깨집니다.
 */
export function decodeName(raw: Uint8Array, utf8: boolean): string {
  if (utf8) return new TextDecoder('utf-8').decode(raw)
  if (raw.every((byte) => byte < 0x80)) return new TextDecoder('utf-8').decode(raw)
  try {
    return new TextDecoder('euc-kr').decode(raw)
  } catch {
    return new TextDecoder('utf-8').decode(raw)
  }
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

/** 목차를 읽어 항목을 늘어놓습니다. */
export function readEntries(directory: Uint8Array, count: number, limit = MAX_ZIP_ENTRIES): ZipListing {
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength)
  const entries: ZipEntry[] = []
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
    const name = decodeName(directory.subarray(at + 46, at + 46 + nameLength), (flags & 0x800) !== 0)
    const extra = readExtra(directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength))
    seen += 1
    if (entries.length < limit) {
      entries.push({
        path: name,
        bytes,
        packed,
        // 덧붙은 칸이 더 촘촘합니다(MS-DOS 꼴은 2초 단위). 있으면 그쪽을 씁니다.
        at: extra.at ?? dosTime(date, time),
        created: extra.created,
        dir: name.endsWith('/'),
      })
    }
    at += 46 + nameLength + extraLength + commentLength
  }

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
