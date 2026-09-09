import * as React from 'react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * The shadcn dropdown menu, trimmed to the parts this app uses and repainted in
 * the project's own tokens rather than shadcn's defaults.
 *
 * Note every border names its colour. This project has no global
 * `* { border-color }` rule — see the comment in `styles.css` for why — so a bare
 * `border` falls back to `currentColor`, which in a popover is ink and draws a
 * hard black box. The select popup shipped that way once.
 */

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-[80] min-w-[200px] overflow-hidden rounded-lg border border-[var(--color-line)]',
          'bg-[var(--color-raised)] p-1 shadow-[var(--card-shadow-lift)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  /** Renders the row in the one hue the app keeps for destructive actions. */
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: 'default' | 'destructive'
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2.5 rounded-md px-2 py-1.5',
        'text-[13px] outline-none transition-colors',
        'focus:bg-[var(--color-surface)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        // Sized here rather than left to the primitive, so an icon cannot arrive
        // at whatever its own default happens to be.
        '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        variant === 'destructive'
          ? 'text-destructive [&_svg]:text-destructive focus:bg-destructive/10'
          : 'text-[var(--color-ink)] [&_svg]:text-[var(--color-ink-faint)]',
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('px-2 py-1.5 text-[11px] text-[var(--color-ink-faint)]', className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-[var(--color-line)]', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
}
