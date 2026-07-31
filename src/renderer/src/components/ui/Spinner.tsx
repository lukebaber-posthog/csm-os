export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-[var(--color-ink-muted)]">
      <span
        aria-hidden
        className="h-3.5 w-3.5 rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-ink)] animate-spin"
      />
      {label && <span>{label}</span>}
    </div>
  )
}
