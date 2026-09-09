# CSM OS

A desktop board for tracking outreach across a PostHog CSM book of business.
Accounts are read live from PostHog. Where each one sits on the board, and every
touch you log against it, live in Supabase.

It's an Electron app: React and Vite in the renderer, Tailwind v4 for styling,
Supabase for everything that persists.

## Getting started

You need Node 20 or newer and pnpm. `corepack enable` gets you pnpm if you don't
already have it.

```bash
git clone git@github.com:lukebaber-posthog/csm-os.git
cd csm-os
pnpm install
cp .env.example .env
```

Fill in two values in `.env`, both from Supabase under Settings → API:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | The project URL, like `https://abcdefgh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The publishable key, `sb_publishable_…` |

Then start it:

```bash
pnpm dev
```

Sign in with your PostHog email. Any `@posthog.com` address works, with no
password and no list to be added to. Then paste a PostHog personal API key when
it asks. The key is encrypted into your OS keychain and only ever read by the
main process, so the renderer never sees it. Both steps are remembered, and
signing out keeps the key so you don't have to paste it again.

**A blank white window on first run is almost always `.env`.** Vite inlines those
variables at build time, so a missing one throws on load and there's nothing on
screen to tell you. Open the devtools console (View → Toggle Developer Tools) and
it will name the variable.

**A board that loads but is empty** means sign-in worked and the account lookup
found nothing. Ownership is read from the CSM relationship in PostHog's Customer
Analytics, so accounts you hold under any other role won't appear.

## What you need

- **Node 20+ and pnpm.**
- **A PostHog personal API key** with the `query:read` scope, scoped to the
  PostHog App + Website project. Create one under
  [Personal API keys](https://us.posthog.com/settings/user-api-keys). This goes
  into the app, not into `.env`.
- **Supabase URL and publishable key** for the board database. Ask whoever set it
  up, or read them off Settings → API if you have access.
- **A [logo.dev](https://logo.dev) publishable key** as `VITE_PUBLIC_LOGO_DEV_API`,
  optional. Without it the app runs fine, but every card shows a monogram instead
  of the account's logo.

Two more optional variables are read by the main process rather than the
renderer: `POSTHOG_HOST` (defaults to US cloud, change it for EU) and
`POSTHOG_PROJECT_ID` (defaults to 2, where the customer-analytics tables live).
Restart `pnpm dev` after editing `.env`.

One caveat if you're thinking of pointing this at your own Supabase project:
swapping the two values isn't enough. The schema isn't checked in as migrations,
so you'd have to recreate the tables, the RLS policies and a couple of RPCs
first.

## What it does

### The accounts board

Your book as cards in columns. Drag one and the move saves immediately. There are
two layouts, switched from the header, and each keeps its own arrangement so
flipping between them loses neither.

**Relationship** is the one you arrange by hand, running from "Haven't reached
out" through to "Happy self-serve". Its columns can be renamed, reordered, added
and deleted, between 2 and 10 of them.

**Cadence** is computed from your touch log instead: Never contacted, 31+ days,
21–30, 11–20, 4–10, 0–3. An account sits in whichever bucket its last logged
contact falls into, so nothing is stored and the columns can't be edited.
Dropping a card into a different column opens the touch form rather than moving
the card, seeded to a date that would put it where you dropped it. Log the touch
and the card moves because the underlying fact changed. Dismiss the form and
nothing is written.

Each card shows the account's logo, its ARR, and how long it's been since you
last spoke. Click the logo square to give it a colour, which follows the account
across both layouts. The channel pill records where that relationship actually
lives (Slack, Gmail, Teams or Discord) and collapses to a single mark once you've
picked one.

Click anywhere else on a card to open its panel: exact ARR, assignment date, and
the outreach log. A touch is an Email, Call, Meeting, Slack message, Link or
Other, with a date and an optional note, all editable afterwards. Link behaves
differently from the rest because it records something you *sent*, so it takes a
URL and renders it as a hyperlink on the entry.

### The to-do board

Reached by the pill in the header. Three columns by horizon (This Month, This
Week, Today) and a completion bar across the bottom.

Add one with the `+` beside a column label, or by right-clicking anywhere in the
column, which saves you aiming at a small button. Where you click is the horizon,
so the two can't disagree. A pill under the title says what the to-do is about:
an account, a PR, or your own work. Typing an account's name in the title links
it automatically, and you can override that with the picker.

The note field is a small rich-text editor. Bold text is bold as you type it, and
typing `**like this**` converts the moment you close the pair, same for italic,
underline, `code` and links. The toolbar underneath does the same by button.
What's stored is still plain text, so notes stay greppable and readable in the
export.

Completing a to-do is a drop on the bottom bar, which triples in height as soon
as you pick a card up and glows green when you're over it. Nothing is deleted:
`DONE` opens the completed list with a Restore on every row. And yes, completing
something sets off confetti. There's a Mega Confetti toggle in Settings if the
default isn't enough.

### Elsewhere

Settings has an **Export last 7 days**, which writes a markdown file of every
touch logged and every to-do completed in the window, grouped for handing to an
AI agent as context.

The account book is cached on-device, so the board still opens when PostHog is
unreachable. It says so in the header, and dragging and logging keep working.

## Working on it

| Script | What it does |
| --- | --- |
| `pnpm dev` | Dev server with hot reload, the one you want day to day |
| `pnpm typecheck` | Both tsconfigs, no emit |
| `pnpm build` | Bundles main, preload and renderer into `out/` |
| `pnpm start` | Runs the built bundle, needs `pnpm build` first |
| `pnpm package` | Unpacked macOS `.app` via electron-builder |

Roughly where things live:

```
src/
  shared/types.ts     Types crossing the process boundary
  main/               Window, menu, IPC, PostHog queries, keychain, cache
  preload/index.ts    The only surface the renderer gets
  renderer/src/
    lib/              Supabase client, board queries, layouts, colours,
                      channels, the note markup dialect, formatters
    hooks/            useBoard, useTodos, useTouchLog, useTheme
    components/       The two boards and everything in them
      ui/             shadcn primitives, plus hand-rolled Notice and Spinner
```

PostHog calls live in the main process so the API key stays out of the renderer
and there's no CORS layer to fight.

A few house conventions worth knowing before you start:

- **shadcn components are vendored, not installed.** Add more with
  `pnpm dlx shadcn@latest add popover sheet`. Restyle by editing the tokens in
  `styles.css`, never the vendored component source, so it stays safe to re-add.
- **Import shape tells you what you're reaching for.** `@/` for the shadcn
  surface, relative paths for this app's own modules.
- **Tailwind v4 is configured from CSS.** There's no `tailwind.config.js`; the
  design tokens are the `@theme` block in `src/renderer/src/styles.css`.
- **Supabase is shared.** Additive changes (a new nullable column, a new table)
  land safely for everyone. Renames and drops break other people's app until they
  pull.
- **`.env` is yours, `.env.example` is shared.** A new variable belongs in both,
  or the next person's copy won't start.

[docs/design-notes.md](docs/design-notes.md) is the long version: why things are
built the way they are, and the traps that have already caught someone. Worth
opening when something looks odd and you suspect it's deliberate.

### Making it your own

The board is scoped to whoever signs in, but the features are still whatever
happened to be useful to one person. Take a copy and build what you actually
need:

```bash
git checkout -b <your-name>/main
```

Very little here is load-bearing opinion. Columns and layouts are data rather
than code (`lib/layouts.ts`), the to-do kinds are a three-value CHECK you can
extend, and every PostHog read is one HogQL string in `src/main/posthog.ts`. If
you want a renewal-date column, a Slack digest, or a different definition of
"stale", add it.
