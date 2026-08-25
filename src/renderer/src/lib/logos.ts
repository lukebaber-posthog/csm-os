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
 * **Domain, not company name.** logo.dev will resolve `name/Moonshot`, but it
 * answers confidently rather than accurately: it returns a different company's
 * mark for 5 of the 31 accounts in this book and a real logo even for invented
 * names like "Aaaa Bbbb Cccc" (`fallback=404` does not save you — the name path
 * still calls that a hit). A wrong logo on a customer's card is worse than no
 * logo, so lookups go by domain, where a miss really does 404.
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
 * Where Salesforce's `Domain__c` points at the wrong company, keyed by Vitally
 * organization id.
 *
 * The domain that ships with the account is right about 90% of the time and is
 * what makes this work for everyone's book without maintenance — this map is
 * only for the ones caught being wrong, so it stays short. Silencer Shop's
 * Salesforce domain returns BrandCave's wordmark and T3's returns a stock
 * cloud-platform screenshot; the other two have no domain in Salesforce at all.
 *
 * Add a line here when a card wears someone else's mark. Nothing breaks if an
 * id here is not in your book — it simply never matches.
 */
const DOMAIN_FIXES: Record<string, string> = {
  '0190b770-0568-0000-6f70-4bfc58c93ebd': 'silencershop.com', // was brandcave.co
  '018a0719-b6b2-0000-1cdd-1dba07e61b1b': 'ping.gg', // T3 Tools, was ping.cash
  '0198a8eb-c178-0000-b015-d688667ed32d': 'openpractice.net', // no Salesforce domain
  '019580ae-d173-0000-58ac-c3d15956848e': 'trustlayer.io' // no Salesforce domain
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
export function logoUrl(orgId: string, domain: string | null | undefined): string | null {
  const resolved = DOMAIN_FIXES[orgId] ?? domain
  if (!TOKEN || !resolved) return null
  return `https://img.logo.dev/${encodeURIComponent(resolved)}?token=${TOKEN}&${PARAMS}`
}

/** Where the free tier's attribution link has to point. See SettingsDialog. */
export const LOGO_ATTRIBUTION_URL = 'https://logo.dev'
