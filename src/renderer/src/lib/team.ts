/**
 * Who is allowed to sign in.
 *
 * The gate is the email domain rather than a table of approved names. A
 * per-person allowlist gated nothing useful — the board shows whatever PostHog
 * returns for the signed-in email, and reaching PostHog at all needs a personal
 * API key with access to the project, which is the credential that actually
 * matters. All the allowlist did was require a row to be inserted by hand before
 * a new teammate could open the app.
 */

/** The one domain that can sign in. */
export const TEAM_DOMAIN = 'posthog.com'

/**
 * Anchored, and the local part is restricted rather than matched with `.+`, so a
 * nested address like `someone@elsewhere.com@posthog.com` cannot pass the way it
 * would through a naive "ends with the domain" test. Lowercase-only because it
 * runs on `normalizeEmail` output.
 */
const TEAM_EMAIL = new RegExp(`^[a-z0-9._%+-]+@${TEAM_DOMAIN.replaceAll('.', '\\.')}$`)

/**
 * The form every downstream table stores and every PostHog query filters on.
 * Applied once at sign-in so nothing further down has to think about case.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** True for a PostHog address. Expects `normalizeEmail` output. */
export function isTeamEmail(email: string): boolean {
  return TEAM_EMAIL.test(email)
}
