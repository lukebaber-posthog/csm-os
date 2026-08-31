# CSM OS

A desktop board for tracking outreach across a PostHog CSM book of business.
Accounts are read live from PostHog; where each account sits on the board and
every logged touch live in Supabase.

## Getting started

### Before you start

- **Node 20 or newer, and pnpm.** `corepack enable` gets you pnpm if you don't
  already have it.
- **A PostHog personal API key** with the `query:read` scope, scoped to the
  **PostHog App + Website** project. Create one at
  [PostHog → Personal API keys](https://us.posthog.com/settings/user-api-keys).
  This goes into the app, not into `.env`.
- **The Supabase URL and publishable key** for the board database. Ask whoever
  set it up, or read them off **Settings → API** if you have access to the
  project.

### 1. Install

```bash
git clone git@github.com:lukebaber-posthog/csm-os.git
cd csm-os
pnpm install
```

### 2. Fill in `.env`

```bash
cp .env.example .env
```

Two values are required. Both are read by the renderer at build time:

| Variable | Where it comes from | Looks like |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL | `https://abcdefgh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → publishable key | `sb_publishable_…` |

One more is optional. Without it the app runs fine, but every card shows a
monogram instead of the account's logo (and says so once in the console):

| Variable | Where it comes from | Looks like |
| --- | --- | --- |
| `VITE_PUBLIC_LOGO_DEV_API` | [logo.dev](https://logo.dev) publishable key | `pk_…` |

Miss either one and **the app opens to a blank white window** — Vite inlines
these at build time, so the build still succeeds and the renderer throws on
load. There is no on-screen error; open the devtools console (View → Toggle
Developer Tools) and you'll find:

```
Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.
Copy .env.example to .env and fill them in.
```

A blank window on first run almost always means `.env`.

Two more are optional, commented out in `.env.example`, and read by the **main**
process rather than the renderer:

| Variable | Default | Change it when |
| --- | --- | --- |
| `POSTHOG_HOST` | `https://us.posthog.com` | You're querying EU cloud |
| `POSTHOG_PROJECT_ID` | `2` | The Vitally view lives in another project |

`.env` is gitignored; `.env.example` is the checked-in template, so a new
variable belongs in both. Restart `pnpm dev` after editing `.env`.

> Pointing at your **own** Supabase project rather than a shared one takes more
> than swapping these two values — the schema is not checked in as migration
> files, so the tables, the RLS policies, and the `reorder_board_stages` /
> `delete_board_stage` RPCs would have to be recreated first.

### 3. Start it

```bash
pnpm dev
```

| Script | What it does |
| --- | --- |
| `pnpm dev` | Dev server with hot reload — the one you want day to day |
| `pnpm typecheck` | Both tsconfigs, no emit |
| `pnpm build` | Bundles main, preload, and renderer into `out/` |
| `pnpm start` | Runs the built bundle (needs `pnpm build` first) |
| `pnpm package` | Unpacked macOS `.app` via electron-builder |

### 4. Sign in

Two screens, once:

1. **Sign in** with your PostHog email. Any `@posthog.com` address works — no
   password, no emailed code, no list to be added to, and your `csm_users` row
   is created for you on the spot. The email is what scopes the board: every
   Supabase row is keyed by it and the account query filters on it, so two
   people on one machine get two separate boards.
2. **Connect PostHog** by pasting the personal API key from above. It is
   encrypted into the OS keychain via Electron `safeStorage` and is only ever
   read by the main process — the renderer cannot access it.

The board then loads your accounts and the header says how many. Both steps are
remembered, so later launches open straight onto the board; signing out clears
your email but keeps the key, so you don't re-paste it.

**If the board comes up empty**, the sign-in worked and the lookup found
nothing. Assignment is read from Vitally's `customer_success_manager` field —
see [Where the accounts come from](#where-the-accounts-come-from) — so accounts
you cover only as a TAM overlay won't appear.

### Make it your own

The board is already scoped to whoever signs in, but the *features* are still
whatever happened to be useful to one person. Take a copy and build what you
actually need:

```bash
git checkout -b <your-name>/main
```

Very little here is load-bearing opinion. Columns and layouts are data rather
than code (`lib/layouts.ts`), the to-do kinds are a three-value CHECK you can
extend, and every PostHog read is one HogQL string in `src/main/posthog.ts`. If
you want a renewal-date column, a Slack digest, a different definition of
"stale", or a second board entirely — add it.
[Notes for future changes](#notes-for-future-changes) exists for exactly this:
it is a list of the things that will bite you, not a list of rules.

Two things to keep in mind as you go:

- **Supabase is shared.** Additive schema changes (a new nullable column, a new
  table) land safely for everyone; renames and drops break other people's app
  until they pull.
- **`.env` is yours, `.env.example` is shared.** Keep them in step so the next
  person's copy still starts.

## Layouts

The board ships with two column sets, switchable from **Layout** in the header.
Each layout keeps its **own placements**, so switching back and forth never
loses either arrangement.

**Relationship** (default) — how deep the relationship is:

```
Haven't reached out → Introed → Responded → Relationship → Happy self-serve
```

**Cadence** — how stale each account is:

```
Overdue → Due Soon → Introed → Sent → Replied → Recently Touched
```

Add a layout by appending to `LAYOUTS` in `src/renderer/src/lib/layouts.ts`; its
columns are seeded into Supabase the first time it is opened.

### Custom columns

Each layout holds **2 to 10 columns**, edited in place:

- **Add** — the "+ Add column" panel at the right-hand end. It appends the
  column and scrolls it into view. At 10 the panel is replaced by a
  "10 of 10 columns" note.
- **Reorder** — drag a column by its header. Card drags and column drags share
  one `DndContext`, distinguished by `data.type` on the draggable.
- **Rename** — double-click the column title.
- **Delete** — the `✕` on the column header (appears on hover), which arms and
  needs a second click to confirm. Its cards move to the leftmost remaining
  column; nothing is orphaned. Hidden at 2 columns.

The 10-column ceiling is enforced twice: in the UI, and by a `before insert`
trigger on `board_stages`, so it holds even against a direct write.

Past roughly six columns the board scrolls horizontally, and dnd-kit auto-scrolls
it while you drag near an edge.

> **A note on "Introed."** It's a column here, which means an account can only
> be *in* it — anything you've introed and then emailed has to leave "Introed"
> to reach "Responded", so the board can't tell you "have I ever introed this
> account?" for accounts further along. If intro coverage is the thing you
> actually want to see, it wants to be a per-account flag (a badge on the card,
> independent of column) rather than a stage. Worth revisiting.

## Using the board

- Drag a card between columns; the move saves immediately.
- **Left-click a card's colour chip** (the monogram square) to open the colour
  toolbar: seven colours plus "no colour" to go back to monochrome. A colour is
  a property of the *account*, so it shows in every layout. A coloured card is
  tinted across its whole background and casts a glow in the same hue; every
  card, coloured or not, carries a base shadow so the board has consistent depth.
- **Each card carries the account's own logo** where the monogram used to be,
  served by [logo.dev](https://logo.dev) from the account's website domain.
  Accounts with no logo keep the monogram. See
  [Where the logos come from](#where-the-logos-come-from).
- **The channel pill** on each card records where that contact actually is:
  Slack, Gmail, Microsoft Teams, or Discord. It is a segmented slider — click a
  segment and the thumb slides to it; click the chosen segment again to clear it.
  One choice per account, shared across layouts like the colour. It sits
  right-aligned under the contact age, hanging off the same edge as ARR.

  At rest the pill **collapses to just the chosen mark** and unfurls to the full
  row when you hover it (or tab into it), so a board of decided accounts reads as
  one mark per card. An account with nothing chosen has nothing to collapse to,
  so it stays open — which is also the one still waiting on a decision.
- Click anywhere else on a card to open its panel: exact ARR, segment,
  assignment date, the channel pill at a size that carries a label, and the
  outreach log. Log a touch with a channel, date, and optional note, and
  **Edit** or **Delete** anything already logged — editing opens the same fields
  in place. Changing or deleting a touch recomputes days-since-contact, so the
  card counter follows the edit.

  The channels are **Email, Call, Meeting, Slack, Link, and Other**, each with
  its own mark in the picker: the real Gmail and Slack logos for the two that
  name a product, and monochrome glyphs for the four that name an act rather
  than a service.

  **Link** is the one that behaves differently. It records something you *sent*
  — a doc, a dashboard, a recording — so choosing it reveals a URL field above
  the note, and it is the only channel where a field is required. The entry then
  shows the URL under the channel as a hyperlink that opens in your browser, with
  the note beneath it. You can leave the scheme off: `posthog.com/docs` is stored
  as typed and linked as `https://posthog.com/docs`.
- Each card shows ARR and days since last contact. A **filled** dot means stale
  (nothing logged, or more than 30 days); a **hollow** dot means recent.
- New accounts appearing in PostHog land at the bottom of the leftmost column of
  each layout on the next sync. Re-syncing never disturbs cards already placed.

## Where the accounts come from

Ownership is read from Vitally, which is the system of record for CSM
assignment:

```sql
SELECT organization_id, organization_name, segment, arr,
       csm_date_assigned, is_tam_overlay
FROM vitally_csm_managed_accounts
WHERE customer_success_manager = '<your email>'
```

This runs through PostHog's query API against project 2.

**Why Vitally and not billing.** PostHog's production billing tables
(`billing_accountexecutivehistory`) only carry a CSM row for part of a book —
accounts owned via TAM overlay have an Account Executive row but no CSM row. For
`luke.baber@posthog.com` billing returns 27 accounts and omits Cline Bot,
Cluely, USMobile, and Wispr AI. Vitally returns all 31.

**This is a CSM lookup, not a CSM-or-TAM lookup.** `customer_success_manager` is
the only email on the view. `is_tam_overlay` is a 0/1 flag riding on the *CSM's*
row, meaning "this account also has a TAM" — it never says who that TAM is, so
there is no way to ask the view "which accounts am I the TAM for?". Vitally has
no TAM key role either; its labels are Onboarding Specialist, Account Executive,
Account Owner, CSM, and Forward Deployed Engineer. Anyone whose accounts come to
them purely as an overlay signs in fine and gets an empty board.

Closing that would mean a second query against a different source. The nearest
email-keyed one is `vitally_all_managed_accounts_including_overlay`, which
carries `customer_success_manager` and `account_executive` side by side — but it
is a different population (464 rows against this view's 308, since it drops the
`segment = 'CSM Managed'` filter), so adopting it changes existing boards too.
`csm_effort_v6.tam` is the only column that names a TAM, and it holds display
names rather than emails.

## Where the logos come from

[logo.dev](https://logo.dev), looked up by the account's own website domain,
which rides along on the accounts query:

```sql
JSONExtractString(coalesce(a.traits, ''), 'sfdc.Domain__c') AS domain
FROM vitally_csm_managed_accounts v
LEFT JOIN vitally_accounts a ON a.external_id = v.organization_id
```

`AccountChip` turns that into
`https://img.logo.dev/<domain>?token=…&size=128&format=png&theme=light&fallback=404`,
with the token read from `VITE_PUBLIC_LOGO_DEV_API`. It is a publishable key, so
it lives in `.env` next to the Supabase one rather than in the keychain with the
PostHog key. Coverage is 295 of the 304 accounts across every book; the rest
fall back to the monogram.

**Why domain and not company name.** logo.dev will answer `name/Moonshot`, but
it answers confidently rather than accurately. Checked against this book, the
name endpoint returns a different company's mark for 5 of 31 accounts — the
`Moonshot` it finds is not `moonshot.money`, and `T3 Tools Inc.` is not
`ping.gg`. It also returns a real logo for names that do not exist at all
("Aaaa Bbbb Cccc" resolves to some company's monogram), and `fallback=404` does
not help: the name path counts those as hits. On the domain path a miss really
does 404, which is what lets the chip fall back to its own monogram. A wrong
logo on a customer's card is worse than no logo.

**When a card wears the wrong mark**, add its org id to `DOMAIN_FIXES` in
`lib/logos.ts`. Salesforce's `Domain__c` is right roughly nine times in ten;
the map is for the rest. Silencer Shop's Salesforce domain resolves to
BrandCave's wordmark and T3's to a stock cloud-platform screenshot, and two
accounts have no domain there at all — those four are the current contents.

This replaced a scraper that walked each account's site for an apple-touch-icon
and committed the results to `assets/logos/`. It only ever worked for one
person's book: logos were bundled by org id, so a new account showed a monogram
until someone re-ran the script, and every other CSM's board was monograms
throughout. Nothing needs running now.

Note the CSP in `renderer/index.html` carries `img-src … https://img.logo.dev`.
Without it Electron blocks every logo silently.

> Free tier requires attribution, which is the Logo.dev link at the bottom of
> the Settings dialog. Don't remove it without moving to a paid plan.

## What is stored where

| Data | Location | Why |
| --- | --- | --- |
| Account names, ARR, segment, domain | PostHog (live), cached on-device | ARR is deliberately kept out of Supabase |
| Account logos | logo.dev, by domain, at render time | Nothing stored or bundled; CDN-cached for a day |
| Column placement, per layout | Supabase `board_placements` | Needs to persist and be editable |
| Card colour, contact channel, account name | Supabase `board_cards` | Per-account, shared across layouts |
| Columns, labels, order | Supabase `board_stages` (keyed by layout) | Renameable, reorderable, 2–10 per layout |
| Logged touches | Supabase `touches` | Drives days-since-contact |
| To-dos | Supabase `todos` | Bucketed by horizon and by kind (account / PR / other); completing one soft-archives it |
| Who has signed in | Supabase `csm_users` | Not a gate — the row every other table's `csm_email` foreign-keys to |
| Weekly activity export | Generated on demand, written to a file you choose | Not stored; rebuilt from `touches` + `todos` each time |
| PostHog API key | OS keychain | Never touches Supabase or the renderer |

The on-device cache means the board still opens when PostHog is unreachable; it
says so in the header and drag/logging keep working.

Supabase is reached with a publishable key and no Supabase auth session, so RLS
is enabled with permissive policies. That is the seam to tighten if this ever
serves more than one trusted operator — see the comments in the initial
migration.

## Styling

Tailwind CSS v4, via `@tailwindcss/vite` in `electron.vite.config.ts`. There is no
`tailwind.config.js` — v4 is configured from CSS, so the design tokens live in the
`@theme` block in `src/renderer/src/styles.css`, and dark mode is a
`@custom-variant` keyed off a class on `<html>` rather than the OS preference
(light is the default, dark an opt-in). Electron needs nothing special for this:
the renderer is an ordinary Vite build.

### Radius and chrome

Two things are tuned from tokens rather than at call sites, so there is one place
to change either:

- **The radius scale is one step softer than Tailwind's the whole way up** — what
  `rounded-lg` used to be is now what `rounded-md` gives you. `--radius` (the bare
  `rounded` utility, which the chips and small hover actions use) is bumped with
  the rest, or those stay visibly sharper than everything around them.
  `rounded-full` is untouched: the pills stay pills.
- **Form chrome is muted.** `--color-input` points at `--color-line`, not
  `--color-line-strong`, and `--color-ring` at `--color-ink-faint`, not
  `--color-ink`. shadcn spends the ring twice — `focus-visible:border-ring` plus a
  3px `ring-ring/50` — so ink meant a focused field wore a solid black border
  inside a black halo, and the to-do composer autofocuses its title, which fired
  it every time the composer opened. `--shadow-field` replaces shadcn's
  `shadow-xs` on those fields: with a lighter border, depth is what separates them.

`--shadow-field` has a `--shadow-field-dark` sibling used through a `dark:`
variant, rather than being redefined under `.dark`. Tailwind inlines a
`--shadow-*` value into `--tw-shadow` at build time — it has to, so it can compose
with `--tw-shadow-color` — so a `.dark` override of the token reaches nothing.

Custom theme values also have to be taught to tailwind-merge in `lib/utils.ts`
(`ease`, `animate`, `shadow`), or `cn('shadow-xs', 'shadow-field')` keeps both and
source order picks the winner.

### Components

Primitives come from [shadcn/ui](https://ui.shadcn.com), vendored into
`components/ui/` by its CLI rather than installed as a package. Add more with:

```bash
pnpm dlx shadcn@latest add popover sheet alert
```

`components.json` points the CLI at `src/renderer/src/styles.css` and the `@/`
alias (`src/renderer/src/*`), which is why the root `tsconfig.json` — a
solution-style file that compiles nothing — still carries a `paths` entry.

**shadcn's tokens are mapped onto ours, not adopted.** Its components are written
against `bg-primary`, `border-input`, `ring-ring`; the `@theme inline` block in
`styles.css` points each of those names at the monochrome token beside it
(`--color-ink`, `--color-line-strong`, …). Two consequences worth keeping:

- Restyling means editing the tokens, never the vendored component source, which
  stays close to upstream and safe to re-`add`.
- Dark mode needs no second mapping. `inline` makes `bg-primary` emit
  `var(--color-ink)`, and `.dark` already redefines that.

Imports follow one rule: `@/` for the shadcn surface (`@/components/ui/*`,
`@/lib/utils`), relative paths for app modules. So an import's shape tells you
whether you're reaching for a library primitive or for this app's own code.

The remaining hand-rolled components are `ui/Notice` and `ui/Spinner`, which have
no shadcn equivalent worth the swap.

Everything else is utility classes. Three deliberate exceptions:

1. **Inline styles for genuinely runtime values** — dnd-kit's drag transforms, the
   colour popover's resolved position, and `cardSurfaceStyle()`. A utility class
   can't express a colour chosen at runtime, and inline styles outranking
   utilities is what lets a card tint replace `bg-[var(--color-raised)]` without a
   global override.
2. **`::-webkit-scrollbar` rules** — pseudo-elements with no utility equivalent.
3. **`.titlebar-drag`** — `-webkit-app-region` for Electron's inset traffic
   lights. Expressible as an arbitrary property, but a four-class string is
   harder to read than the rule it replaces.

A stylesheet holding tokens and a few base rules is a normal v4 setup, not a gap
in the migration.

## Layout of the code

```
src/
  shared/types.ts        Types crossing the process boundary
  main/
    index.ts             Window + app lifecycle
    menu.ts              Application menu, incl. Settings (Cmd+,)
    ipc.ts               IPC handlers, errors returned as data
    posthog.ts           PostHog query client
    secrets.ts           API key encrypted via safeStorage
    cache.ts             On-device account cache
  preload/index.ts       The only surface the renderer gets
  renderer/src/
    assets/channels/     Vendored Slack / Gmail / Teams / Discord marks
                         (SOURCES.md). Shared by the contact pill and the
                         outreach picker, not copied per use.
    lib/                 supabase client, all board queries, team (who may sign
                         in), logos (logo.dev URLs), accountMatch (name → account
                         for the to-do composer), layouts, colours, channels
                         (where a contact lives), touchChannels (how one outreach
                         went out, plus linkHref), formatters, cn(), segmented
                         (the shared pill recipe)
    hooks/               useBoard (board state machine), useTodos (the to-do
                         board), useTouchLog (one account's outreach log),
                         useTheme, useOutsideDismiss (click-away to close)
    components/          Board, Column, AccountCard, CardColorToolbar,
                         ChannelSlider, LayoutPicker, AccountDrawer, TouchForm,
                         TouchList, TouchChannelIcon, TopBar
      ui/                shadcn primitives (button, input, select, textarea,
                         toggle, toggle-group) plus hand-rolled Notice, Spinner
      icons/             GithubMark — inline so it can take currentColor
                       To-dos: ViewSlider, KindSlider, TodoBoard, TodoColumn,
                         TodoCard, TodoForm, CompleteZone, CompletionFxLayer,
                         completionEffects, CompletionUndo, SettingsDialog
```

PostHog calls live in the main process so the key stays out of the renderer and
there is no CORS layer to fight.

## To-dos

A second board, reached by the sliding pill in the header. Three fixed columns —
This Month, This Week, Today — plus a completion rail on the right.

**Creating one is the `+` beside a column's label, or a right-click anywhere in
the column.** There is no add panel and no column picker: where you click *is* the
horizon choice, so the two cannot disagree. Right-click is the fast path — you do
not have to aim at a 16px button — and it is only on the three horizon columns;
the completion rail is a different component, so "not on Done" needs no special
case. Right-clicking a card or the open composer leaves the native menu alone, so
cut/copy/paste still works inside the fields.

The composer asks for a title first and only a title. **The note is a link with a
`+` on it** until you want one: most to-dos are a single line, and an always-open
textarea made the composer look like a form to fill in rather than a box to type
in. Editing a to-do that already has a note opens with it showing.

**There is no Cancel button.** Clicking away closes the composer, and Escape does
the same from either text field. Choosing an account does *not* count as clicking
away, even though the select's popup is portalled outside the form — see
`useOutsideDismiss`. The same applies to a card's editor.

**A pill under the title says what the to-do is about**: an account, a PR (GitHub's
own mark), or Other (your own work — "draft the Q3 goal"). It shares its track and
knob with the header's view switcher via `lib/segmented`, so every pill in the app
reads as the same control. Only the account kind carries an account, so the picker
appears under the pill for that one and is gone for the other two — a PR is not "an
account to-do with the account left blank", which is what the old "No account"
option really meant.

**Typing an account's name links it.** "Look into the exception spike for Contoso
Freight" already says which account it is about, so the picker fills itself in
rather than making you say it twice. The link tracks the words both ways — delete
the name and it clears again — until you use the picker yourself, at which point
your choice sticks and nothing you type moves it. A to-do reopened for editing
keeps the account it was saved with, so fixing a typo cannot silently re-file it.

The lookup table is built from your own book, in `lib/accountMatch.ts`, and it is
fussier than a substring search in both directions at once. Case, accents and
punctuation are thrown away on both sides, so "US Mobile", "us-mobile" and
"USMobile" are one thing and adjacent words are tried joined together; but a
match still has to start and end on a word boundary, so an account called Glow
does not light up on "glowing". Beyond the full name it indexes two guesses — the
name with a generic tail dropped ("Contoso Bot" → "Contoso") and a leading word
long and distinctive enough to stand alone — and throws away any guess that lands
on two accounts, or on some other account's real name. Names only, never domains:
a company's registered domain is often a product name that means something else
entirely, and indexing an ordinary word like that would file half a week's notes
under one account.

Switching kinds keeps whatever account you had already chosen, so flipping to PR
and back does not lose it; the link is dropped on the way to Supabase instead
(`normalizeTodoValues`), because a PR card that kept an `org_id` would sit there
wearing some customer's logo.

The account picker shows each org's logo beside its name, and because Radix
portals an item's children into the trigger, the chosen account's logo appears on
the closed selector for free. A card stacks its account above its title rather
than beside it, which keeps the title from wrapping in a narrow strip. A PR card
carries the GitHub mark in that same slot; an Other card carries nothing, because
a row reading "Other" on every personal card is noise.

Picking a card up thins it to half width and centres it on the cursor wherever you
grabbed it; dropping it widens it back out into its column.

**Nothing is deleted when you complete it.** Clicking `DONE` on the rail opens the
completed list, newest first, with a Restore on every row that puts the to-do back
in the column it came from. That list is loaded fresh from Supabase rather than
from board state, because the board only ever holds *today's* completions — the
whole point is finding something you finished, or finished by accident, a while
ago.

Settings also carries an **Export last 7 days**, which writes a markdown file of
every touchpoint logged and every to-do completed in the window — touchpoints
grouped by account, to-dos grouped by the day they were finished — intended to be
handed to an AI agent as context. It goes through a native save dialog, because the
renderer has no filesystem access and an export you asked for is something you then
have to find.

Settings (the header button, or `Cmd+,`) carries a **Mega Confetti** toggle: with
it on, a completion sets off five seconds of confetti across the whole window —
side cannons angled inward plus a jet from a random point along the bottom —
instead of a single eruption.

The rail doubles in width the moment a card is picked up, so where it can go is
obvious without a legend.

**Completing one is a drop on the rail.** Every completion sets off a two-cannon
rainbow confetti eruption from the bottom centre of the window — a tight jet
inside a wide fan — and
the card itself comes apart with a different effect each time — shattering into
shards, evaporating, imploding into the rail, or being stamped and filed. The
rail glows green while a card is held over it: the one place the board leaves its
monochrome palette, because "let go now" should read without having to look.

Urgency increases left to right, the reverse of the accounts board's
progression. That is deliberate: it puts the nearest deadline nearest the rail,
which is where a finished card is headed.

**Buckets do not roll over.** Nothing demotes a leftover "Today" item overnight,
and there is no job to do it. That is a decision, not an oversight — the
alternative needs a rollover pass on load, and a silent one would move work you
had deliberately left where it was.

## Notes for future changes

- Sign-in is a domain check (`lib/team.ts`) followed by an idempotent insert into
  `csm_users`. The insert is not optional bookkeeping: every other table's
  `csm_email` foreign-keys to that row, so a new user whose row is missing fails
  on the constraint at their first board write — `loadStages` seeding the
  layout's five columns. If the gate ever moves, keep the write.
- Nothing ties the stored PostHog key to the signed-in email. The account query
  filters on whoever signed in, and the key only needs read access to project 2 —
  so signing out and back in as someone else reuses the key and returns *their*
  book, which is the intended behaviour on a shared machine but is worth knowing.
- `useBoard(email, layoutKey)` is the single state machine. Account data loads
  once per email; only columns and placements reload when the layout changes, so
  switching layouts costs no PostHog round-trip. Moves apply optimistically and
  roll back if Supabase rejects them.
- Placement is per `(csm_email, layout_key, org_id)`. Colour is per
  `(csm_email, org_id)` — that split is why a colour follows an account across
  layouts while its column does not.
- Card `position` is a float, so dropping between two cards rewrites one row
  rather than renumbering the column.
- Drop targets resolve by cursor (`pointerWithin`), not by the dragged card's
  rectangle. With narrow columns the default geometric detection drops into
  whichever column the card straddles rather than the one you point at.
- One `DndContext` hosts both drag types. Collisions are scoped by
  `active.data.current.type`: a column drag only sees `type: 'column'`
  droppables (and never itself, or `over` would always be the dragged column),
  while a card drag sees cards and lanes but never columns.
- Column reordering goes through the `reorder_board_stages` RPC rather than
  per-row writes. It rewrites every position in one statement, which transiently
  duplicates values — fine only because the unique constraint on
  `(csm_email, layout_key, position)` is `DEFERRABLE INITIALLY DEFERRED`. Keep it
  that way. `delete_board_stage` is an RPC for the same reason: rehoming cards
  and closing the ordering gap must be one transaction.
- The 10-column trigger deliberately allows rows whose `key` already exists.
  PostgREST upserts arrive as `INSERT .. ON CONFLICT DO UPDATE` and fire
  `before insert` per row, so without that check, writing to a full layout would
  raise.
- Do **not** add a bare `* { border-color: ... }` rule to `styles.css`. Tailwind
  emits utilities inside `@layer`, and unlayered rules beat layered ones, so a
  global selector silently overrides every `border-*` utility.
- Card surfaces come from `cardSurfaceStyle()` as **inline** styles, which
  outrank Tailwind utilities and so can replace `bg-[var(--color-raised)]`
  without a global override. The per-theme *alphas* live in CSS variables
  (`--card-tint-alpha`, `--card-glow-alpha`, `--card-shadow`) rather than being
  computed in JS, so one RGB triple produces a tint that works on both the light
  and dark surface and the component never needs to know the active theme.
- The colour chip stops propagation on both `pointerdown` and `click`: without
  the former the drag sensor claims the press, without the latter the account
  panel opens behind the toolbar. `ChannelSlider` does the same, and stops
  `keydown` too — the card handles Enter/Space itself, so without that, arrowing
  along the pill would also open the panel. A press-and-drag starting on the
  pill therefore does *not* drag the card, which is the intent: it is a control,
  not a handle.
- Two things are called a channel and they are not the same. `touches.channel`
  is how one logged outreach went out (email, call, meeting, slack, link, other);
  many per account. `board_cards.contact_channel` is where the contact lives
  (Slack, Gmail, Teams, Discord); one per account, nullable. `TouchChannel` vs
  `ContactChannel` in code, and `lib/touchChannels.ts` vs `lib/channels.ts` —
  two files rather than one precisely because only `slack` appears in both, so a
  merged map half-works and blanks the rest in silence.
- The channel pill sits on its own row rather than inline beside the contact
  age. Inline, it left roughly 50px for the age at the column widths the board
  actually uses, which turned "No contact logged" into "No c…".
- `ChannelSlider` wraps shadcn's `ToggleGroup` (`type="single"`, which Radix
  renders with `radiogroup`/`radio` roles and deselects to `''` — that's the
  "choose it again to clear" behaviour, not ours). Three things it has to
  override, all of which look like bugs if you remove them:
  - `relative` on each item. Items are statically positioned, so the absolutely
    positioned thumb paints **over** them: every chosen mark vanishes under a
    white disc.
  - `rounded-full!` on each item, important. `ToggleGroupItem` squares off inner
    edges via a `data-[spacing=0]` selector that outranks a plain `rounded-full`.
  - `hover:bg-transparent data-[state=on]:bg-transparent`. The thumb is the only
    selection indicator; the primitive's own checked background would double it.
  Note the keyboard model that comes with the primitive: arrows move focus and
  Space commits, rather than arrows selecting as they move. Two keystrokes, but
  each arrow press no longer writes to Supabase.
- The collapse is a width animation on the track plus a matching translate on the
  row — the row slides so the narrowed window frames the *chosen* segment rather
  than the first one. Three things to keep in mind if you touch it:
  - Widths are **border-box**, so they count the 1px border as well as the
    padding. Miss it and the row is clipped 2px on the right, which shows up as
    lopsided padding around the collapsed mark.
  - The widths and the row offset are set as CSS custom properties inline,
    because a Tailwind variant can switch which variable a utility reads but
    can't switch an inline style.
  - `focus-within` expands it as well as `hover`. Without that, tabbing into a
    collapsed pill would leave a keyboard user picking from options they can't
    see. Hover is scoped to the pill (`group/pill`), not the card, so sweeping a
    column doesn't set every pill in it moving.
- The account panel's Escape handler ignores events that a Radix layer already
  handled (`defaultPrevented`, or an open popper in the DOM). Without it, one
  Escape closed the channel select **and** the whole panel.
- `board_cards` reads are one query for colour **and** channel (`loadCardProps`)
  — same row, so two queries would only buy a second round trip.
- The logo chip is a **white** tile in both themes. Every mark is a favicon or
  touch icon, so it was drawn for a light background, and several are dark
  glyphs on transparency — on the dark card surface those vanish.
- Per-mark optical corrections live in `CHANNEL_ICON_CLASS` in `lib/channels.ts`,
  not in the slider. Gmail is the only entry (`p-0.5`): its envelope has no
  internal margin, so at a height matched to the others it crowds its
  neighbours.
- The channel marks are vendored SVGs rendered as `<img>`, not inlined. That
  keeps each file's internal gradient ids (Teams has a dozen) out of the
  document, where they would collide across 31 cards. Watch for brand SVGs
  published without a `viewBox`: they will not scale into a small box, and Slack
  needed one added. See `assets/channels/SOURCES.md`.
- Touch writes live in `useTouchLog`, not `useBoard`. Every write re-reads the
  account's log and hands the recomputed most-recent date back to the board via
  `setLastTouch`, because an edit can change *which* touch is newest and a
  delete can leave none — neither is derivable from the row that changed.
- `touches.url` is nullable and carries no CHECK tying it to `channel`, exactly
  like `todos.org_id` and `todos.kind`. The pairing is enforced by
  `normalizeTouchValues`, applied in `useTouchLog` rather than in `TouchForm` —
  the form deliberately keeps a typed URL in state across a channel change so
  flipping to Call and back does not discard it, which is *why* the stripping has
  to live downstream of it. `updateTouch` writes `url` unconditionally rather
  than only when set, or re-filing a link touch as a call would leave the old URL
  on the row.
- `linkHref` in `lib/touchChannels.ts` is the whole boundary between typed text
  and an `href` in a renderer running at the app's own origin, so it refuses
  anything that is not http(s) — a `javascript:` URL pasted into that field would
  otherwise execute there. It also supplies a missing scheme, which is not
  cosmetic: a bare `posthog.com/docs` in an `href` is a *relative* path, and the
  window would navigate itself to a file that does not exist. Order matters —
  anything that parses as a URL is judged on its protocol and never retried,
  because retrying is how `mailto:a@b.com` becomes a perfectly valid
  `https://mailto:a@b.com`. The known cost is that `localhost:3000` parses with a
  `localhost:` protocol and so is refused.
- The link in a history entry is `target="_blank"`, and that is load-bearing
  rather than habit: the main process turns an attempt to open a window into
  `shell.openExternal` (`setWindowOpenHandler` in `main/index.ts`), so the target
  is what sends the URL to the browser. A same-tab href would navigate the
  renderer off the app with no way back.
- `TouchChannelIcon` mixes two kinds of mark on purpose. Email and Slack name a
  product and get that product's own full-colour logo, reusing the files in
  `assets/channels/` rather than a second copy. Call, Meeting, Link and Other
  name an act, not a service, so they are `currentColor` lucide glyphs — drawing
  Call in some invented brand colour would imply a vendor that is not there.
  Both render into a fixed square box whatever their aspect ratio, so labels line
  up down the dropdown.
- The lucide glyphs in that component carry `size-[15px]` and `text-current`, and
  both prefixes are load-bearing inside a Select: shadcn's `SelectItem` and
  `SelectTrigger` restyle any descendant `svg` whose class contains neither
  `size-` nor `text-`, which would resize them to 16px and repaint them
  `muted-foreground`.

- To-do columns are a CHECK-constrained `bucket` on the row, not rows in
  `board_stages`. That table exists to be *edited* — it carries the 10-column
  trigger, the deferrable position-unique constraint that only the reorder RPC
  needs, and the rehoming RPC — and a fixed three-column board would spend its
  life suppressing all of it. A CHECK enum plus a const array and an `isX()`
  guard is already the house pattern (`board_cards.color`, `touches.channel`).
- `todos.kind` and `todos.org_id` are only meaningful together: an `org_id` on a
  `pr` or `other` row is stale data, and it is not cosmetic — `TodoFace` renders
  the account chip off `org_id`, so such a card would wear a customer's logo.
  `normalizeTodoValues` in `lib/todos.ts` strips it, and it is applied in
  `useTodos`, not in the form, so it covers the optimistic patch and the write at
  once. The form deliberately keeps `orgId` in local state across a kind change,
  which is *why* the normalisation has to live downstream of it.
- `lib/accountMatch.ts` is pure in both directions — accounts in, index out;
  index and text in, match out — so what it does can be exercised without
  rendering a composer. Two of its rules are load-bearing and easy to "simplify"
  wrongly. Full names are indexed unconditionally while a derived alias has to
  clear a length check and a stopword list, because a name is the user's ground
  truth and an alias is the index's own guess. And an alias claimed by two
  accounts is dropped rather than awarded to whichever was seen first: `TodoFace`
  renders the account chip off `org_id`, so a wrong link is one customer's logo
  sitting on another customer's card.
- The composer holds the account as `picked` plus `pinned` rather than one
  `orgId`, and the value it submits is derived from the pair. Collapsing them
  back into one state variable is what breaks the feature: without `pinned` there
  is no way to tell an account you chose from one the text supplied, so either
  typing overwrites your choice or your choice freezes the matcher out.
- `toTodo` falls back to `org_id ? 'account' : 'other'` for a row with no
  recognised `kind`. That is deliberately the same rule the backfill migration
  used, so a row written by an older build reads back the way the column was
  seeded. Do not change one without the other.
- Completing a to-do leaves `bucket` and `position` alone and only sets
  `completed_at`. That is the invariant undo depends on: a restored to-do
  reappears in exactly the slot it left, with no arithmetic. Do not "tidy up"
  those columns on completion.
- `startOfTodayIso()` must not be written as `fromDateInput(todayInput())`.
  That helper anchors at local *midday* so a date-only entry cannot drift across
  a timezone edge — correct for a logged touch, and wrong for a count window,
  where it silently drops everything completed before lunch.
- The completion rail participates in collision detection **by pointer only**,
  and is filtered out of the geometric fallback. It abuts the last column, and
  geometric detection resolves against the dragged card's rectangle rather than
  the cursor, so without this a card released over "Today" while merely
  overlapping the rail would be completed. The cost is that the rail is
  unreachable by keyboard drag, which is why every card carries a "Done" button.
- The rail **doubles in width** while a card is in flight (176px to 352px), which
  is the signal that it is a target. That is only safe because `TodoBoard` sets
  `measuring={{ droppable: { strategy: MeasuringStrategy.Always, frequency: 50 } }}`.
  dnd-kit's default measures droppables **once** at drag start, so growing the rail
  afterwards would leave every cached rect stale: the rail would accept drops where
  it used to be and ignore the half of itself that just appeared, and the three
  columns beside it reflow too (409px to 351px), so their lane rects go stale in
  the same moment. Those two changes go together — do not revert one without the
  other. Verified both directions: a drop in the strip that was column space at
  rest and is rail only after expansion **completes**, and a drop 20px inside
  Today's right edge with the rail expanded still **moves**.
  The rail grows **in flow**, never as an overlay, so it cannot sit on top of the
  last column and steal drops meant for it.
- `TodoBoard` suppresses `DragOverlay`'s `dropAnimation` from `onDragOver`, never
  from `onDragEnd`. dnd-kit starts the drop animation in the same commit that
  clears `activeId`, so a flag written in `onDragEnd` races the thing it is meant
  to configure.
- Completion is optimistic and the Supabase write is **not awaited**, while the
  celebration is driven by the gesture. A round trip is longer than most of the
  effects, so awaiting it would leave the card on screen for a beat and then
  burst confetti where it no longer is. If the write fails the card comes back
  and a Notice appears; the effect is deliberately not rewound.
- Two 80%-similar `CollisionDetection` functions exist on purpose, one per board.
  The rules genuinely differ — nothing in `TodoBoard`'s should copy `Board`'s
  `c.id !== args.active.id` self-collision filter, which exists only because
  columns there are themselves draggable.
- Effect selection is a shuffled bag, not `Math.random()` per call. Over six
  effects a naive pick repeats back to back about one time in six, and "it did
  the same thing twice" is the one outcome the feature cannot have. The swap
  after each refill closes the one remaining seam, where bag A ends on the kind
  bag B starts with.
- Confetti fires on **every** completion and is outside the energy budget. The
  budget governs only how the card comes apart, forcing the two quiet effects
  past three loud ones in eight seconds, so clearing a backlog is not six
  shattering cards.
- `accentOf()` cannot feed canvas-confetti — it returns `rgb(220 38 38)` and the
  library parses hex only, so every channel comes back `NaN` and particles render
  black. Use `hexOf()` / `particleColors()` from `lib/colors.ts`.
- The confetti canvas needs an explicit CSS size (`h-full w-full`), and it is not
  redundant with the parent's `inset-0`. `<canvas>` is a **replaced element**, so
  `position: fixed; inset: 0` does not stretch it: with `width: auto` CSS uses the
  intrinsic size — the `width`/`height` attributes, which we set to the 2x retina
  backing store — and treats the box as over-constrained, ignoring `right` and
  `bottom`. The canvas then lays out at 2960x1748 CSS px over a 1480x874 window, so
  only its top-left quadrant is on screen and a burst aimed at bottom centre
  appears at the right edge below the fold. This is worth knowing because it is
  nearly invisible to instrumentation: every backing-store coordinate stays
  perfectly self-consistent, so measurements of the burst's origin look correct
  while nothing is where the eye expects. Assert against **screen** pixels
  (`getBoundingClientRect` scaling applied) rather than canvas coordinates.
- The header carries a **Confetti** button in the to-do view that fires the burst
  with no completion behind it. It is deliberately its own listener rather than a
  synthetic FxEntry, so it cannot draw from the effect bag, spend the energy
  budget, or push an undo entry.
- The confetti erupts from **bottom centre**, not from the completed card. Firing
  from the card seems more obviously right and is worse: a card is always released
  over the completion rail, hard against the right edge, so most of the burst threw
  itself off screen and the rest was crammed into the corner. Measured at bottom
  centre: launch x is 50% of the window, the arc reaches 10% from the top, and 0%
  of particles leave either edge. The card still comes apart at its own rect —
  only the confetti moved.
- `particleColors()` fires all seven card hues at once, and it must stay that way.
  An earlier version used the completed card's own hue plus two greys read from
  the theme, on the reasoning that a burst should match the app's monochrome. That
  was wrong in practice: an uncoloured to-do got the greys alone, and small
  near-black and grey squares on a white page are effectively invisible — the
  celebration read as not having fired at all. The confetti is the one place the
  board is allowed to be loud.
- The confetti canvas is ours, created with `useWorker: false` and
  `resize: false`. The library's default global builds its worker from a `blob:`
  URL, which this window's CSP blocks (worker-src falls back to script-src
  `'self'`) — it warns once per session and silently falls back to the main
  thread. And with a caller-supplied canvas the worker path calls
  `transferControlToOffscreen()`, after which the canvas can never be resized.
  The library also ignores devicePixelRatio, so we size the backing store.
- Keep `pointer-events: none` on the effect layer and its canvas. Chromium
  excludes such elements from the non-client-area hit test, which is what keeps
  the `-webkit-app-region` titlebar draggable underneath. Set it to `auto` and
  dragging the window by its titlebar silently stops working, with no error.
- Effect cleanup runs off timers, not animation callbacks. Chromium throttles
  rAF to a stop for an occluded or minimised window, so motion's
  `onAnimationComplete` and the confetti loop can both simply never fire.
  `visibilitychange` covers minimise but not occlusion, hence the per-entry
  reaper in `lib/completionFx.ts`.
- Reduced motion is read from the media query, unlike dark mode, which is a class
  on `<html>`. It is an OS accessibility signal rather than a style preference.
  There are two guards, deliberately: `MotionConfig` at the app root reaches
  motion components only, so `pickEffect()` short-circuits as well — which also
  fixes canvas-confetti's own `disableForReducedMotion`, which snapshots the
  media query once when the cannon is created and never notices it changing.
- `tailwind-merge` resolves conflicts against its own bundled copy of Tailwind's
  default theme, so `@theme` entries in `styles.css` are invisible to it. That is
  why `lib/utils.ts` extends it with `ease: ['swift']` and the `animate-fx-*`
  names: without it `cn('ease-out', 'ease-swift')` emits both and lets source
  order decide.
- The three easing constants in `lib/motion.ts` are the same curve in three
  shapes because three consumers need three shapes: motion rejects easing
  strings and wants a `[number, number, number, number]` tuple, dnd-kit's
  `dropAnimation` wants a CSS string, and Tailwind wants the token. Keep them in
  step.
- `BoardScreen`'s two `<main>` short-circuits are scoped to the accounts view.
  Unscoped, `accountCount === 0` swallows the whole element — so a CSM with
  nothing assigned in Vitally could never reach their to-dos.

- The composer animates opacity and transform ONLY. An earlier version animated
  `height: 0 -> 'auto'` inside an `overflow-hidden` wrapper, which is motion's
  most fragile case: it needs a measurement pass, and when that did not land the
  element stayed at `height: 0` and the wrapper clipped the form's own Add and
  Cancel buttons out of the hit test. The form looked present and reported sane
  rects, and could not be clicked. Opacity and transform cannot clip anything.
- A card's entrance animation lives on a WRAPPER outside the sortable node.
  dnd-kit writes the drag translation to the sortable's own inline `transform`
  and motion animates `transform` too; on one element they fight and the card
  jumps. Nested, the two compose.
- Cards animate in but never out. A completed card is already animated by the
  effect layer, so an `AnimatePresence` exit would fade a second copy out
  underneath the shards.
- In `lib/completionFx.ts`, `last` means the last kind actually PLAYED, not the
  last drawn, and it is assigned only where a pick is finalised. Setting it inside
  `draw()` broke both the bag-boundary guard and the budget's substitute choice —
  the substitute compared against the kind that had just been discarded, so it
  always picked the same quiet effect and repeated it indefinitely under load.
- Budget substitution goes THROUGH the bag: push the discarded loud kind back and
  filter the substitute out. Reassigning `pick` alone left the substitute sitting
  in the bag, so the next natural draw could pop it and repeat. And the substitute
  is chosen as a quiet kind that differs from `last`, not by a rotating counter,
  which could otherwise collide with a naturally-drawn quiet effect. Verified at
  every spacing from 100ms to 9s: zero immediate repeats in 40,000 picks each.
  Note a wide-spacing test cannot catch these — the budget only engages below
  roughly 2.7s between completions.
- Optimistic rollback is per-row and functional. Snapshotting the whole `todos`
  array meant a failed write reverted every unrelated change that had landed while
  it was in flight, and there was no re-read to heal it — one dropped request
  silently un-completed a different card for the rest of the session. Mutations
  read through `todosRef`, which moves in lockstep with state, so two mutations in
  one tick cannot compute against stale data.
- `freeSlot()` exists because a completed row keeps its bucket and position (so
  undo is exact) while `columns` filters it out — making its slot invisible to the
  ordering arithmetic and reusable. Since `addTodo` steps by exactly
  POSITION_STEP, that collision is hit dead-on, and undo would then restore two
  open rows at an identical position with no tiebreaker in `loadTodos`.
- The "done today" window follows the actual local day, refreshed on a timer and
  on window focus. Computing it once at load looks fine and is wrong: a session
  left open past midnight keeps counting yesterday, and the rail's counter is
  visibly stale the next morning.
- `CompletionUndo` never unmounts — only its inner `motion.div` is conditional —
  so `paused` outlives a toast, and reaching Undo requires hovering or focusing
  it. Browsers fire neither blur nor pointerleave for a node removed from under a
  stationary cursor, so the flag latched and every later toast stopped
  auto-dismissing. It is cleared whenever there is no toast.
- The account Select needs a `placeholder` and an item for an unresolvable
  `org_id`. Radix surfaces the selected label only through the matching item, so a
  to-do pointing at an account no longer in the book rendered a trigger holding
  nothing but a chevron, and simply saving the form dropped the link silently.
- The header's Sync button refreshes BOTH boards. It renders in both views, so
  wiring it only to `board.refresh()` made it look like the obvious way to recover
  a to-do board that failed its initial load, while doing nothing for it.

- Settings live in `lib/settings.ts`, a small external store over localStorage
  rather than React context — the writer (the dialog) and the reader (the effect
  layer, mounted at the app root) sit in different branches, and threading a
  provider around both to carry one boolean is more machinery than the boolean is
  worth. `getSettings()` is read at fire time, so toggling never re-renders the
  layer. Preferences are parsed field by field, so a stored blob from an older
  shape cannot put a toggle into a third state.
- There are two ways into Settings and they open the same dialog: the header
  button and the native `Cmd+,` menu item. Adding the latter is why
  `src/main/menu.ts` exists at all — Electron's default menu has no Settings item,
  and replacing the default means supplying the standard items too, hence the
  `role`-based entries, which get the platform's own labels and accelerators free.
  The menu item does not open anything itself; it sends `menu:settings` and the
  renderer owns the dialog.
- Mega Confetti is a repeating timer, not one enormous burst. canvas-confetti's
  particle count is per call, so a single call big enough to last five seconds puts
  every particle in the air on frame one and then thins out — one big pop rather
  than a sustained spray. Small volleys every 130ms keep the screen filled for the
  whole run. Completing again mid-run extends `megaUntil` instead of starting a
  second interval, so a burst of completions cannot stack timers, and the interval
  is cleared on unmount and on visibility loss alongside the cannon reset.
- `tw-animate-css` is installed and imported by `styles.css`, and the vendored
  shadcn surface needs it: `dialog.tsx` and `select.tsx` are written against
  `animate-in` / `fade-in-0` / `zoom-in-95`, which are inert without it — dialogs
  and select popups then appear instantly. Doing the same with motion would mean
  `forceMount` plus an `AnimatePresence` around every Radix portal. So the division
  of labour is tw-animate-css for the primitives, motion for this app's own bespoke
  motion, and plain CSS transitions for anything that is one property change.

- Completing soft-archives, and for a while the only way back was the six-second
  undo toast — after which a completed to-do was invisible for good. The rail's
  counter could say how many, and nothing could say which, so a board that had
  been worked through looked like data loss. Hence `loadCompletedTodos` (recent
  completions regardless of day, unlike the day-scoped counter query) and the
  completed list behind the `DONE` label.
- `restore(todo)` takes the whole row where `undo(id)` takes an id, deliberately.
  The completed list can surface something finished days ago that the board never
  loaded, and an id-based undo looks the row up in local state and silently finds
  nothing. `restore` inserts the row when it is unknown and patches it when it is
  not.
- Both a to-do card and the completion rail present a control whose visible text
  is "Done" — the card's hover-revealed complete button, and the rail's label that
  opens the completed list. The card's carries `aria-label="Complete <title>"` so
  the two are distinct to assistive tech, but any DOM query by visible text will
  hit the card's first, since cards precede the rail. Select the rail's by
  container, not by text.

- Picking a card up halves its width and dropping it widens it back out, and those
  two halves live in **different components** — not by preference, but because
  dnd-kit caches the overlay's rendered node for the drop animation. The overlay
  survives mouseup (measured: ~180ms, sliding home) but re-rendering it wider has
  no effect on what is on screen, so the widen has to be played by the *placed*
  card instead.
- That widen is `useAnimate` on its own wrapper div, not an `initial` and not a
  state-driven `animate`. A card reordered inside its own column is never
  unmounted, so `initial` would not re-run; and a declarative `animate` would have
  to pass through the half-width value on the way in. Its own wrapper because the
  card already has a motion element for the entrance transform and the sortable's
  dnd-kit transform below that — three wrappers, one job each, none fighting over a
  `transform`.
- Width, not `scaleX`. Scaling squashes the text horizontally; narrowing lets it
  rewrap and stay readable.
- The centring offset is computed against the *halved* width (`rect.width / 4`, not
  `/ 2`), because what has to end up under the cursor is what the card becomes, not
  what it was.
- The to-do `DragOverlay` must NOT carry a fixed width. dnd-kit sizes the overlay
  wrapper to the dragged card's measured rect, so `w-full` inherits the real width;
  a hard-coded one (212px, from when columns were narrower) left the overlay far
  narrower than the card it came from. Since dnd-kit aligns the overlay's *left
  edge* with the card's, the cursor then ended up outside the overlay entirely and
  it read as the card being flung to the left — worse the further right you grabbed.
- The overlay centres itself on the cursor, and the offset that does it is measured
  by reading the source card's rect **from the DOM** (`[data-todo-id]`) rather than
  from `active.rect.current.initial`. dnd-kit populates that ref *after*
  `onDragStart`, so it is null there — using it left the offset at zero, which
  fails silently: the card simply stays on dnd-kit's default alignment and nothing
  errors.
- That centring is a `motion.div` *inside* the overlay, not on it. dnd-kit writes
  the drag translation to its own wrapper element, so a transform on a child
  composes with it; animating the same element would have the two fight over one
  `transform`. The spring eases the grab offset to zero over ~7 frames, which is
  the morph — measured from a bottom-right grab: -98, -36, -15, -6, -2, -1, 0.
- `Board.tsx` (the accounts board) still hard-codes `w-[212px]` on its own overlay.
  Its columns are narrower, so the mismatch is a couple of dozen pixels rather than
  180, but it is the same defect and the same fix applies.

- `lib/exportActivity.ts` is pure — rows in, markdown string out — so the shape of
  the document can be changed and checked without a database or an Electron window.
  The queries that feed it live in `board.ts` like every other one.
- Account names for the export come from `board_cards`, not from the live book. A
  touch logged months ago may belong to an account since reassigned away: PostHog no
  longer returns it, but its `board_cards` row survives, and the alternative is a
  uuid in a document meant to be read.
- `touches.channel` is capitalised in place rather than mapped through
  `CHANNEL_LABELS` in `lib/channels.ts`. That map is for `ContactChannel` — where an
  account is reachable (slack, gmail, teams, discord) — and this is `TouchChannel` —
  how one outreach went out (email, call, meeting, slack, link, other). Only `slack`
  appears in both, so mapping through the wrong one silently blanks five of the
  six. This is the same collision the account panel keeps apart, and it is easy to
  get wrong precisely because one value does resolve. `TOUCH_CHANNEL_LABELS` in
  `lib/touchChannels.ts` *is* the right map, but every label in it is the value
  capitalised, so importing it here would buy a coupling and nothing else.
- A link touch contributes a second line, the URL in angle brackets so every
  renderer autolinks it and a trailing `)` or `.` cannot be swallowed into the
  link text. It is `linkHref`'s normalised output, not the raw field, and text
  that `linkHref` refuses is emitted verbatim instead — the document should say
  what was logged either way.
- PostgREST returns timestamptz with a **full** offset (`2026-08-21T16:37:28.79+00:00`)
  and trims trailing zeros from the fraction. `new Date()` parses that; it does
  **not** parse a two-digit offset like `+00`, which yields `Invalid Date` and
  renders as the literal text "Invalid Date" in the document rather than throwing.
  Verified against the live endpoint — worth re-checking before trusting any
  hand-written timestamp in a test fixture.
- A note is free text a human typed, so the export indents every line of it under
  its bullet and leaves blank lines truly blank. A blank line ends a list item in
  markdown, and an *indented* blank line leaves trailing whitespace that some
  renderers turn into a hard break.

- Anything reached through `window.api` should go through `requireBridge` in
  `lib/bridge.ts`, or be optional-chained. `contextBridge.exposeInMainWorld` runs
  only when the preload script is evaluated, so a renderer can be newer than the
  bridge it is calling — most easily under a long-running `pnpm dev`, where the
  renderer hot-reloads and the preload does not. The raw symptom is
  `Cannot read properties of undefined (reading 'saveText')`, which points at the
  renderer and says nothing about the preload. `requireBridge` names the cause and
  the fix instead.
  Worse, an unguarded bridge call *during mount* — `BoardScreen` subscribing to the
  Settings menu item — throws inside an effect and takes the whole board down, so a
  missing keyboard shortcut becomes a white screen. That one is optional-chained.
  Simulate the whole failure by deleting a key from `out/preload/index.mjs` and
  relaunching; it is the only faithful reproduction, since contextBridge properties
  are non-configurable and cannot be deleted from the renderer.

### Testing drag-and-drop from a script

Synthetic mouse input needs care. `sendInputEvent` delivers `pointerdown` with
`buttons: 0`, so dnd-kit needs several genuine `mouseMove` events before it
arms, and a lead-in `mouseMove` before `mouseDown` to establish cursor position.
Moves paced faster than roughly 30px / 45ms get coalesced, and the drop then
resolves against a stale pointer position — which looks exactly like a
collision-detection bug but isn't.

**An occluded window invalidates every animation measurement.** Chromium reports
`document.visibilityState === 'hidden'` for an Electron window that is merely
behind another one, and throttles requestAnimationFrame to a stop. motion then
freezes every animation at its `initial` values, so cards read as
`opacity: 0`, the undo toast never auto-dismisses, and confetti never paints —
all of which look exactly like product bugs. `Page.bringToFront` does not
reliably win against another app's window. Check `document.visibilityState` and a
rAF frame count before trusting anything you measure, and prefer asserting on
settled state (computed `opacity: 1`, `transform: none`) over sampling mid-flight.
This is the same throttling the effect store's reaper timers exist to survive.

Two more traps once the board scrolls horizontally: an element's
`getBoundingClientRect()` may be outside the window entirely (scroll it into view
first, or the press lands on nothing), and dnd-kit auto-scrolls the board mid-drag,
so coordinates computed before the drag go stale. Prefer short drags between
adjacent columns, away from the container edges.

### Obvious next steps

- Intro coverage as a per-account flag rather than a column (see the note above)
- Filter/search across the board
- Roll "Today" leftovers forward, or flag them, instead of manual re-dragging
- Auto-place into Overdue / Due Soon from days-since-contact instead of manually
- Pull real signals into the card: last Gong call, last Slack message, open
  Zendesk tickets
- Per-column WIP limits, and a colour on the column itself
- Reorder the layouts, and let a layout be created from the UI rather than code
