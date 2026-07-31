import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md text-[13px] font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)] focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-[var(--color-page)] disabled:opacity-40 disabled:pointer-events-none'

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-ink)] text-[var(--color-page)] px-4 h-9 hover:opacity-85 active:opacity-75',
  secondary:
    'border border-[var(--color-line-strong)] px-4 h-9 hover:bg-[var(--color-surface)] text-[var(--color-ink)]',
  ghost:
    'px-2.5 h-8 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)]',
  danger:
    'px-2.5 h-8 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] underline decoration-dotted'
}

export function Button({ variant = 'primary', className = '', children, ...rest }: Props) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}
