/*
 * 동기화가 멈춘 까닭을 사람이 읽을 수 있는 꼴로 추립니다.
 *
 * `Failed to fetch` 한 줄만 적어 두었더니 무엇을 해야 할지 알 수 없었습니다. 브라우저가
 * 던지는 말은 짧고, 답이 온 경우에도 상태 코드가 글 속으로 녹아 사라집니다.
 * 받아 온 것(상태 코드·요청한 자리·GitHub 요청 번호)과 그 코드가 뜻하는 바를 함께 남깁니다.
 */

/** 요청이 어떻게 끝났는지. 화면에도 적고 기록에도 담습니다. */
export interface SyncFailure {
  /** 한 줄 요약. 접힌 줄에 그대로 적힙니다. */
  message: string
  /** HTTP 상태 코드. 답이 오지 않았으면 없습니다. */
  status?: number
  statusText?: string
  /** 어떤 요청이었는지(`GET /repos/…`). 어디서 막혔는지 가립니다. */
  request?: string
  /** GitHub 이 붙여 주는 요청 번호. 문의할 때 이것 하나면 찾아집니다. */
  requestId?: string
  /** 무엇을 해 보면 되는지 한 마디. */
  hint?: string
}

/**
 * GitHub 요청이 실패했을 때 던지는 것.
 *
 * `Error` 를 그대로 쓰면 글자만 남아, 404 인지 500 인지조차 화면에서 알 수 없습니다.
 * 메시지는 지금까지와 같게 두고(이미 여러 곳에서 그 글을 씁니다) 곁에 숫자를 답니다.
 */
export class GitHubRequestError extends Error {
  status: number
  statusText: string
  request: string
  requestId: string | null

  constructor(
    message: string,
    detail: { status: number; statusText: string; request: string; requestId: string | null },
  ) {
    super(message)
    this.name = 'GitHubRequestError'
    this.status = detail.status
    this.statusText = detail.statusText
    this.request = detail.request
    this.requestId = detail.requestId
  }
}

/**
 * 상태 코드가 뜻하는 바.
 *
 * 코드만 적어 두면 외우고 있는 사람에게만 쓸모가 있습니다. 토큰을 다시 넣어야 하는지,
 * 저장소 이름이 틀렸는지, 기다렸다 다시 하면 되는지를 가려 적습니다.
 */
export function hintFor(status: number): string | undefined {
  // 0 은 답이 아예 오지 않은 때입니다(끊긴 연결·막힌 요청).
  if (status === 0) {
    return '답이 오지 않았습니다. 인터넷이 끊겼거나, 확장 프로그램·방화벽이 api.github.com 요청을 막았을 수 있습니다.'
  }
  if (status === 401) return '토큰이 더는 통하지 않습니다. 설정 → GitHub 동기화에서 새로 넣어 주세요.'
  if (status === 403) return '그 저장소에 쓸 권한이 없거나 요청 한도를 다 썼습니다. 토큰의 Contents 권한을 보세요.'
  if (status === 404) {
    return '그 자리를 찾지 못했습니다. 계정·저장소 이름과 브랜치, 그리고 토큰이 이 저장소를 고르고 있는지 보세요.'
  }
  if (status === 409) return '저장소 쪽이 그사이 바뀌었습니다. 한 번 더 돌리면 대개 풀립니다.'
  if (status === 422) return 'GitHub 이 받아들이지 못한 내용입니다. 파일 이름이나 크기를 보세요.'
  if (status === 429) return '너무 잦습니다. 잠시 쉬었다가 다시 돌려 주세요.'
  if (status >= 500) return 'GitHub 쪽 문제입니다. 잠시 뒤에 다시 돌려 주세요.'
  return undefined
}

/** 던져진 것에서 적을 수 있는 것을 모두 추립니다. */
export function describeFailure(cause: unknown): SyncFailure {
  if (cause instanceof GitHubRequestError) {
    return {
      message: cause.message,
      status: cause.status === 0 ? undefined : cause.status,
      statusText: cause.statusText || undefined,
      request: cause.request,
      requestId: cause.requestId ?? undefined,
      hint: hintFor(cause.status),
    }
  }
  const message = cause instanceof Error ? cause.message : String(cause)
  /*
   * 브라우저가 던지는 `Failed to fetch` 는 까닭을 담지 않습니다. 코드에서 던진 말과
   * 섞이지 않도록, 그 글일 때만 연결이 끊긴 쪽으로 짚어 줍니다.
   */
  return message === 'Failed to fetch' || message === 'Load failed'
    ? { message, hint: hintFor(0) }
    : { message }
}
