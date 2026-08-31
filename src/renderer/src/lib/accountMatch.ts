/**
 * A lookup table from what you *write* to which account you meant.
 *
 * "Look into Exception Spike for Athena Intelligence" already names its account.
 * Making you then find that same account in a 31-row select is asking you to say
 * it twice, so the composer reads the words instead: type a name you own and its
 * chip appears in the picker, delete the name and it goes away again.
 *
 * ## Why not `text.includes(name)`
 *
 * Two reasons, and they pull in opposite directions.
 *
 * Substring matching is too *loose*: "Gloo" would match inside "glooming", and
 * every account whose name is an ordinary word would light up on prose. So a
 * match here has to start and end on a word boundary.
 *
 * Verbatim matching is too *strict*: nobody types "Boot.dev", "USMobile" and
 * "Nemours Children's Health" with the punctuation Vitally has. So both sides
 * are reduced to letters and digits only — "US Mobile", "us-mobile" and
 * "USMobile" all become `usmobile` — and the haystack is compared a word at a
 * time so those boundaries survive the reduction. Adjacent words are joined and
 * tried together, which is what lets a two-word "Work Safe BC" find the
 * one-word `worksafebc`, and a one-word `bootdev` find "Boot.dev".
 *
 * ## Aliases
 *
 * Full names are the ground truth and are always indexed. Beyond them the index
 * guesses, because in a note you write "Nemours", not "Nemours Children's
 * Health". Two guesses, both deliberately timid:
 *
 * 1. the name with generic tails stripped — "Cline Bot" → "Cline", "Athena
 *    Intelligence" → "Athena", "T3 Tools Inc." → "T3";
 * 2. the leading word on its own, when it is long and distinctive enough to
 *    carry the whole name — "Nemours", "Determinate", but never "Smart" (from
 *    Smart Access) or "Clinical" (from Clinical Notes AI).
 *
 * A guess that lands on two accounts, or on another account's real name, is
 * dropped from the index rather than resolved by coin toss. A wrong logo on a
 * card is worse than no logo, and the same is true of a wrong link.
 *
 * Names only — not domains. `logos.ts` needs a domain and takes what Salesforce
 * has, but Salesforce's domain for T3 Tools is `ping.gg`, and indexing "ping"
 * would file half a week's notes under one account.
 */

/** The two fields the matcher needs; `TodoAccount` and `Account` both have them. */
export interface MatchableAccount {
  orgId: string
  orgName: string
}

export interface AccountMatch {
  orgId: string
  orgName: string
  /** The run of text that triggered it, exactly as typed. */
  matched: string
}

export interface AccountIndex {
  /** Reduced alias → org id. An ambiguous alias is absent, never guessed at. */
  readonly byAlias: ReadonlyMap<string, string>
  readonly byOrgId: ReadonlyMap<string, MatchableAccount>
  /** How many adjacent words one alias is allowed to span. See `matchAccount`. */
  readonly maxSpan: number
}

/** Empty book, or a form rendered before the board has loaded. */
export const EMPTY_ACCOUNT_INDEX: AccountIndex = {
  byAlias: new Map(),
  byOrgId: new Map(),
  maxSpan: 1
}

/**
 * Words that carry no identity, stripped off the end of a name to get alias (1).
 *
 * Legal suffixes and the industry nouns companies append to a distinctive first
 * word. Stripping repeats, so "Foo Labs Inc" gives up both.
 *
 * Not here on purpose: `health`, `dev`, `shop` and their kind. They read as
 * generic but they are load-bearing — "Nemours Children's" is not a name anyone
 * writes, and "Boot" on its own is not Boot.dev.
 */
const GENERIC_TAIL = new Set([
  'ag',
  'agency',
  'ai',
  'analytics',
  'app',
  'apps',
  'associates',
  'bot',
  'bots',
  'bv',
  'co',
  'company',
  'consulting',
  'corp',
  'corporation',
  'digital',
  'enterprises',
  'gmbh',
  'group',
  'holding',
  'holdings',
  'inc',
  'incorporated',
  'industries',
  'intelligence',
  'interactive',
  'international',
  'io',
  'kk',
  'lab',
  'labs',
  'limited',
  'llc',
  'llp',
  'ltd',
  'media',
  'nv',
  'oy',
  'oyj',
  'partners',
  'platform',
  'platforms',
  'plc',
  'pbc',
  'pte',
  'pty',
  'sa',
  'sas',
  'software',
  'solutions',
  'spa',
  'srl',
  'studio',
  'studios',
  'systems',
  'tech',
  'technologies',
  'technology',
  'tool',
  'tools',
  'ventures',
  'worldwide'
])

/**
 * Words too ordinary to stand in for an account on their own.
 *
 * This gates the *guesses* only — a real account name is indexed whatever it is,
 * because the whole point is that writing the name links the account, and it is
 * the user's own book. It is the derived one-word aliases that need a filter,
 * since they are the index's invention: "Smart Access" is unmistakable, "smart"
 * on its own is a word in half the notes anyone writes.
 *
 * Skewed towards what actually turns up in a CSM's to-dos — the nouns of the
 * job, the adjectives of marketing, and the everyday verbs — rather than trying
 * to be a dictionary.
 */
const STOPWORDS = new Set([
  'about',
  'account',
  'accounts',
  'adoption',
  'after',
  'again',
  'alert',
  'all',
  'american',
  'analysis',
  'asset',
  'assets',
  'audit',
  'back',
  'bank',
  'base',
  'before',
  'best',
  'better',
  'big',
  'black',
  'block',
  'blue',
  'board',
  'bold',
  'book',
  'books',
  'both',
  'brand',
  'bright',
  'budget',
  'call',
  'calls',
  'capital',
  'care',
  'case',
  'cash',
  'central',
  'chain',
  'chart',
  'chat',
  'check',
  'city',
  'clean',
  'clear',
  'client',
  'clinical',
  'close',
  'cloud',
  'club',
  'code',
  'contact',
  'core',
  'cost',
  'customer',
  'data',
  'deal',
  'deals',
  'demo',
  'desk',
  'direct',
  'down',
  'draft',
  'drive',
  'each',
  'early',
  'east',
  'easy',
  'edge',
  'email',
  'energy',
  'every',
  'express',
  'fast',
  'field',
  'file',
  'files',
  'final',
  'first',
  'flow',
  'focus',
  'follow',
  'force',
  'form',
  'free',
  'from',
  'front',
  'full',
  'fund',
  'funds',
  'future',
  'general',
  'global',
  'goal',
  'gold',
  'good',
  'great',
  'green',
  'growth',
  'half',
  'hard',
  'health',
  'help',
  'high',
  'home',
  'house',
  'impact',
  'insight',
  'into',
  'issue',
  'kick',
  'last',
  'late',
  'lead',
  'leads',
  'legal',
  'level',
  'light',
  'line',
  'link',
  'list',
  'live',
  'logic',
  'long',
  'look',
  'low',
  'main',
  'make',
  'market',
  'medical',
  'meeting',
  'member',
  'message',
  'mind',
  'money',
  'more',
  'most',
  'national',
  'need',
  'network',
  'networks',
  'new',
  'next',
  'north',
  'note',
  'notes',
  'once',
  'only',
  'open',
  'order',
  'orders',
  'other',
  'over',
  'owner',
  'page',
  'pages',
  'paper',
  'park',
  'partner',
  'path',
  'people',
  'person',
  'place',
  'plan',
  'point',
  'power',
  'price',
  'prime',
  'process',
  'product',
  'profit',
  'program',
  'project',
  'pulse',
  'pure',
  'quality',
  'quick',
  'real',
  'red',
  'renewal',
  'report',
  'review',
  'revenue',
  'risk',
  'road',
  'room',
  'safe',
  'sale',
  'sales',
  'scale',
  'secure',
  'sense',
  'service',
  'services',
  'sheet',
  'short',
  'side',
  'signal',
  'silver',
  'simple',
  'small',
  'smart',
  'solution',
  'sound',
  'source',
  'south',
  'space',
  'spark',
  'speed',
  'staff',
  'star',
  'status',
  'stone',
  'store',
  'stream',
  'street',
  'strong',
  'summary',
  'super',
  'support',
  'sync',
  'system',
  'table',
  'take',
  'target',
  'task',
  'team',
  'teams',
  'them',
  'they',
  'this',
  'ticket',
  'time',
  'title',
  'today',
  'total',
  'town',
  'trade',
  'true',
  'trust',
  'ultra',
  'under',
  'united',
  'update',
  'usage',
  'user',
  'users',
  'value',
  'vendor',
  'vision',
  'voice',
  'wave',
  'week',
  'well',
  'west',
  'white',
  'work',
  'works',
  'world',
  'your'
])

/**
 * Shortest alias the index will hold. Three characters of a real name is enough
 * to be deliberate; two is an initialism that collides with everything.
 */
const MIN_NAME_LENGTH = 3

/**
 * Shortest *derived* one-word alias. Stricter than a real name, because a guess
 * has to earn its place: "Wispr" yes, "Ace" no.
 */
const MIN_TRIMMED_LENGTH = 4

/**
 * Shortest leading-word alias. Stricter again — alias (1) drops words that mean
 * nothing, alias (2) drops words that mean something, so it has more to prove.
 */
const MIN_HEAD_LENGTH = 5

/**
 * Slack in the word-span search, in words.
 *
 * An alias can be found across *more* words than it was written with, since
 * "USMobile" is one word in Vitally and two on a keyboard. Two spare words
 * covers the ways a name gets broken up in practice without walking the whole
 * sentence at every position.
 */
const SPAN_SLACK = 2

/** Hard ceiling on that search, so a pathological name cannot make it quadratic. */
const MAX_SPAN = 8

const WORD_RE = /[\p{L}\p{N}]+/gu
const COMBINING_MARK_RE = /\p{M}/gu

/** One run of letters or digits, reduced, with its place in the original text. */
interface Word {
  text: string
  start: number
  end: number
}

/**
 * The form both sides are compared in: lowercased, and with accents decomposed
 * and dropped, so "Café" from Vitally and "Cafe" from a keyboard meet in the
 * middle. Scripts without case or accents pass through untouched.
 */
function fold(word: string): string {
  return word.normalize('NFD').replace(COMBINING_MARK_RE, '').toLowerCase()
}

/**
 * Splits on everything that is not a letter or a digit. Positions are carried
 * along so a match can be quoted back the way it was typed — folding a word
 * never moves the original.
 */
function scanWords(text: string): Word[] {
  const words: Word[] = []
  for (const found of text.matchAll(WORD_RE)) {
    const start = found.index ?? 0
    words.push({ text: fold(found[0]), start, end: start + found[0].length })
  }
  return words
}

/** Drops trailing words that carry no identity, always keeping the first. */
function trimGeneric(words: string[]): string[] {
  let end = words.length
  while (end > 1 && GENERIC_TAIL.has(words[end - 1])) end--
  return words.slice(0, end)
}

/** True when a derived alias is distinctive enough to index. */
function usableGuess(words: string[], minSolo: number): boolean {
  if (words.length === 0) return false
  // Two words together are specific enough that neither has to prove itself.
  if (words.length > 1) return true
  const solo = words[0]
  return solo.length >= minSolo && /\p{L}/u.test(solo) && !STOPWORDS.has(solo)
}

/**
 * Builds the lookup table for one person's book.
 *
 * Cheap enough to call from a `useMemo` on the accounts array — a few hundred
 * string operations for a book of thirty — so nothing needs to cache it beyond
 * the render that asked for it.
 */
export function buildAccountIndex(accounts: readonly MatchableAccount[]): AccountIndex {
  const byOrgId = new Map<string, MatchableAccount>()
  /*
   * Real names and guesses are collected separately so a collision between the
   * two can be settled in the name's favour, and a collision between two guesses
   * can be thrown out. Values are arrays: length > 1 is exactly the ambiguity.
   */
  const names = new Map<string, string[]>()
  const guesses = new Map<string, string[]>()
  let maxWords = 1

  const add = (into: Map<string, string[]>, words: string[], orgId: string) => {
    const key = words.join('')
    const owners = into.get(key)
    if (owners) {
      if (!owners.includes(orgId)) owners.push(orgId)
    } else {
      into.set(key, [orgId])
    }
    maxWords = Math.max(maxWords, words.length)
  }

  for (const account of accounts) {
    if (byOrgId.has(account.orgId)) continue
    byOrgId.set(account.orgId, account)

    const words = scanWords(account.orgName).map((word) => word.text)
    const full = words.join('')
    if (full.length < MIN_NAME_LENGTH) continue
    add(names, words, account.orgId)

    const trimmed = trimGeneric(words)
    if (trimmed.length < words.length && usableGuess(trimmed, MIN_TRIMMED_LENGTH)) {
      add(guesses, trimmed, account.orgId)
    }

    const head = trimmed.slice(0, 1)
    if (trimmed.length > 1 && usableGuess(head, MIN_HEAD_LENGTH)) {
      add(guesses, head, account.orgId)
    }
  }

  const byAlias = new Map<string, string>()
  for (const [key, owners] of names) {
    if (owners.length === 1) byAlias.set(key, owners[0])
  }
  for (const [key, owners] of guesses) {
    if (owners.length === 1 && !names.has(key)) byAlias.set(key, owners[0])
  }

  return { byAlias, byOrgId, maxSpan: Math.min(MAX_SPAN, maxWords + SPAN_SLACK) }
}

/**
 * The account named in `text`, or null.
 *
 * Scanned left to right, longest first at each position, so the answer is the
 * account mentioned *earliest* — the one the note is about, rather than the one
 * mentioned in passing at the end — and "Athena Intelligence" beats the "Athena"
 * sitting inside it.
 */
export function matchAccount(index: AccountIndex, text: string): AccountMatch | null {
  if (index.byAlias.size === 0) return null

  const words = scanWords(text)

  for (let i = 0; i < words.length; i++) {
    const span = Math.min(index.maxSpan, words.length - i)
    // Joined ascending because each key extends the last, then read back
    // descending so the longest alias at this position is the one that wins.
    const keys: string[] = []
    let joined = ''
    for (let k = 0; k < span; k++) {
      joined += words[i + k].text
      keys.push(joined)
    }
    for (let k = span - 1; k >= 0; k--) {
      const orgId = index.byAlias.get(keys[k])
      if (!orgId) continue
      const account = index.byOrgId.get(orgId)
      if (!account) continue
      return {
        orgId,
        orgName: account.orgName,
        matched: text.slice(words[i].start, words[i + k].end)
      }
    }
  }

  return null
}
