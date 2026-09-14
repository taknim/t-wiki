/*
 * 브라우저 저장소를 들여다보는 손.
 *
 * 토큰은 화면에 별표로만 나오므로, 값이 제대로 들어갔는지는 저장소를 직접 열어
 * 봐야 합니다. 봉해 둔 것은 같은 출처의 열쇠로 풀어 견줍니다. 열쇠는 꺼낼 수
 * 없지만(extractable: false) 푸는 데는 쓸 수 있습니다 — 앱이 하는 일과 같습니다.
 *
 * addInitScript 로 넣고 page.evaluate 에서 부릅니다.
 */
window.__peekIdb = async (name) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    if (!db.objectStoreNames.contains('keyval')) return undefined
    return await new Promise((resolve, reject) => {
      const request = db.transaction('keyval', 'readonly').objectStore('keyval').get(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

/**
 * 폴더별 GitHub 설정. 토큰은 풀어서 돌려주고, 봉해져 있었는지도 함께 밝힙니다.
 *   { [vault]: { ...config, token: '풀린 값', sealed: true|false } }
 */
window.__githubConfigs = async () => {
  const configs = (await window.__peekIdb('mdwiki:github-config')) ?? {}
  const key = await window.__peekIdb('mdwiki:secret-key')
  const bytes = (text) => Uint8Array.from(atob(text), (one) => one.charCodeAt(0))

  const out = {}
  for (const [vault, config] of Object.entries(configs)) {
    const sealed = Boolean(config.token) && typeof config.token === 'object'
    let token = config.token
    if (sealed) {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes(config.token.iv) }, key, bytes(config.token.data))
      token = new TextDecoder().decode(plain)
    }
    out[vault] = { ...config, token, sealed }
  }
  return out
}

/** 열쇠가 어떤 꼴인지. 꺼낼 수 있는 열쇠라면 봉한 뜻이 없습니다. */
window.__secretKey = async () => {
  const key = await window.__peekIdb('mdwiki:secret-key')
  if (!key) return null
  return { algorithm: key.algorithm?.name, length: key.algorithm?.length, extractable: key.extractable }
}

/**
 * 폴더 이름으로 그 폴더의 GitHub 설정을 찾습니다. 시험대의 가짜 폴더는 이름이 겹치지
 * 않으므로 이름만으로 가려낼 수 있습니다. 없으면 null.
 */
window.__githubConfigFor = async (name) => {
  const refs = (await window.__peekIdb('mdwiki:vault-keys')) ?? []
  const ref = refs.find((one) => one.handle?.name === name)
  if (!ref) return null
  return (await window.__githubConfigs())[ref.key] ?? null
}
