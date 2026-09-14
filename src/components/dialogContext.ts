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
  confirm: (options: {
    title: string
    label: string
    confirmText?: string
    danger?: boolean
  }) => Promise<boolean>
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
