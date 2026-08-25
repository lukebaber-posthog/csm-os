import { useEffect, useRef, type RefObject } from 'react'

/**
 * Portalled Radix surfaces. A click on a select option is outside the form's
 * subtree in the DOM but very much inside it as far as the user is concerned, so
 * without this, choosing an account closes the composer you were choosing it for.
 *
 * Both selectors are needed. `position="popper"` content lands inside the popper
 * wrapper; the `item-aligned` positioning this app's selects actually use does
 * not, so the second one catches those.
 */
const PORTAL = '[data-radix-popper-content-wrapper],[data-slot="select-content"],[role="dialog"]'

/** Any select popup currently mounted anywhere. */
const OPEN_POPUP = '[data-slot="select-content"]'

/**
 * Closes something when a pointer press lands outside it.
 *
 * This is what replaced the composer's Cancel button. Clicking away is what you
 * do to an abandoned draft anyway, so the button was a second way to say the
 * same thing taking up a third of the form's action row.
 *
 * Pointerdown rather than click, and on the capture phase: it has to win against
 * the thing being clicked. In particular the column's own + button toggles the
 * composer, so if it fired first this would then reopen what it had just closed.
 * Capture-phase means we close first and the toggle sees the composer still open
 * and closes it again — one net close, either order of state updates.
 *
 * `onDismiss` is held in a ref so the listener is attached once per open rather
 * than re-attached on every render of a board that re-renders on every drag frame.
 */
export function useOutsideDismiss(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onDismiss: () => void
): void {
  const latest = useRef(onDismiss)
  useEffect(() => {
    latest.current = onDismiss
  })

  useEffect(() => {
    if (!enabled) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (ref.current?.contains(target)) return
      if (target.closest(PORTAL)) return
      /*
       * Belt and braces for the select. Radix puts `pointer-events: none` on the
       * body while a select is open, which can land the press on <html> — outside
       * both the form and the portal, and so indistinguishable from a genuine
       * click away. If any popup is open at all, it owns this press.
       */
      if (document.querySelector(OPEN_POPUP)) return
      latest.current()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [ref, enabled])
}
