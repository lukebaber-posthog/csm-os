import { forwardRef, type InputHTMLAttributes } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={
          'w-full h-10 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-raised)] ' +
          'px-3 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] ' +
          'focus:outline-none focus:border-[var(--color-ink)] transition-colors ' +
          className
        }
        {...rest}
      />
    )
  }
)
