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
}

export const DialogContext = createContext<DialogApi | null>(null)

export function useDialogs(): DialogApi {
  const api = useContext(DialogContext)
  if (!api) throw new Error('DialogProvider 안에서만 쓸 수 있습니다.')
  return api
}
