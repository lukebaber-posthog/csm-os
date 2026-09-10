import type { CSSProperties } from 'react'
import { rgbOf, type CardColor } from '../../../core/colors'

/*
 * The palette itself lives in `src/core/colors`, shared with the MCP server.
 * What stays here is the one piece that is painting rather than data: a React
 * style object, which a headless caller has no use for.
 */
export * from '../../../core/colors'

/**
 * The card's surface: background, border, and shadow.
 *
 * Alphas come from CSS custom properties rather than being baked in here, so a
 * single RGB triple yields a tint that works on both the light and dark surface.
 * Inline styles outrank Tailwind utilities, which is what lets the tint replace
 * `bg-[var(--color-raised)]` without a global override.
 */
export function cardSurfaceStyle(color: CardColor | null, lifted = false): CSSProperties {
  const base = lifted ? 'var(--card-shadow-lift)' : 'var(--card-shadow)'
  if (!color) return { boxShadow: base }

  const rgb = rgbOf(color)
  return {
    backgroundColor: `rgb(${rgb} / var(--card-tint-alpha))`,
    borderColor: `rgb(${rgb} / var(--card-border-alpha))`,
    // Base depth plus a glow in the card's own hue.
    boxShadow: `${base}, 0 4px 10px -4px rgb(${rgb} / var(--card-glow-alpha))`
  }
}
