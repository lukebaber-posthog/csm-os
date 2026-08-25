import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge resolves conflicts against its **own** bundled copy of
 * Tailwind's default theme, not against styles.css. So an @theme entry there is
 * invisible to it: cn('ease-out', 'ease-swift') would emit both classes and let
 * CSS source order pick the winner — a conflict that only surfaces on the one
 * element where two easings happen to meet. Teaching it the custom values costs
 * six lines and removes the whole class of bug.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      ease: ['swift'],
      animate: ['fx-shard', 'fx-grain', 'fx-ring'],
      // Without this, cn('shadow-xs', 'shadow-field') keeps both: the form
      // fields override shadcn's default shadow, and the two would land on the
      // same element with source order deciding.
      shadow: ['field', 'field-dark']
    }
  }
})

/** shadcn's class helper: conditional classes, with later utilities winning. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
