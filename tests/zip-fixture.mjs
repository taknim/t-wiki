/*
 * 시험용 zip 을 손으로 짓습니다.
 *
 * 압축하지 않고(method 0) 그대로 담되, 규격의 자리(지역 머리·중앙 디렉터리·끝자락)는
 * 그대로 갖춥니다. 라이브러리를 들이지 않으려는 것이고, 이름이 한글이거나 UTF-8 깃발이
 * 없는 경우처럼 **읽는 쪽이 가려야 하는 상황을 마음대로 지어낼 수 있기** 때문입니다.
 */

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (bytes) => {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * 윈도가 덧붙이는 NTFS 칸. 고친 때·본 때·지은 때를 1601년부터 100나노초로 적습니다.
 * 기본 기록에는 **지은 때가 없어**, 그것을 읽는지 보려면 이 칸을 손으로 달아야 합니다.
 */
function ntfsExtra(modified, created) {
  const view = new DataView(new ArrayBuffer(36))
  view.setUint16(0, 0x000a, true)
  view.setUint16(2, 32, true)
  view.setUint16(8, 0x0001, true)
  view.setUint16(10, 24, true)
  const ticks = (when) => (BigInt(when.getTime()) + 11644473600000n) * 10000n
  view.setBigUint64(12, ticks(modified), true)
  view.setBigUint64(20, ticks(modified), true)
  view.setBigUint64(28, ticks(created), true)
  return new Uint8Array(view.buffer)
}

/**
 * 압축기가 제 나라 글자 꼴로 적으면서 **원래 이름을 UTF-8 로 한 번 더** 적어 두는 칸
 * (Info-ZIP Unicode Path, 0x7075). 버전 1 + 본디 이름의 검사값 + UTF-8 이름.
 */
function unicodePathExtra(name) {
  const body = new TextEncoder().encode(name)
  const out = new Uint8Array(4 + 5 + body.length)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0x7075, true)
  view.setUint16(2, 5 + body.length, true)
  view.setUint8(4, 1)
  out.set(body, 9)
  return out
}

/**
 * @param {{name: Uint8Array|string, text?: string, utf8?: boolean, at?: Date, ntfs?: {modified: Date, created: Date}, unicodePath?: string}[]} items
 * @returns {Uint8Array}
 */
export function makeZip(items) {
  const chunks = []
  const central = []
  let offset = 0

  for (const item of items) {
    const name = typeof item.name === 'string' ? new TextEncoder().encode(item.name) : item.name
    const body = new TextEncoder().encode(item.text ?? '')
    const when = item.at ?? new Date(2026, 8, 30, 12, 30, 0)
    const time = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2)
    const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
    const flags = item.utf8 === false ? 0 : 0x800
    const sum = crc32(body)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, flags, true)
    local.setUint16(8, 0, true)
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, sum, true)
    local.setUint32(18, body.length, true)
    local.setUint32(22, body.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    chunks.push(new Uint8Array(local.buffer), name, body)

    const stamps = item.ntfs ? ntfsExtra(item.ntfs.modified, item.ntfs.created) : new Uint8Array(0)
    const told = item.unicodePath ? unicodePathExtra(item.unicodePath) : new Uint8Array(0)
    const extra = new Uint8Array(stamps.length + told.length)
    extra.set(stamps, 0)
    extra.set(told, stamps.length)
    const record = new DataView(new ArrayBuffer(46))
    record.setUint32(0, 0x02014b50, true)
    record.setUint16(4, 20, true)
    record.setUint16(6, 20, true)
    record.setUint16(8, flags, true)
    record.setUint16(10, 0, true)
    record.setUint16(12, time, true)
    record.setUint16(14, date, true)
    record.setUint32(16, sum, true)
    record.setUint32(20, body.length, true)
    record.setUint32(24, body.length, true)
    record.setUint16(28, name.length, true)
    record.setUint16(30, extra.length, true)
    record.setUint32(42, offset, true)
    central.push(new Uint8Array(record.buffer), name, extra)
    offset += 30 + name.length + body.length
  }

  const directory = central.reduce((sum, one) => sum + one.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, items.length, true)
  end.setUint16(10, items.length, true)
  end.setUint32(12, directory, true)
  end.setUint32(16, offset, true)

  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const size = all.reduce((sum, one) => sum + one.length, 0)
  const out = new Uint8Array(size)
  let at = 0
  for (const one of all) {
    out.set(one, at)
    at += one.length
  }
  return out
}
