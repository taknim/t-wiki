import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DialogContext, type DialogApi } from './dialogContext'
import { useEscapeClose } from '../hooks/useEscapeClose'

interface PromptRequest {
  kind: 'prompt'
  title: string
  label: string
  defaultValue: string
  confirmText: string
  secret: boolean
}

interface NumbersRequest {
  kind: 'numbers'
  title: string
  label: string
  fields: { id: string; label: string; value: number; min: number; max?: number }[]
  confirmText: string
}

interface ConfirmRequest {
  kind: 'confirm'
  title: string
  label: string
  confirmText: string
  danger: boolean
}

interface ChooseRequest {
  kind: 'choose'
  title: string
  label: string
  options: { id: string; label: string; danger?: boolean }[]
}

type Answer = string | boolean | Record<string, number> | null

type Request = (PromptRequest | NumbersRequest | ConfirmRequest | ChooseRequest) & {
  settle: (value: Answer) => void
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null)
  const [value, setValue] = useState('')
  // 숫자 칸들의 글. 숫자로 바꾸는 것은 답할 때 한 번에 합니다. 치는 도중의 빈칸을 거절하지 않으려고요.
  const [values, setValues] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  // 초기값은 다이얼로그를 여는 쪽에서 미리 넣어두므로, 여기서는 선택만 해줍니다.
  useEffect(() => {
    if (request?.kind === 'prompt' || request?.kind === 'numbers') {
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [request])

  const api = useMemo<DialogApi>(
    () => ({
      prompt: ({ title, label, defaultValue = '', confirmText = '확인', secret = false }) =>
        new Promise<string | null>((resolve) => {
          setValue(defaultValue)
          setRequest({
            kind: 'prompt',
            title,
            label,
            defaultValue,
            confirmText,
            secret,
            settle: (result) => resolve(typeof result === 'string' ? result : null),
          })
        }),
      numbers: ({ title, label, fields, confirmText = '확인' }) =>
        new Promise<Record<string, number> | null>((resolve) => {
          setValues(Object.fromEntries(fields.map((field) => [field.id, String(field.value)])))
          setRequest({
            kind: 'numbers',
            title,
            label,
            fields,
            confirmText,
            settle: (result) => resolve(result !== null && typeof result === 'object' ? result : null),
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
      choose: ({ title, label, options }) =>
        new Promise<string | null>((resolve) => {
          setRequest({
            kind: 'choose',
            title,
            label,
            options,
            settle: (result) => resolve(typeof result === 'string' ? result : null),
          })
        }),
    }),
    [],
  )

  const close = useCallback(
    (result: Answer) => {
      request?.settle(result)
      setRequest(null)
    },
    [request],
  )

  /*
   * 확인 창은 늘 그려 두고 값으로만 여닫으므로, 뜨는 그때 Esc 줄에 들어갑니다.
   * 취소 단추도 (Esc) 라고 적어 두었으니 실제로도 그렇게 되어야 합니다.
   */
  useEscapeClose(useCallback(() => close(null), [close]), request !== null)

  const submit = useCallback(() => {
    if (!request) return
    if (request.kind === 'prompt') {
      // 암호는 빈칸까지 값입니다. 이름은 앞뒤 빈칸을 뗍니다.
      const answer = request.secret ? value : value.trim()
      if (!answer) return
      close(answer)
    } else if (request.kind === 'numbers') {
      const answer: Record<string, number> = {}
      for (const field of request.fields) {
        const parsed = Number.parseInt(values[field.id] ?? '', 10)
        const floored = Number.isNaN(parsed) ? field.min : Math.max(field.min, parsed)
        answer[field.id] = field.max === undefined ? floored : Math.min(floored, field.max)
      }
      close(answer)
    } else if (request.kind === 'confirm') {
      close(true)
    }
    // 갈림길에는 Enter 로 고를 기본 답이 없습니다. 무엇을 잃을지 읽고 눌러야 합니다.
  }, [close, request, value, values])

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
                type={request.secret ? 'password' : 'text'}
                autoComplete={request.secret ? 'new-password' : undefined}
                value={value}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit()
                  if (event.key === 'Escape') close(null)
                }}
              />
            )}
            {request.kind === 'numbers' && (
              <div className="dialog-fields">
                {request.fields.map((field, at) => (
                  <label key={field.id} className="dialog-field">
                    <span>{field.label}</span>
                    <input
                      ref={at === 0 ? inputRef : undefined}
                      className="dialog-input"
                      type="number"
                      inputMode="numeric"
                      min={field.min}
                      max={field.max}
                      value={values[field.id] ?? ''}
                      autoFocus={at === 0}
                      onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') submit()
                        if (event.key === 'Escape') close(null)
                      }}
                    />
                  </label>
                ))}
              </div>
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
              {request.kind === 'choose' ? (
                request.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={option.danger ? 'btn btn-danger' : 'btn btn-primary'}
                    onClick={() => close(option.id)}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
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
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
