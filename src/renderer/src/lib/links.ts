/**
 * Turning text a human typed into an href, safely.
 *
 * Its own module rather than living beside one of its callers: both a logged
 * touch on the `link` channel and a to-do can carry a URL, and the rule for what
 * is safe to open must not differ between them.
 */

function parse(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * The href to hang on a typed link, or null when there isn't a safe one.
 *
 * Two jobs, and both are load-bearing:
 *
 *  - **Fill in the scheme.** Pasting a URL usually brings one, but typing one
 *    ("posthog.com/docs") does not, and a bare host in an `href` is read as a
 *    *relative* path — the renderer would navigate itself to a file that isn't
 *    there rather than open a browser.
 *  - **Refuse anything that isn't http(s).** This is an Electron renderer with
 *    the app's own origin, so a `javascript:` href typed into a field would run
 *    there. Every URL the user can type reaches an href through this function,
 *    so this is the whole boundary.
 *
 * The order matters. Anything that parses as a URL is judged on its protocol
 * and gets no second chance, so `javascript:`, `data:`, `file:` and `mailto:`
 * are refused rather than retried — retrying them is how you turn
 * `mailto:a@b.com` into a valid `https://mailto:a@b.com`, credentials and all.
 * Only text that is not a URL at all is tried as a bare host, and only when it
 * has no `//` of its own to splice into the scheme being added.
 *
 * The cost of that order is that `localhost:3000` reads as a URL with a
 * `localhost:` protocol and so is refused. Worth it: these fields hold links you
 * sent a customer or want to reopen, and the alternative rule cannot tell a dev
 * port from a scheme you would rather not open.
 *
 * Returns the parsed `href`, not the raw text — normalised and, more to the
 * point, unambiguous about what will actually be opened.
 */
export function linkHref(raw: string | null | undefined): string | null {
  const text = raw?.trim()
  if (!text) return null

  const direct = parse(text)
  if (direct) {
    return direct.protocol === 'http:' || direct.protocol === 'https:' ? direct.href : null
  }

  if (text.includes('//')) return null
  const guessed = parse(`https://${text}`)
  return guessed?.protocol === 'https:' ? guessed.href : null
}
