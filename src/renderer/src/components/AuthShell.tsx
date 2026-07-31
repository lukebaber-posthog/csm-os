import type { ReactNode } from 'react'

/** Shared frame for the sign-in and PostHog-connect steps. */
export function AuthShell({
  step,
  title,
  caption,
  children
}: {
  step: string
  title: string
  caption: string
  children: ReactNode
}) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--color-page)] px-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <div className="mb-6 flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-tight">CSM OS</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-ink-faint)]" />
            <span className="text-[12px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              {step}
            </span>
          </div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">{caption}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
