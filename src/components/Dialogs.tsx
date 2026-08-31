import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DialogContext, type DialogApi } from './dialogContext'

interface PromptRequest {
  kind: 'prompt'
  title: string
  label: string
  defaultValue: string
  confirmText: string
}

interface ConfirmRequest {
  kind: 'confirm'
  title: string
  label: string
  confirmText: string
  danger: boolean
}

type Request = (PromptRequest | ConfirmRequest) & {
  settle: (value: string | boolean | null) => void
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 초기값은 다이얼로그를 여는 쪽에서 미리 넣어두므로, 여기서는 선택만 해줍니다.
  useEffect(() => {
    if (request?.kind === 'prompt') {
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [request])

  const api = useMemo<DialogApi>(
    () => ({
      prompt: ({ title, label, defaultValue = '', confirmText = '확인' }) =>
        new Promise<string | null>((resolve) => {
          setValue(defaultValue)
          setRequest({
            kind: 'prompt',
            title,
            label,
            defaultValue,
            confirmText,
            settle: (result) => resolve(typeof result === 'string' ? result : null),
          })
        }),
      confirm: ({ title, label, confirmText = '확인', danger = false }) =>
        new Promise<boolean>((resolve) => {
          setRequest({
            kind: 'confirm',
            title,
            label,
            confirmText,
            danger,
            settle: (result) => resolve(result === true),
          })
        }),
    }),
    [],
  )

  const close = useCallback(
    (result: string | boolean | null) => {
      request?.settle(result)
      setRequest(null)
    },
    [request],
  )

  const submit = useCallback(() => {
    if (!request) return
    if (request.kind === 'prompt') {
      const trimmed = value.trim()
      if (!trimmed) return
      close(trimmed)
    } else {
      close(true)
    }
  }, [close, request, value])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request && (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(null)
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label={request.title}>
            <h2>{request.title}</h2>
            <p className="dialog-label">{request.label}</p>
            {request.kind === 'prompt' && (
              <input
                ref={inputRef}
                className="dialog-input"
                value={value}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit()
                  if (event.key === 'Escape') close(null)
                }}
              />
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="btn"
                data-tip="아무것도 바꾸지 않고 닫습니다 (Esc)"
                onClick={() => close(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={request.kind === 'confirm' && request.danger ? 'btn btn-danger' : 'btn btn-primary'}
                data-tip={
                  request.kind === 'confirm' && request.danger
                    ? '되돌릴 수 없습니다'
                    : '입력한 대로 진행합니다 (Enter)'
                }
                onClick={submit}
                autoFocus={request.kind === 'confirm'}
              >
                {request.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
