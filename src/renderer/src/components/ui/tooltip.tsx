import * as React from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/** Long enough not to fire on a pointer passing through, short enough to feel answered. */
const DEFAULT_DELAY_MS = 500

function TooltipProvider({
  delayDuration = DEFAULT_DELAY_MS,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

/**
 * Self-providing, so a single tooltip does not need a provider bolted on at the
 * app root. Radix allows nested providers, so wrapping a subtree in its own
 * `TooltipProvider` to share a delay still works.
 */
function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          // `border-[var(--color-line)]`, never a bare `border`: this project has
          // no global `* { border-color }` rule, so an uncoloured border falls
          // back to currentColor — which here is ink, and draws a black box.
          'z-[80] w-fit rounded-md border border-[var(--color-line)] bg-[var(--color-raised)]',
          'px-2 py-1 text-[11px] leading-none text-[var(--color-ink)]',
          'shadow-[var(--card-shadow)]',
          'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0',
          'data-[state=delayed-open]:zoom-in-95 data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
