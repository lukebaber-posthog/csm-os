# CSM OS

A desktop board for tracking outreach across a PostHog CSM book of business.
Accounts are read live from PostHog; where each account sits on the board and
every logged touch live in Supabase.

## Running it

```bash
pnpm install
pnpm dev
```

On first launch:

1. **Sign in** with your email. It is checked against the `csm_users`
   allowlist — no password, no emailed code.
2. **Connect PostHog** by pasting a personal API key. Create one under
   [PostHog → Personal API keys](https://us.posthog.com/settings/user-api-keys)
   with the `query:read` scope, scoped to the **PostHog App + Website** project.
   The key is encrypted into the OS keychain via Electron `safeStorage` and is
   only ever read by the main process — the renderer cannot access it.

Both steps are remembered, so later launches open straight onto the board.
Signing out clears your email but keeps the key, so you don't re-paste it.

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
- Click anywhere else on a card to open its panel: exact ARR, segment,
  assignment date, and the outreach log. Log a touch with a channel, date, and
  optional note.
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

## What is stored where

| Data | Location | Why |
| --- | --- | --- |
| Account names, ARR, segment | PostHog (live), cached on-device | ARR is deliberately kept out of Supabase |
| Column placement, per layout | Supabase `board_placements` | Needs to persist and be editable |
| Card colour, account name | Supabase `board_cards` | Per-account, shared across layouts |
| Columns, labels, order | Supabase `board_stages` (keyed by layout) | Renameable, reorderable, 2–10 per layout |
| Logged touches | Supabase `touches` | Drives days-since-contact |
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

Component styling is utility classes throughout. Three deliberate exceptions:

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
    ipc.ts               IPC handlers, errors returned as data
    posthog.ts           PostHog query client
    secrets.ts           API key encrypted via safeStorage
    cache.ts             On-device account cache
  preload/index.ts       The only surface the renderer gets
  renderer/src/
    lib/                 supabase client, all board queries, layouts, colours, formatters
    hooks/               useBoard (state machine), useTheme
    components/          Board, Column, AccountCard, CardColorToolbar,
                         LayoutPicker, AccountDrawer, TopBar, ui/
```

PostHog calls live in the main process so the key stays out of the renderer and
there is no CORS layer to fight.

## Notes for future changes

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
  panel opens behind the toolbar.

### Testing drag-and-drop from a script

Synthetic mouse input needs care. `sendInputEvent` delivers `pointerdown` with
`buttons: 0`, so dnd-kit needs several genuine `mouseMove` events before it
arms, and a lead-in `mouseMove` before `mouseDown` to establish cursor position.
Moves paced faster than roughly 30px / 45ms get coalesced, and the drop then
resolves against a stale pointer position — which looks exactly like a
collision-detection bug but isn't.

Two more traps once the board scrolls horizontally: an element's
`getBoundingClientRect()` may be outside the window entirely (scroll it into view
first, or the press lands on nothing), and dnd-kit auto-scrolls the board mid-drag,
so coordinates computed before the drag go stale. Prefer short drags between
adjacent columns, away from the container edges.

### Obvious next steps

- Intro coverage as a per-account flag rather than a column (see the note above)
- Filter/search across the board
- Auto-place into Overdue / Due Soon from days-since-contact instead of manually
- Pull real signals into the card: last Gong call, last Slack message, open
  Zendesk tickets
- Per-column WIP limits, and a colour on the column itself
- Reorder the layouts, and let a layout be created from the UI rather than code
