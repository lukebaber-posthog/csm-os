# Design notes

This is the long-form companion to the README: the reasoning behind decisions
that aren't obvious from the code, and the traps that have already caught
someone once. It used to be the README itself, which is why it reads like a
running commentary rather than a reference.

Nothing here is required to run the app or to make a change. Reach for it when
you're about to touch something and want to know why it is the way it is, or
when something behaves oddly and you suspect it's on purpose.

---

## Layouts

The board ships with two column sets, switchable from **Layout** in the header.
Each layout keeps its **own placements**, so switching back and forth never
loses either arrangement.

**Relationship** (default) — how deep the relationship is:

```
Haven't reached out → Introed → Responded → Relationship → Happy self-serve
```

**Cadence** — how stale each account is, computed from the touch log:

```
Never contacted → 31+ days → 21–30 → 11–20 → 4–10 → 0–3
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

## The Cadence board is computed

The **Relationship** layout is what it always was: columns you name, cards you
drag, placements in `board_placements`.

**Cadence is not.** Its columns are a rule over the touch log — Never contacted,
31+ days, 21–30, 11–20, 4–10, 0–3 — and an account is in whichever one its last
logged contact falls into. Nothing is stored: the layout skips
`loadStages`/`loadPlacements` entirely, which also means `reconcilePlacements`
stops writing a row per account per sync for a layout that never reads them back.

Cards sort **most stale first** inside each column, so the one nearest to needing
attention is at the top of the column that needs attention most.

**Its columns cannot be renamed, added, deleted, or reordered.** There is nothing
to persist, and a rename would only let the label disagree with the rule that
fills it. `Column` spreads no drag listeners and hides its delete control when
`computed`, so no gesture is offered that could not work.

**Never contacted is its own column, not "infinitely stale".** Never having
spoken to an account is a different fact from having let one go quiet, and only
one of them is fixed by getting in touch.

### Dragging on a computed board

A drop cannot move a card here, because the column is a fact about the touch log.
So dropping a card into a different column **opens the touch form** for that
account, seeded to a date that would put it where you dropped it. Log the touch
and the card moves because the underlying fact changed. Dismiss the dialog and
nothing is written.

That the card returns on dismiss costs no code: the board reads from the touch
log and nothing was optimistically moved, so there is no state to unwind. It is
why this can be a plain dialog rather than a move-then-confirm.

The seeded date is the **newest** end of the range — drop into "21–30 days" and
it offers 21 days ago, not 30, because dating it 30 back would push the card out
of the column again tomorrow. The field stays editable, and changing it lands the
card wherever that date actually belongs rather than forcing the drop to come
true.

**The rejected alternative was writing the touch silently from the drop.** It
would have invented outreach that never happened and put it in the weekly export
as though it had.

## Where the accounts come from

Ownership is PostHog's own Customer Analytics: `system.account_relationships`,
the native record of who holds which role on which account.

```sql
SELECT a.external_id, a.name, round(p.mrr * 12, 2) AS arr,
       toString(toDate(r.started_at)) AS csm_date_assigned
FROM system.account_relationships AS r
LEFT ANY JOIN system.accounts AS a ON a.id = r.account_id
LEFT ANY JOIN system.account_relationship_definitions AS d ON d.id = r.definition_id
WHERE d.name = 'CSM' AND r.ended_at IS NULL AND a.churned_at IS NULL
  AND r.user_id IN (SELECT id FROM postgres_posthog_user WHERE lower(email) = '<your email>')
```

This runs through PostHog's query API against project 2.

**This replaced Vitally**, which used to be the system of record here
(`vitally_csm_managed_accounts`). Customer Analytics is not merely equivalent, it
is ahead: compared across every CSM's book on 2026-09-01, 308 organizations
appeared in both, **15 only in Customer Analytics, and 1 only in Vitally**. For
`luke.baber@posthog.com` the two agreed exactly — the same 31 organizations with
the same assignment dates.

Ignore the "stale" warning on the `CSM (Vitally)` custom property, which says
Customer Analytics' relationship data cannot be trusted "until the ownership flip
lands". That note predates the flip; the comparison above is what the data
actually says now.

**Relationships carry an effective range**, so `ended_at IS NULL` is the whole
"current holder" filter — the table keeps ended assignments rather than deleting
them, which is why this is a live view and not a snapshot. `churned_at IS NULL`
drops churned accounts; none of this book is churned today.

**The email-to-user-id hop.** Assignments key on a numeric PostHog user id and no
`system.*` table exposes an email, so the query resolves it through
`postgres_posthog_user`. The alternative — reading the id from
`/api/users/@me/` — would have quietly changed the question from "this email's
book" to "the API key owner's book".

**This is a CSM lookup, not a CSM-or-TAM lookup**, and that has not changed. The
role set is Onboarding specialist, Account owner, Account executive, CSM, and
Forward deployed engineer; there is no TAM role. Anyone whose accounts come to
them purely as an overlay signs in fine and gets an empty board.

**`is_tam_overlay` is gone.** Vitally carried it as a 0/1 flag on the CSM's row
meaning "this account also has a TAM", and it had no native equivalent — no TAM
role exists, and Account executive does not stand in for it (Cline Bot and Wispr
AI carry the flag, but so does USMobile, which does not). It covered 2 of 31
accounts. Restoring it properly means creating a TAM relationship definition in
Customer Analytics and assigning it.

**`segment` is now a literal.** Vitally's value was `CSM Managed` for every row
of every book — the view only contained CSM-managed accounts, so the field was
constant by construction. Customer Analytics has no equivalent and its `Region`
property is unset across this whole book, so the panel shows the same constant
rather than growing a hole. It is the obvious slot to repurpose.

### ARR is a different number now

There is **no native field equal to Vitally's `arr`**, so the cards show the `MRR`
account custom property annualised (net invoiced dollars, post-discount, × 12).

It agrees exactly with the old figure on a good share of the book — Cline Bot
231,644.40, T3 Tools 68,355.12, Determinate Systems 146,802.24, LayerZero
51,503.64, DubClub, Hedra and Moonshot all land on the cent. It differs elsewhere,
most sharply on **Wispr AI, which reads 523,405.92 against Vitally's
1,046,405.34**. Vitally's ARR was its own smoothed measure, not an annualised MRR.

Two other properties were measured and rejected. `Forecasted MRR × 12` projects
the next invoice and goes negative on AWeber. `Confirmed MRR × 12` excludes
upcoming invoices, so it is a partial-month figure that cannot be annualised at
all: it reads 3,000 for 713 Online and 5,400 for Cline Bot. Only the `MRR`
property is complete (31/31), never negative, and stable enough to sit on a card.

**A HogQL trap, measured.** Two `LEFT ANY JOIN` subqueries of the same shape
against `postgres_customer_analytics_custompropertyvalue`, differing only in which
definition they filter to, **return each other's values** — `Confirmed MRR` came
back carrying `MRR`'s numbers, which is how the wrong property nearly shipped. Do
not add a second property join beside the existing one; pivot with `argMaxIf` over
a single scan instead, and verify any property value against an isolated query
before trusting it.

## Where the logos come from

[logo.dev](https://logo.dev), looked up by the account's own website domain,
which rides along on the accounts query:

```sql
coalesce(
    nullIf(sf.domain_c, ''),
    nullIf(JSONExtractString(toString(a.properties), 'website_domain'), '')
) AS domain
```

Two sources coalesced, because neither covers the book alone. Salesforce's
`domain_c` — the same field the old Vitally query reached through cached traits,
now read directly via `system.accounts.sfdc_id` — misses 5 of 31. The account's
own `website_domain` property misses 15. Together they miss 2, which is the
coverage the Vitally join gave, without Vitally.

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
                         went out), links (linkHref — typed text to a safe href),
                         noteMarkup (the note dialect + parser), noteDoc (dialect
                         <-> editor document), noteEditor (the editor's schema),
                         noteStyles (how the dialect looks, shared),
                         formatters, cn(), segmented (the shared pill recipe)
    hooks/               useBoard (board state machine), useTodos (the to-do
                         board), useTouchLog (one account's outreach log),
                         useTheme, useOutsideDismiss (click-away to close)
    components/          Board, Column, AccountCard, CardColorToolbar,
                         ChannelSlider, LayoutPicker, AccountDrawer, TouchForm,
                         TouchList, TouchChannelIcon, ExternalLink, TopBar
      ui/                shadcn primitives (button, input, select, textarea,
                         toggle, toggle-group) plus hand-rolled Notice, Spinner
      icons/             GithubMark — inline so it can take currentColor
                       To-dos: ViewSlider, KindSlider, TodoBoard, TodoColumn,
                         TodoCard, TodoForm, NoteEditor, NoteToolbar,
                         FormattedText, CompleteZone, CompletionFxLayer,
                         completionEffects, CompletionUndo, SettingsDialog
```

PostHog calls live in the main process so the key stays out of the renderer and
there is no CORS layer to fight.

## To-dos

A second board, reached by the sliding pill in the header. Three fixed columns —
This Month, This Week, Today — plus a completion bar across the bottom.

**Creating one is the `+` beside a column's label, or a right-click anywhere in
the column.** There is no add panel and no column picker: where you click *is* the
horizon choice, so the two cannot disagree. Right-click is the fast path — you do
not have to aim at a 16px button — and it is only on the three horizon columns;
the completion rail is a different component, so "not on Done" needs no special
case. Right-clicking a card or the open composer leaves the native menu alone, so
cut/copy/paste still works inside the fields.

The composer asks for a title first and only a title. **The note is a button with
a `+` on it** until you want one: most to-dos are a single line, and an
always-open field made the composer look like a form to fill in rather than a box
to type in. The button disappears once the field is open, and editing a to-do
that already has a note opens with it showing.

**The note field shows formatting, not markup.** Bold text is bold as you type
it, and typing `**it**` turns into **it** the moment you close the pair — the
same for `*italic*`, `++underline++`, `` `code` `` and `[label](url)`. The
toolbar under the field does the same job by button, and each button lights up
when that mark is on at the caret. Nothing you write is stored differently for
it: the note is still the plain text on the card, just no longer the only way to
see what it will look like.

**A link goes on the words that need one.** Select some text in the note, press
the toolbar's link button, and the URL wraps it as `[text](url)` — so a to-do can
point at the pull request it is about, the dashboard to check and the doc to read
without three anonymous URLs stacked under the title. With nothing selected the
URL becomes its own label, which is the whole-to-do link this replaced. On the
card it renders as a hyperlink that opens in your browser, and clicking it neither
opens the card's editor nor starts a drag. You can leave the scheme off:
`posthog.com/docs` is stored as typed and linked as `https://posthog.com/docs`.

A to-do written before this still has its own `url`, and its editor still shows
the field so it can be read or cleared — there is just no longer a way to add
another.

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
grabbed it; dropping it widens it back out into its column. The accounts board does
the same — both go through `DragCardOverlay` and `useCardDrag`, so the two boards
drag identically.

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

The bar carries a dashed outline at rest, and **triples in height** the moment a
card is picked up (60px to 180px), so where it can go is obvious without a legend.
The columns above give up the height; it never overlays them.

**Completing one is a drop on the bar.** Every completion sets off a two-cannon
rainbow confetti eruption from the bottom centre of the window — a tight jet
inside a wide fan — and
the card itself comes apart with a different effect each time — shattering into
shards, evaporating, imploding into the bar, or being stamped and filed. The
bar glows green while a card is held over it: the one place the board leaves its
monochrome palette, because "let go now" should read without having to look.

Urgency increases left to right, the reverse of the accounts board's progression.
That ordering predates the move to a bottom bar, when the completion target was a
right-hand lane and "nearest deadline nearest the rail" was the whole argument for
it. Every column now abuts the bar equally, so the left-to-right order is no
longer doing that work — it is kept because reading a week left to right is worth
having on its own, not because the layout still demands it.

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
- `linkHref` in `lib/links.ts` is the whole boundary between typed text
  and an `href` in a renderer running at the app's own origin, so it refuses
  anything that is not http(s) — a `javascript:` URL pasted into that field would
  otherwise execute there. It also supplies a missing scheme, which is not
  cosmetic: a bare `posthog.com/docs` in an `href` is a *relative* path, and the
  window would navigate itself to a file that does not exist. Order matters —
  anything that parses as a URL is judged on its protocol and never retried,
  because retrying is how `mailto:a@b.com` becomes a perfectly valid
  `https://mailto:a@b.com`. The known cost is that `localhost:3000` parses with a
  `localhost:` protocol and so is refused.
- The link in a history entry and the one on a to-do card are the same component
  (`ExternalLink`), because "what is safe to open, and what does the user see"
  must not be able to differ between two places that both hold a pasted URL.
- `target="_blank"` on it is load-bearing rather than habit: the main process
  turns an attempt to open a window into `shell.openExternal`
  (`setWindowOpenHandler` in `main/index.ts`), so the target is what sends the URL
  to the browser. A same-tab href would navigate the renderer off the app with no
  way back.
- `ExternalLink` stops both `pointerdown` and `click`. A to-do card is itself a
  click target that opens the editor, sitting on a drag sensor armed by
  pointerdown, so without them the link would open the editor instead of the page
  and a press-and-drag from it would take the card. Redundant in the outreach
  panel, and kept anyway so the component is safe wherever it lands.
- A to-do's link renders inside `TodoFace`, which is also cloned into the drag
  overlay and the completion effects' shards. That is safe without a special case:
  the overlay unmounts on drop, and `CompletionFxLayer` is `aria-hidden` and
  `pointer-events-none`, so a shard's anchor is inert and out of the accessibility
  tree.
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
- To-do titles and notes are written in a **small markup dialect**
  (`lib/noteMarkup`, painted by `components/FormattedText`): code, link, bold,
  italic, underline and colour. The note field carries a toolbar for all six
  (`components/NoteToolbar`).
- **The note field is a WYSIWYG editor** (`components/NoteEditor`, TipTap over
  ProseMirror). Bold text is bold in the field, and typing `**it**` converts on
  the closing asterisk — a textarea could never be this, since it renders one
  font and the only way to see the result was to save. The dependency buys a
  document model, input rules, undo and paste handling; hand-rolling a
  contenteditable would have meant writing all four, and getting undo wrong is
  the kind of bug you cannot apologise your way out of.
- **The dialect is still the storage format.** `lib/noteDoc` parses it into a
  ProseMirror document on the way in and serialises it back on the way out, so
  `todos.note` holds the same plain string it always did — greppable, readable in
  the weekly export, painted on cards by the same `FormattedText`. Swapping the
  field was not a data migration, and every note already written opens formatted.
  Verified: the one multi-paragraph note in the database round-trips byte for
  byte.
- The schema is assembled from single extensions rather than StarterKit, because
  what a note *may contain* is the point: no headings, lists, quotes, code blocks
  or rules. Each of those would be a construct the dialect cannot store and
  `FormattedText` cannot paint — silently lost on save. Leaving them out of the
  schema means they cannot be typed, pasted or dragged in.
- Serialisation has to choose a nesting order, since ProseMirror holds marks as
  an unordered set per character while `[**x**](url)` and `**[x](url)**` are
  different strings. `lib/noteDoc` ranks them (link, colour, bold, italic,
  underline, code) so the same document always produces the same text — otherwise
  opening a note and closing it would rewrite it. The one visible effect is that
  `{blue|[x](u)}` normalises to `[{blue|x}](u)`, which renders identically and is
  then stable.
- Marks are **shrunk off their own whitespace** on the way out. Select "ship it "
  with the trailing space, press bold, and ProseMirror marks the space too — but
  `**ship it **` does not parse back, so the bold would return as literal
  asterisks on the card. The span narrows to its own content, which is what the
  selection meant.
- Bold and italic have their **underscore input rules removed**. TipTap ships
  `__text__` and `_text_` next to the asterisk forms, and the dialect's founding
  rule is that an underscore is never a delimiter — because `$set_once` is the
  sort of thing this app gets used to write about.
- Link input goes through a hand-written rule, not `markInputRule`, which keeps
  the *last* capture group as the text — the URL, in `[label](url)`. The generic
  helper would have left the address on screen and hidden the label.
- The editor never navigates: `openOnClick: false`. This is an Electron renderer
  on the app's own origin, so following a link in place would replace the app
  with a web page and there is no way back. Links are for clicking when *reading*
  a note, and there they go through `ExternalLink` to the real browser.
- It is **not markdown, and deliberately a near-miss**. Real markdown fails on
  this content immediately: `$set_once` contains an underscore pair, so a
  markdown renderer italicises the middle of a PostHog property name. So italic
  is asterisk-only and underscores are never a delimiter anywhere; underline is
  `++doubled++` because markdown has no underline and a lone `+` appears in
  ordinary arithmetic; colour is `{blue|text}`, which markdown cannot express at
  all, in braces rather than raw HTML so nothing typed is interpreted by the
  browser. The one borrowing is `[text](url)`: a bracketed run followed with no
  gap by a parenthesised one is not a shape that turns up in a note by accident.
- The emphasis rules require a **non-space against the inside of each
  delimiter**, as markdown does and for the same reason: without it `2 * 3 * 4`
  is italic from the first asterisk to the second. `***x***` gets its own rule
  ahead of the other two, because it is what both marks on one run serialise to
  and neither of them can read it — CommonMark carries the same special case.
- A link's URL half stops at whitespace or `)`, so an unclosed `(` cannot run off
  into the rest of the note. The toolbar percent-encodes both on the way in,
  which is what lets the pattern stay that strict. The label is parsed on, so a
  link can also be bold or coloured.
- Links render through **`ExternalLink`**, not a bare `<a>` — the same component
  the outreach log uses, so the http(s)-only rule in `linkHref` and the
  `target="_blank"` that hands the URL to the real browser cannot end up weaker
  in a note than in a touch. Its `inline` variant inherits colour and marks
  itself with an underline alone, which suits a UI whose hierarchy is weight and
  spacing rather than hue.
- The colour picker offers **six**, not the palette's seven and not the ten it
  started as. Ten put three near-duplicate pairs on screen and made the swatches
  a grid to read rather than a row to point at. The *parser* still accepts any
  card hue, so trimming the picker changed what you can write next rather than
  turning `{pink|…}` in an existing note into visible braces.
- The colour trigger is a plain grey circle that **fills with the colour once one
  is picked**. It was a conic gradient of every swatch, which said "colours" but
  at 14px read as a smudge and never showed which one was in use.
- Both drop-downs are anchored on the **toolbar**, not on their own trigger, and
  only one can be open at a time. A column is `min-w-[188px]` and scrolls, so it
  clips horizontally: a panel hung off the fifth button along would open past the
  right edge and be cut in half.
- The link field calls `preventDefault` on Enter. It lives inside the composer's
  `<form>`, where Enter in a text input submits — so without it, adding a link
  would save the to-do instead. Escape is caught there too rather than bubbling
  to the note field, whose own handler closes the whole composer.
- Rule order is load-bearing twice. `code` is first, so a snippet containing `**`
  renders those asterisks instead of going bold. `bold` precedes `italic`, or
  `**x**` matches the italic rule first and leaves a stray asterisk each side.
  Every pattern refuses to cross a newline and requires content, so an unclosed
  delimiter stays the literal character it is rather than swallowing the rest of
  a note. Verified against unmatched, empty, nested, multi-line, `snake_case` and
  `2 + 2 + 3` inputs.
- Toolbar buttons toggle the mark on the selection and **light up when it is on
  at the caret** — which the textarea version could not do, because a selection
  in plain text has no formatting to report. Pressing one with nothing selected
  arms the mark for what comes next, as in any editor.
- `ui/textarea` had to be wrapped in `forwardRef`. shadcn's current source targets
  React 19, where `ref` is an ordinary prop; this project is on React 18, where
  React strips it before the component sees it. `<Textarea ref={…}>` type-checked,
  rendered, and left the ref null. Found when the old toolbar needed the node to
  read its selection; the next ref put on a textarea would have hit the same
  silence.
- The code chip and the inline link keep their class lists in `lib/noteStyles`,
  shared by `FormattedText` and the editor. That is the mechanism rather than a
  tidiness measure: the whole point of the editor is that a note looks the same
  while it is being typed as after it is saved, and two copies of a class list
  drift. Tailwind v4 scans `.ts` sources, so the classes are generated as if they
  were written inline.
- The chip is sized in `em`, not pixels, so one value serves a 13px card title,
  an 11px note and a 12px completed-list row. Its background is an ink wash with
  a `ring`, not `--color-surface`: surface was #fafafa on a white card, a
  one-step difference that vanished at 11px, and in dark mode it is *darker* than
  the card so the chip read as a hole. A ring rather than a border because a ring
  is a box-shadow and adds no layout inside line-clamped text.
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
- The completion bar participates in collision detection **by pointer only**, and
  is filtered out of the geometric fallback. It runs the full width directly under
  all three columns, and geometric detection resolves against the dragged card's
  rectangle rather than the cursor, so without this a card released low in any
  column while merely overlapping the bar would be completed. This matters *more*
  as a bottom strip than it did as a right-hand lane: every column now has an edge
  against it, not just the last one. The cost is that the bar is unreachable by
  keyboard drag, which is why every card carries a "Done" button.
- The bar **triples in height** while a card is in flight (60px to 180px), which
  is the signal that it is a target. Its dashed outline is visible at rest too —
  the border is what says there is a target at all, so it is never transparent;
  arming steps it from the muted line to the strong one and fills the surface. That is only safe because `TodoBoard` sets
  `measuring={{ droppable: { strategy: MeasuringStrategy.Always, frequency: 50 } }}`.
  dnd-kit's default measures droppables **once** at drag start, so growing the bar
  afterwards would leave every cached rect stale: the bar would accept drops where
  it used to be and ignore the strip of itself that just appeared, and the three
  columns above it shorten too, so their lane rects go stale in the same moment.
  Those two changes go together — do not revert one without the other.
  The bar grows **in flow**, never as an overlay, so it cannot sit on top of the
  columns and steal drops meant for them.
- The columns row carries `min-h-0`. A flex child defaults to `min-height: auto`
  and refuses to shrink below its content, so without it the bar's growth would
  push the columns off the bottom of the window instead of taking height from them
  — and the lanes would scroll rather than resize.
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
  over the completion target, which used to be a lane hard against the right edge,
  so most of the burst threw itself off screen and the rest was crammed into the
  corner. Measured at bottom centre: launch x is 50% of the window, the arc reaches
  10% from the top, and 0% of particles leave either edge. The card still comes
  apart at its own rect — only the confetti moved. Now that the target is a bottom
  bar the two happen to agree, but the burst is still anchored to the window rather
  than to the drop, and should stay that way — it is what keeps the arc on screen.
- The undo toast sits at `bottom-24`, not `bottom-5`, so it clears the completion
  bar rather than covering its "Done" control. It is the bar's **resting** 60px
  that has to be cleared, not the armed 96px: the toast only ever appears after a
  drop, by which point the bar has already shrunk back.
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
  nothing assigned could never reach their to-dos.

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
- The header's right-hand side is an **avatar menu**, not a row of buttons.
  Confetti, the theme toggle, Settings and Sign out were all app-level — none of
  them acted on what was on screen — so as labelled buttons they competed with the
  board for attention and width. The layout picker stayed in the bar precisely
  because it *is* board-level. The signed-in email became the menu's label, which
  is where an account menu says whose account it is.
- The avatar is a monogram and always will be: PostHog's identity carries an email
  and a first name, no photo, so there is no picture for it to be a placeholder
  for.
- Confetti now renders in the menu on both views, where it used to appear only on
  the to-do board. A row that appeared and vanished with the tab would read as a
  glitch, and the menu is app-level.
- The header's sync control refreshes BOTH boards. It renders in both views, so
  wiring it only to `board.refresh()` made it look like the obvious way to recover
  a to-do board that failed its initial load, while doing nothing for it.
- That control is a **refresh icon, not a labelled button**, and the "Synced N
  ago" line it replaced is now its tooltip (500ms delay). The age and the action
  that changes it are one subject, so they are one control rather than a sentence
  at one end of the bar and a button at the other. It stays in both views for the
  reason above — scoping it to the accounts view would take the recovery path
  away from the to-do board again.
- The tooltip's text is a **component** (`SyncAge`), not an inlined
  `{syncAge(fetchedAt)}`. JSX children are evaluated during the parent's render,
  so an inlined call would freeze the string at whenever `TopBar` last rendered —
  and now that the tooltip is the only place the age appears, a board left open
  for an hour would go on claiming it synced "2 min ago". Radix mounts content on
  open, so a component re-reads the clock every time it is shown.

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
- The landing is **two beats**: hold at half width for the drop animation's own
  duration, then expand. Both beats used to start together, so the card widened
  underneath the still-flying overlay and was already near full width by the time
  the overlay unmounted — the expansion was never visible and the card read as
  popping open. `HOLD_MS` is taken from `DROP_ANIM` so the two cannot drift.
- The hold is a repeated keyframe (`['50%', '50%', '100%']` with `times`), not a
  `delay`. A delay would leave the card at its natural full width for the wait and
  then snap to half before expanding — a flash, not a fix. Note this relies on
  motion applying a single `ease` **per keyframe segment**; raw WAAPI instead
  applies its `easing` across the whole animation, which would eat into the hold.
- That widen is `useAnimate` on its own wrapper div, not an `initial` and not a
  state-driven `animate`. A card reordered inside its own column is never
  unmounted, so `initial` would not re-run; and a declarative `animate` would have
  to pass through the half-width value on the way in. Its own wrapper because the
  card already has a motion element for the entrance transform and the sortable's
  dnd-kit transform below that — three wrappers, one job each, none fighting over a
  `transform`.
- Width, not `scaleX`. Scaling squashes the text horizontally; narrowing lets it
  rewrap and stay readable.
- The widen's wrapper carries `mx-auto`, and it is not decoration. A block element
  animated from 50% to 100% width grows from its **left edge**, so without it the
  landing card clings to the left of the column and unfurls rightwards. Auto
  margins keep it centred so it opens out both ways at once. Deliberately margins
  rather than a transform: a transform would also make the wrapper a containing
  block for anything positioned inside the card. Measured mid-animation, the gaps
  on either side stay equal (150/150 at half width, 18/18 near the end).
- `release()` sends the overlay's x to **`width / 4`, not 0**, so it lands centred
  in the slot. dnd-kit flies the overlay home to the source node's rect, which is
  the card's *full* width, while the overlay inside it is half that — so x = 0 put
  it against the slot's left edge while the placed card underneath was centred by
  its auto margins, and the card appeared to hop sideways the moment the overlay
  unmounted. Verified the two coincide to the pixel: on a 599px slot both the
  centred card and the landed overlay occupy 808→1108.
- The landing width is written by hand in a **layout** effect before `animate()`
  is called. The card is placed at its natural full width in the same commit that
  sets `landed`; a `useEffect` runs after paint and motion schedules its first
  keyframe a frame later again, so the card painted full width and then snapped to
  half — which read as it flashing out to the left before the animation started.
  Three things had to be true together for this animation to look right: land the
  overlay centred, centre the card with auto margins, and set the width before the
  first paint. Any one of them missing brings back a visible jump.
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
- Both boards now drag through the **same** three pieces, so there is one feel to
  change rather than two to keep in step: `useCardDrag` (the board half — grab
  measurement, the pickup offset, the landed flag), `DragCardOverlay` (the
  in-flight card), and `useLandingWiden` (the card half). The accounts board used
  to hard-code `w-[212px]` on its overlay and had none of the rest, so a card
  behaved differently depending on which tab you were on.
- The source card is measured via `[data-drag-id]`, the same attribute on both
  boards, because one hook does the measuring for both. It replaced
  `[data-todo-id]`; `[data-todo-card]` is a different marker and still exists, for
  a column's click-to-create to ignore clicks that started on a card.
- `useCardDrag` is called by the board and `useLandingWiden` by the card, and they
  have to agree on the half-width figure. That is why they share a file rather than
  sitting next to their callers.
- Only the *card* overlay is shared. The accounts board's column overlay is
  deliberately still its own thing: a column drags by its header and its overlay is
  a label chip, not a copy of a full-height column, so `Board.tsx` calls `grab()`
  only when the drag is not a column.

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

### Reviewing the UI in a browser

`pnpm dev` serves the interface to any browser, so `http://localhost:5173` opens
the board in a tab — useful for reviewing and annotating the layout next to the
app window.

A tab has no Electron **preload**, so `window.api` is absent and the app used to
stop dead on its first bridge call. `lib/devBridge.ts` installs a stand-in from
`main.tsx` when there is no real bridge, and a dev-only Vite endpoint
(`/__dev/accounts`, in `electron.vite.config.ts`) hands it the account book from
the cache the main process writes on every successful sync. **Run a sync in the
app window once and the tab has your real accounts, ARR and all** — no API key
ever reaches the browser, because the key lives in the OS keychain and only the
main process can read it.

Only four things are stubbed: the keychain (`posthog.connect`), the native save
dialog (`files.saveText` becomes a browser download, so the weekly export still
works), the app menu, and the accounts fetch described above. Everything else —
colours, channels, touches, to-dos, logos — was always Supabase read straight
from the renderer, so it is the real thing in both.

**It never ships.** The only call site is behind `import.meta.env.DEV`, which
Vite replaces with `false` in a build, so the dynamic import is eliminated and
the module is not in the production bundle. The Vite endpoint is `apply: 'serve'`
and does not exist in a build either. `installDevBridge` also refuses to install
over a real bridge, so it cannot shadow Electron's.

**Two deliberate choices about fidelity.** The payload reports `fromCache: false`
even though it came from a cache: `true` paints the "PostHog was unreachable"
banner across the top of the board, and a strip of UI the real app would not be
showing sits exactly where a reviewer is trying to look. The age is still honest,
because `fetchedAt` is the cache's own timestamp and the header renders it. And
nothing draws a badge on the page — the install logs to the console instead —
for the same reason: a tab is for judging pixels, so its pixels must match.

**The endpoint needs one `pnpm dev` restart** to exist at all, because Vite reads
its config only at startup. Until then there is a fallback: a snapshot of the
book pasted into `localStorage['csm-os:dev-accounts']`, which the bridge uses
whenever the endpoint is missing or empty. Seed it from the same cache file:

```js
// paste in the tab's console, with the contents of
// ~/Library/Application Support/csm-os/accounts-<url-encoded email>.json
localStorage.setItem('csm-os:dev-accounts', '<that file>')
```

The endpoint is preferred once it exists, because it re-reads the cache on every
call and so follows a re-sync on its own. **The snapshot is frozen at whenever it
was pasted** — if the book changes, re-paste it or restart the dev server.

**Why the failure was cryptic before.** A request for a missing endpoint does not
404: Vite's SPA fallback answers **200 with `index.html`**, so nothing goes wrong
until `res.json()` meets a `<` and reports `Unexpected token '<'`. Status is
useless as a signal here, so the bridge checks the **content type** instead and
says which of the two fixes applies.

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

## The core package and the MCP server

- `src/core` exists because two processes need the same answers. The renderer
  and the MCP server both read and write the same board, and the rules that make
  a write correct are not in the schema — they are in code. Splitting them would
  mean the agent and the UI could disagree about what a valid row looks like.
- **It was almost free to extract.** `board.ts` had no browser APIs — no
  `localStorage`, no `window`, no `document` — and every function already took
  `email` explicitly. The only tie to the renderer was one import of a Supabase
  client built from `import.meta.env`. That client is now injected
  (`core/supabase.ts`), and nothing else in the file changed.
- The renderer's `lib/board`, `lib/layouts`, `lib/todos`, `lib/accountMatch` and
  `lib/touchChannels` are re-export barrels onto core rather than moved imports.
  Fifteen call sites keep working untouched, and `lib/board` additionally
  imports `./supabase` for its side effect, which is what guarantees the client
  is registered before any component can reach a query.
- `lib/colors` and `lib/channels` are split rather than moved: the palette and
  the channel enum are data, but `cardSurfaceStyle` returns a React
  `CSSProperties` and the channel marks are imported SVGs. Only a bundler can
  produce the second kind.
- **`tsconfig.mcp.json` has no `DOM` lib, and that is the enforcement.** Core is
  compiled by both the web project and the MCP project, so the day someone
  reaches for `localStorage` in there, the MCP typecheck fails and says so.

### Three invariants were living in the wrong place

Each of these was correct only because a single call site remembered to apply
it. Moving them next to the query is what makes a second caller safe:

- `normalizeTodoValues` was applied in `useTodos`. A `pr` or `other` to-do that
  kept its `org_id` renders wearing a customer's logo. Now applied inside
  `addTodo` and `updateTodo`.
- `normalizeTouchValues` was applied in `useTouchLog` and `CadenceTouchDialog`.
  A non-`link` touch that kept a url renders a clickable anchor on a phone call.
  Now applied inside `addTouch` and `updateTouch`.
- `freeSlot` and the sibling-exclusion rule were in `useTodos`. Both are now
  `todoPositionFor`, beside `accountPositionFor`, so an agent places a card by
  the same arithmetic as a drag.

A fourth turned up during testing rather than review: `loadStages` reads
`board_stages`, but a computed layout's columns come from `lib/layouts`, and
`useBoard` knew that inline while the MCP server did not. `board_stages` still
holds the cadence rows from before that layout became computed, so
`list_layouts` cheerfully reported columns named "Overdue" and "Due Soon" that
appear nowhere in the app. `loadColumns` is now the one way to ask.

### Why the server talks to Supabase rather than to the app

Driving the running Electron app over a socket would update the UI directly, but
the business logic lives in React hooks that are state machines — reaching them
from outside means either exposing a command per hook or replaying user
gestures, and it only works while the app is open. Going straight to Supabase
needs no keychain access and no PostHog key: the account book is read from the
cache the main process writes on every sync, which is the same route the dev
browser bridge takes, for the same reason.

The cost is that the book is only as fresh as the last sync in the app. Names,
domains and ARR move on the order of weeks, so that is the cheaper side of the
trade than a second copy of the PostHog credentials on disk.

`CSM_EMAIL` is configuration and never a tool argument. RLS here is permissive
and scoped by `csm_email`, so a tool that accepted an email would let a prompt
write to a colleague's board.

### Realtime, and the two things it needs from the database

An open board used to see only its own writes, which made agent-driven changes
invisible until a manual sync — and left the board holding stale positions, so
the next drag would midpoint against numbers that had already moved.
`useSupabaseSync` subscribes to the five board tables and **refetches** rather
than merging the payload: both boards are optimistic, so merging would mean
reconciling an echo of your own change against the version already on screen,
for every table, forever.

Two migrations were needed, both reversible:

- The tables had to join the `supabase_realtime` publication.
- They needed `replica identity full`. A `DELETE` otherwise carries only the
  primary key, so a subscription filtered on `csm_email` never sees one — the
  column is not in the payload to match against. This showed up as creates
  arriving live while deletes silently did not.

### The flash: two bugs behind one symptom

Shipping realtime made every drag flash the whole board and appear to reload.
Two separate faults, and the second was hiding behind the first.

**A background reload must not raise the loading flag.** `loading` swaps the
board for a spinner, which is right when there is nothing to show yet and wrong
when the board is already on screen. `useBoard` sets it at the top of the layout
effect and `useTodos.load` at the top of its own, so a realtime-triggered reload
went through the same "first paint" path as a cold start. Now a quiet run skips
the flag: `useBoard` reads a one-shot ref (state would leak the mode into a later
layout switch and lose its spinner), and `useTodos` has `revalidate()` beside
`reload()`.

**And the reload should not have happened at all.** A `postgres_changes` payload
says what changed, never who changed it, so an app that reloads on every event
spends its time reloading in response to itself. Every mutating query in
`core/board.ts` now goes through `write()` instead of `db()`, which notes the
time; `useSupabaseSync` defers while that is recent. Deferring rather than
dropping matters: a genuinely remote change arriving mid-drag still lands, once
things are quiet. Without it there was also a race — a second drag inside the
window would be refetched away and then reinstated by its own echo, so a card
visibly jumped back.

Only 22 of the 34 exported functions mutate, and several read first and seed only
when empty (`loadLayouts`, `loadStages`), so the conversion is per statement
rather than per function. Marking a SELECT as a write would keep the quiet window
permanently hot.

### What that flash was hiding

Chasing it turned up a worse bug in the same feature: `loadCardProps` and
`loadLastTouches` were only called inside `loadAccounts`, which is the PostHog
sync path. A background reload reruns the layout effect and never that, so
colours, contact channels and last-touch dates never refreshed from outside the
window. On the cadence layout that is not cosmetic — the touch dates decide which
column a card is in, so an MCP-logged touch left the card where it was. They are
read with the layout now.

It survived the original testing because that testing used a to-do, which comes
through `useTodos` and did refresh. Verifying that the data arrives is not the
same as verifying that it arrives everywhere, or pleasantly: the spinner flash
was present in those first tests too, and counting cards in the DOM could not see
it.

## Account search (⌘K)

- The board is a spatial tool and a card's column *is* information, but that
  works against you when you know which account you want and not where it is.
  With thirty accounts across six columns and horizontal scroll, that is most of
  the time. The palette is the way in that does not depend on remembering where
  something sits.
- **`lib/accountSearch` is not `lib/accountMatch`**, and the split is deliberate.
  `accountMatch` finds the account *named inside a sentence* and refuses an
  ambiguous guess, because guessing wrong silently re-files a to-do. Search has
  the opposite trade: the query is a fragment, several accounts legitimately
  match, and the person is looking at the list and choosing, so being generous
  costs nothing.
- Ranked in tiers by how confident the match is, not by how much of the name it
  covers: exact, name prefix, word prefix, name substring, domain substring,
  then subsequence. That keeps "la" ordered Lahzo, LayerZero, Leland, TrustLayer
  — rather than reordering them because the letters happened to sit closer
  together in one. Folding drops punctuation and spacing on both sides, so
  "US Mobile", "us-mobile" and "USMobile" are one string and "bootd" reaches
  Boot.dev. Subsequence is what makes "wsbc" find WorkSafeBC.
- An empty query returns the whole book in name order, so opening the palette and
  pressing Down is a way to browse rather than a dead end.
- The component owns its own shortcut instead of taking an `open` prop, so the
  call site is one line and there is no open state to keep in step with a key
  handler. It is disabled on the to-do board, where there is no account to open.
- The "is another dialog already up?" guard matches
  `[data-slot="dialog-content"][data-state="open"]`, and the state selector is
  load-bearing. Radix keeps a closing dialog mounted until its exit animation
  ends, so matching the slot alone also matches the palette's own corpse —
  pressing the shortcut twice quickly meant the second press was swallowed by the
  first one still leaving.
- Highlight moves on `pointermove` rather than CSS `:hover`, so mousing across
  the list moves the same highlight Enter acts on instead of lighting a second
  one.

### The preview cannot see any of this close

Chasing the double-press bug turned up why: a plain 150ms CSS animation never
fires `animationend` in the collaborative browser tab, and `requestAnimationFrame`
never fires either — the tab produces no frames. Radix unmounts on `animationend`,
so in that tab *every* dialog in the app stays mounted after it closes. It reads
exactly like a leak in whatever you just wrote. Check `data-state` rather than
presence before believing it, and prove the environment with a throwaway
animation rather than reasoning about it.

### The bare-border bug, finally swept up

`tooltip`, `select` and `dropdown-menu` each carry a comment about naming their
border colour, because this project has no global `* { border-color }` rule and
an uncoloured `border` falls back to currentColor — which is ink, and draws a
black box. Two vendored components were still missing it:

- `DialogContent` had a bare `border`, so every dialog in the app — settings,
  the completed list, the cadence touch form, the account palette — was outlined
  in near-black instead of `--color-line`.
- `button`'s `outline` variant had a bare `border` in light mode and
  `dark:border-input` in dark, so Cancel inside the touch form wore a black
  outline while the dialog around it was muted. Now `border-input` on both,
  which the theme points at `--color-line`.

Worth knowing when adding any shadcn component with its CLI: the vendored source
assumes that global rule exists, so check every `border` it ships with before
trusting how it looks in dark mode.
