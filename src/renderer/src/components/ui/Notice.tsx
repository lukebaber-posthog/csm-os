import type { ReactNode } from 'react'

/**
 * Monochrome inline message. Severity reads through the left rule weight and
 * text emphasis rather than colour, to keep the palette black and white.
 */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  const rule = tone === 'error' ? 'border-l-[var(--color-ink)]' : 'border-l-[var(--color-line-strong)]'
  const text = tone === 'error' ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`border-l-2 ${rule} bg-[var(--color-surface)] px-3 py-2.5 text-[13px] leading-relaxed ${text}`}
    >
      {children}
    </div>
  )
}
