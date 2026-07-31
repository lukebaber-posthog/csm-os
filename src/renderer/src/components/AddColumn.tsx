import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_COLUMNS } from '../lib/layouts'

interface Props {
  canAdd: boolean
  count: number
  onAdd: (label: string) => void
}

/** Trailing panel at the right-hand end of the board for adding a column. */
export function AddColumn({ canAdd, count, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setLabel('')
    setOpen(false)
  }

  if (!canAdd) {
    return (
      <div className="flex h-full w-[150px] shrink-0 items-start pt-[30px]">
        <p className="px-2 text-[11px] leading-snug text-[var(--color-ink-faint)]">
          {count} of {MAX_COLUMNS} columns. Delete one to add another.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-[176px] shrink-0 flex-col">
      <div className="mb-2.5 h-[18px] px-1" />
      {open ? (
        <form
          onSubmit={submit}
          className="rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-raised)] p-2"
        >
          <input
            ref={inputRef}
            value={label}
            maxLength={40}
            placeholder="Column name"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setLabel('')
                setOpen(false)
              }
            }}
            onBlur={() => {
              if (!label.trim()) setOpen(false)
            }}
            className="w-full border-b border-[var(--color-line-strong)] bg-transparent pb-1 text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink)] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-ink)] focus:outline-none"
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="submit"
              disabled={!label.trim()}
              className="h-7 flex-1 rounded bg-[var(--color-ink)] text-[11px] font-medium text-[var(--color-page)] hover:opacity-85 disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setLabel('')
                setOpen(false)
              }}
              className="h-7 rounded px-2 text-[11px] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          title={`Add a column (${count} of ${MAX_COLUMNS})`}
          className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-line-strong)] text-[12px] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
        >
          <span aria-hidden className="text-[14px] leading-none">
            +
          </span>
          Add column
        </button>
      )}
    </div>
  )
}
