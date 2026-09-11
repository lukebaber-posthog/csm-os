/**
 * Account logos, served by [logo.dev](https://logo.dev) from each account's own
 * website domain.
 *
 * This replaced a scraper (`scripts/fetch-logos.mjs`) that walked every
 * account's site for an apple-touch-icon and committed the result to
 * `assets/logos/`. That worked for exactly one person's book: the logos were
 * bundled by org id, so a new account showed a monogram until someone re-ran
 * the script, and every other CSM's board was monograms all the way down. A
 * URL built at render time has neither problem.
 *
 * **Domain, not company name.** logo.dev will resolve a `name/` lookup, but it
 * answers confidently rather than accurately: it returns a different company's
 * mark for 5 of the 31 accounts in one book and a real logo even for invented
 * names like "Aaaa Bbbb Cccc" (`fallback=404` does not save you — the name path
 * still calls that a hit). A wrong logo on a customer's card is worse than no
 * logo, so lookups go by domain, where a miss really does 404.
 *
 * **The domain comes from PostHog, and only from PostHog.** There used to be a
 * map here of org id to domain, for the handful of accounts whose Salesforce
 * record pointed at the wrong company. It was the wrong shape twice over: it
 * hardcoded customers into the repo, and it was a private fix that only helped
 * whoever edited it — every other CSM's board kept the wrong mark. Correcting
 * the account's `website_domain` in PostHog now fixes it for everyone, which is
 * why `main/posthog.ts` reads that property ahead of the Salesforce one.
 */

/**
 * Publishable key — client-side by design, which is why it sits in `.env`
 * beside the Supabase one rather than in the keychain with the PostHog key.
 *
 * Absent, every card falls back to its monogram rather than firing requests
 * that would 401. That is a quiet failure, so it says so once in the console:
 * a board of monograms otherwise looks like logo.dev is down.
 */
const TOKEN = import.meta.env.VITE_PUBLIC_LOGO_DEV_API

if (!TOKEN) {
  console.warn(
    'VITE_PUBLIC_LOGO_DEV_API is not set — account cards will show monograms ' +
      'instead of logos. Copy it from .env.example.'
  )
}

/**
 * One size for every tile rather than one per call site. The chip renders at
 * 16px and 24px, so 128 is already generous at 2×, and asking for a single size
 * means the card and the select row share a cache entry instead of pulling the
 * same mark twice. logo.dev sets `max-age=86400`, so this is one request per
 * account per day.
 *
 * `png` because a JPEG cannot be transparent and roughly half of these marks
 * are; `theme=light` because the tile behind them is white in both themes;
 * `fallback=404` so a miss fails the `<img>` and hands over to the monogram
 * instead of quietly substituting logo.dev's own monogram, which does not match
 * this app's.
 */
const PARAMS = 'size=128&format=png&theme=light&fallback=404'

/**
 * The account's logo URL, or null when there is nothing to look it up by — in
 * which case `AccountChip` draws the monogram.
 */
export function logoUrl(domain: string | null | undefined): string | null {
  if (!TOKEN || !domain) return null
  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=${TOKEN}&${PARAMS}`
}

/** Where the free tier's attribution link has to point. See SettingsDialog. */
export const LOGO_ATTRIBUTION_URL = 'https://logo.dev'
