import { createContext, useContext } from 'react'

export interface DialogApi {
  prompt: (options: {
    title: string
    label: string
    defaultValue?: string
    confirmText?: string
    /** 암호처럼 가려서 받을지. 앞뒤 빈칸도 그대로 둡니다. */
    secret?: boolean
  }) => Promise<string | null>
  /**
   * 숫자 몇 개를 칸마다 따로 받습니다(행·열처럼). 칸의 id 로 값을 돌려주고, 물러서면 null.
   * 비워 둔 칸은 min 으로 칩니다 — 열을 비우면 그 줄 첫 칸으로 가는 식입니다.
   */
  numbers: (options: {
    title: string
    label: string
    fields: { id: string; label: string; value: number; min: number; max?: number; suffix?: string }[]
    confirmText?: string
  }) => Promise<Record<string, number> | null>
  confirm: (options: {
    title: string
    label: string
    /**
     * 무엇이 바뀔지 줄줄이 보여 줄 목록(경로 따위). 설명(label)에 이어 붙이지 않고 따로 받는
     * 까닭은, 길어지면 **목록만 굴리고 설명은 늘 보이게** 두어야 하기 때문입니다. 접어서
     * "그 밖에 N개" 로 가리지 않습니다 — 고르기 전에 사실을 다 보여 주는 자리입니다.
     * 목록이 있으면 창도 넓게 엽니다(경로가 한 줄에 들어가야 읽힙니다).
     */
    items?: string[]
    confirmText?: string
    danger?: boolean
  }) => Promise<boolean>
  /**
   * 알림. 묻지 않고 **알리기만** 합니다. 단추는 확인 하나뿐입니다.
   *
   * 일을 모달에서 시켜 놓고 그 결과만 설정 창 본문에 적었더니, 창에 가려 보이지 않았습니다.
   * 시킨 자리에서 결과까지 받고 확인으로 닫습니다. `items` 는 결과에 딸린 목록(건너뛴 것 따위).
   */
  tell: (options: { title: string; label: string; items?: string[] }) => Promise<void>
  /**
   * 갈림길. 예/아니오로 안 되는 물음에 씁니다. 고른 단추의 id 를, 물러서면 null 을 돌려줍니다.
   * 물러서는 길(취소·Esc·바깥 누르기)은 늘 "아무것도 하지 않음" 이어야 하므로,
   * 무언가를 잃는 선택은 반드시 이름 붙은 단추로 둡니다.
   */
  choose: (options: {
    title: string
    label: string
    options: { id: string; label: string; danger?: boolean }[]
  }) => Promise<string | null>
}

export const DialogContext = createContext<DialogApi | null>(null)

export function useDialogs(): DialogApi {
  const api = useContext(DialogContext)
  if (!api) throw new Error('DialogProvider 안에서만 쓸 수 있습니다.')
  return api
}
