import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `forwardRef`, not a plain function component.
 *
 * shadcn's current source targets React 19, where `ref` is an ordinary prop and
 * a plain function component receives it. This project is on React 18, where
 * React strips `ref` before the component ever sees it — so `<Textarea ref={…}>`
 * type-checked, rendered, and silently left the ref null. Found when the note
 * toolbar needed the node to read its selection; that field is a real editor
 * now, but the next ref put on a textarea would have hit the same silence.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
