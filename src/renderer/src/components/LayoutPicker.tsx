import { useEffect, useRef, useState } from 'react'
import { LAYOUTS, layoutDef } from '../lib/layouts'

interface Props {
  value: string
  onChange: (layoutKey: string) => void
}

/**
 * Switches which set of columns the board shows. Each layout keeps its own
 * placements, so switching back and forth never loses either arrangement.
 */
export function LayoutPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = layoutDef(value)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch board layout"
        className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-line-strong)] px-2.5 text-[12px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
      >
        <span className="text-[var(--color-ink-muted)]">Layout</span>
        <span>{current.label}</span>
        <span aria-hidden className="text-[9px] text-[var(--color-ink-faint)]">
          ▼
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-[248px] overflow-hidden rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-raised)] shadow-xl"
        >
          {LAYOUTS.map((l) => {
            const selected = l.key === value
            return (
              <button
                key={l.key}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false)
                  if (!selected) onChange(l.key)
                }}
                className={
                  'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface)] ' +
                  (selected ? 'bg-[var(--color-surface)]' : '')
                }
              >
                <span
                  aria-hidden
                  className="mt-[3px] w-3 shrink-0 text-[11px] text-[var(--color-ink)]"
                >
                  {selected ? '✓' : ''}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{l.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-ink-muted)]">
                    {l.hint} · {l.stages.length} columns
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
