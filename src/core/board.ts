import { db } from './supabase'
import { LAYOUTS, intakeStageOf, layoutDef, type Layout, type Stage } from './layouts'
import { isCardColor, type CardColor } from './colors'
import { isContactChannel, type ContactChannel } from './channels'
import { isTodoBucket, isTodoKind, normalizeTodoValues, type TodoBucket, type TodoKind } from './todos'
import { normalizeTouchValues } from './touchChannels'
import type { Account, TouchChannel } from '../shared/types'

/** Every Supabase read and write the app performs. Components stay presentational. */

/** Where an account sits within one layout. */
export interface Placement {
  orgId: string
  stageKey: string
  position: number
}

export interface Touch {
  id: string
  orgId: string
  channel: TouchChannel
  note: string | null
  /** Only ever set on a 'link' touch — see `normalizeTouchValues`. */
  url: string | null
  occurredAt: string
}

/** The editable body of a touch — everything except who and which account. */
export interface TouchValues {
  channel: TouchChannel
  note: string
  /** Empty on every channel but 'link', where it is the point of the entry. */
  url: string
  occurredAt: string
}

export interface Todo {
  id: string
  title: string
  note: string | null
  /** An optional link the to-do is about. Null when none was given. */
  url: string | null
  bucket: TodoBucket
  position: number
  /** What it is about: an account, a pull request, or your own work. */
  kind: TodoKind
  /** The account this is about. Only ever set when `kind` is 'account'. */
  orgId: string | null
  /** Null while open. Set once completed; the board reads only null rows. */
  completedAt: string | null
  createdAt: string
}

/**
 * The editable body of a to-do — everything the form owns. Excludes `position`
 * (drag owns it) and `completedAt` (the completion rail owns it), the same way
 * TouchValues excludes `id` and `orgId`.
 */
export interface TodoValues {
  title: string
  note: string
  /** Empty when no link was given. Meaningful for every kind — a PR to-do's
   *  link is the pull request, an account's might be a dashboard. */
  url: string
  bucket: TodoBucket
  kind: TodoKind
  orgId: string | null
}

/** Per-account card properties, keyed by org id. */
export interface CardProps {
  colors: Record<string, CardColor>
  channels: Record<string, ContactChannel>
}

/** Gap between card positions, leaving room to drop between neighbours. */
const POSITION_STEP = 1000

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

/**
 * The float position a row should take when dropped at `toIndex` within
 * `siblings`, which must already exclude the row being moved. Midpointing
 * between neighbours means a drop rewrites one row, not the whole column.
 *
 * Structurally typed rather than taking a Card, because both boards use it.
 */
export function positionFor(
  siblings: readonly { position: number }[],
  toIndex: number
): number {
  const prev = siblings[toIndex - 1]
  const next = siblings[toIndex]
  if (!prev && !next) return POSITION_STEP
  if (!prev) return next.position - POSITION_STEP
  if (!next) return prev.position + POSITION_STEP
  return (prev.position + next.position) / 2
}

/**
 * The position a to-do should take when dropped at `toIndex` of `toBucket`.
 *
 * Lived in `useTodos` until the MCP server needed the same answer. Two rules are
 * folded in here that a caller doing its own arithmetic would have to remember:
 * the dragged row is excluded from its own midpoint (a same-column drag would
 * otherwise midpoint against itself and land on a duplicate position), and an
 * exact collision is nudged clear.
 *
 * The nudge is 1e-6 against neighbours a whole `POSITION_STEP` apart, so it can
 * separate two rows without reordering anything around them.
 */
export function todoPositionFor(
  all: readonly Todo[],
  id: string | null,
  toBucket: TodoBucket,
  toIndex: number
): number {
  const siblings = all
    .filter((t) => !t.completedAt && t.bucket === toBucket && t.id !== id)
    .sort((a, b) => a.position - b.position)

  const taken = new Set(siblings.map((t) => t.position))
  let position = positionFor(siblings, toIndex)
  for (let i = 0; i < 64 && taken.has(position); i++) position += 1e-6
  return position
}

/**
 * The same, for an account card within one layout's column. Thinner than the
 * to-do version because placements carry a unique constraint per column, so
 * there is no collision to nudge away from.
 */
export function accountPositionFor(
  placements: readonly Placement[],
  orgId: string,
  toStageKey: string,
  toIndex: number
): number {
  const siblings = placements
    .filter((p) => p.stageKey === toStageKey && p.orgId !== orgId)
    .sort((a, b) => a.position - b.position)
  return positionFor(siblings, toIndex)
}

/**
 * A layout's columns, from whichever source is authoritative for it.
 *
 * For a computed layout that is the definition in `lib/layouts`, never
 * `board_stages`. The table still holds whatever that layout's columns were
 * before it became computed — the cadence rows in there today still say
 * "Overdue" and "Due Soon" — and those rows are no longer read by anything, so
 * they are stale rather than wrong to keep. Reading them back would report
 * column names that appear nowhere in the app.
 *
 * `useBoard` did this inline and the MCP server did not, which is exactly the
 * kind of split this module exists to close.
 */
export async function loadColumns(email: string, layoutKey: string): Promise<Stage[]> {
  const def = layoutDef(layoutKey)
  if (def.computed) return def.stages.map((st, i) => ({ ...st, position: i }))
  return loadStages(email, layoutKey)
}

/**
 * Records the signed-in user. Not a permission check — `lib/team` decides who
 * may sign in — but the row the rest of the schema hangs on.
 *
 * `csm_users` used to be the login gate and is now a registry, because every
 * other table carries `csm_email` with a foreign key to this one. Without a row
 * here the first write of a new session (seeding `board_layouts`) fails on the
 * constraint and the board never opens, so loosening the gate without this would
 * just move the rejection somewhere less legible.
 *
 * `ignoreDuplicates` makes it ON CONFLICT DO NOTHING, so an existing user keeps
 * their `active_layout` and a returning sign-in costs one no-op statement rather
 * than a read to decide whether to write.
 */
export async function registerUser(email: string): Promise<void> {
  const { error } = await db()
    .from('csm_users')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
  fail('Could not sign you in', error)
}

// --- Layouts ---------------------------------------------------------------

/** The user's layouts, seeding the built-in presets if they have none. */
export async function loadLayouts(email: string): Promise<Layout[]> {
  const { data, error } = await db()
    .from('board_layouts')
    .select('key,label,position')
    .eq('csm_email', email)
    .order('position')
  fail('Could not load layouts', error)

  if (data && data.length > 0) return data as Layout[]

  const seeded = LAYOUTS.map((l, i) => ({
    csm_email: email,
    key: l.key,
    label: l.label,
    position: i
  }))
  const { error: seedError } = await db().from('board_layouts').insert(seeded)
  fail('Could not create default layouts', seedError)
  return seeded.map(({ key, label, position }) => ({ key, label, position }))
}

export async function loadActiveLayout(email: string): Promise<string> {
  const { data, error } = await db()
    .from('csm_users')
    .select('active_layout')
    .eq('email', email)
    .maybeSingle()
  fail('Could not read the active layout', error)
  return (data?.active_layout as string | undefined) ?? LAYOUTS[0].key
}

export async function setActiveLayout(email: string, layoutKey: string): Promise<void> {
  const { error } = await db()
    .from('csm_users')
    .update({ active_layout: layoutKey })
    .eq('email', email)
  fail('Could not switch layout', error)
}

// --- Stages ----------------------------------------------------------------

/** A layout's columns, seeding that layout's preset if it has none yet. */
export async function loadStages(email: string, layoutKey: string): Promise<Stage[]> {
  const { data, error } = await db()
    .from('board_stages')
    .select('key,label,position')
    .eq('csm_email', email)
    .eq('layout_key', layoutKey)
    .order('position')
  fail('Could not load columns', error)

  if (data && data.length > 0) return data as Stage[]

  const seeded = layoutDef(layoutKey).stages.map((s, i) => ({
    csm_email: email,
    layout_key: layoutKey,
    key: s.key,
    label: s.label,
    position: i
  }))
  const { error: seedError } = await db().from('board_stages').insert(seeded)
  fail('Could not create default columns', seedError)
  return seeded.map(({ key, label, position }) => ({ key, label, position }))
}

export async function renameStage(
  email: string,
  layoutKey: string,
  key: string,
  label: string
): Promise<void> {
  const { error } = await db()
    .from('board_stages')
    .update({ label })
    .eq('csm_email', email)
    .eq('layout_key', layoutKey)
    .eq('key', key)
  fail('Could not rename the column', error)
}

/** Turns a label into a stable identifier: "Won't renew" -> "won_t_renew". */
function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return slug || 'column'
}

function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}_${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}_${taken.size + 1}`
}

/** Appends a column to the right-hand end of a layout. */
export async function addStage(
  email: string,
  layoutKey: string,
  label: string,
  existing: Stage[]
): Promise<Stage> {
  const trimmed = label.trim()
  const key = uniqueKey(slugify(trimmed), new Set(existing.map((s) => s.key)))
  const position = existing.reduce((max, s) => Math.max(max, s.position), -1) + 1

  const { error } = await db().from('board_stages').insert({
    csm_email: email,
    layout_key: layoutKey,
    key,
    label: trimmed,
    position
  })
  fail('Could not add the column', error)
  return { key, label: trimmed, position }
}

/**
 * Rewrites every column's position in one statement, via an RPC. Doing this
 * client-side row by row would transiently duplicate positions and could leave
 * the ordering half-applied if a request failed midway.
 */
export async function reorderStages(
  email: string,
  layoutKey: string,
  orderedKeys: string[]
): Promise<void> {
  const { error } = await db().rpc('reorder_board_stages', {
    p_email: email,
    p_layout: layoutKey,
    p_keys: orderedKeys
  })
  fail('Could not reorder the columns', error)
}

/** Deletes a column; its cards move to the leftmost remaining column. */
export async function deleteStage(
  email: string,
  layoutKey: string,
  key: string
): Promise<void> {
  const { error } = await db().rpc('delete_board_stage', {
    p_email: email,
    p_layout: layoutKey,
    p_key: key
  })
  fail('Could not delete the column', error)
}

// --- Per-account properties (shared across every layout) -------------------

/**
 * Ensures every account has a board_cards row, which is where colour lives.
 * `ignoreDuplicates` keeps an existing row (and its colour) untouched.
 */
export async function ensureCards(email: string, accounts: Account[]): Promise<void> {
  if (accounts.length === 0) return
  const rows = accounts.map((a) => ({
    csm_email: email,
    org_id: a.orgId,
    org_name: a.orgName
  }))
  const { error } = await db()
    .from('board_cards')
    .upsert(rows, { onConflict: 'csm_email,org_id', ignoreDuplicates: true })
  fail('Could not register accounts', error)
}

/**
 * Colour and contact channel in one round trip — they live on the same row, so
 * splitting them into two queries would only cost a second request.
 */
export async function loadCardProps(email: string): Promise<CardProps> {
  const { data, error } = await db()
    .from('board_cards')
    .select('org_id,color,contact_channel')
    .eq('csm_email', email)
  fail('Could not load card properties', error)

  const props: CardProps = { colors: {}, channels: {} }
  for (const row of data ?? []) {
    const orgId = row.org_id as string
    if (isCardColor(row.color)) props.colors[orgId] = row.color
    if (isContactChannel(row.contact_channel)) props.channels[orgId] = row.contact_channel
  }
  return props
}

/** Sets or clears a card's accent colour. Pass null to return it to monochrome. */
export async function setCardColor(
  email: string,
  orgId: string,
  color: CardColor | null
): Promise<void> {
  const { error } = await db()
    .from('board_cards')
    .update({ color, updated_at: new Date().toISOString() })
    .eq('csm_email', email)
    .eq('org_id', orgId)
  fail('Could not change the card colour', error)
}

/** Sets or clears the service this account's contact is reachable on. */
export async function setCardChannel(
  email: string,
  orgId: string,
  channel: ContactChannel | null
): Promise<void> {
  const { error } = await db()
    .from('board_cards')
    .update({ contact_channel: channel, updated_at: new Date().toISOString() })
    .eq('csm_email', email)
    .eq('org_id', orgId)
  fail('Could not change the contact channel', error)
}

// --- Placements (per layout) ----------------------------------------------

export async function loadPlacements(email: string, layoutKey: string): Promise<Placement[]> {
  const { data, error } = await db()
    .from('board_placements')
    .select('org_id,stage_key,position')
    .eq('csm_email', email)
    .eq('layout_key', layoutKey)
    .order('position')
  fail('Could not load the board', error)
  return (data ?? []).map((r) => ({
    orgId: r.org_id as string,
    stageKey: r.stage_key as string,
    position: r.position as number
  }))
}

/**
 * Gives any account without a placement in this layout one, at the bottom of
 * the intake column. Existing placements are left alone, so a re-sync never
 * disturbs work already done on the board.
 */
export async function reconcilePlacements(
  email: string,
  layoutKey: string,
  accounts: Account[],
  existing: Placement[]
): Promise<Placement[]> {
  const known = new Set(existing.map((p) => p.orgId))
  const missing = accounts.filter((a) => !known.has(a.orgId))
  if (missing.length === 0) return existing

  const intake = intakeStageOf(layoutKey)
  const tail = existing
    .filter((p) => p.stageKey === intake)
    .reduce((max, p) => Math.max(max, p.position), 0)

  const rows = missing.map((a, i) => ({
    csm_email: email,
    layout_key: layoutKey,
    org_id: a.orgId,
    stage_key: intake,
    position: tail + (i + 1) * POSITION_STEP
  }))

  const { error } = await db()
    .from('board_placements')
    .upsert(rows, { onConflict: 'csm_email,layout_key,org_id', ignoreDuplicates: true })
  fail('Could not add new accounts to the board', error)

  return [
    ...existing,
    ...rows.map((r) => ({ orgId: r.org_id, stageKey: r.stage_key, position: r.position }))
  ]
}

export async function movePlacement(
  email: string,
  layoutKey: string,
  orgId: string,
  stageKey: string,
  position: number
): Promise<void> {
  const { error } = await db()
    .from('board_placements')
    .update({ stage_key: stageKey, position, updated_at: new Date().toISOString() })
    .eq('csm_email', email)
    .eq('layout_key', layoutKey)
    .eq('org_id', orgId)
  fail('Could not move the card', error)
}

// --- Touches ---------------------------------------------------------------

/**
 * Most recent touch per account, for the days-since-contact counter.
 * Rows arrive newest-first, so the first sighting of an org is its latest.
 */
export async function loadLastTouches(email: string): Promise<Record<string, string>> {
  const { data, error } = await db()
    .from('touches')
    .select('org_id,occurred_at')
    .eq('csm_email', email)
    .order('occurred_at', { ascending: false })
  fail('Could not load contact history', error)

  const latest: Record<string, string> = {}
  for (const row of data ?? []) {
    const orgId = row.org_id as string
    if (!(orgId in latest)) latest[orgId] = row.occurred_at as string
  }
  return latest
}

export async function loadTouches(email: string, orgId: string): Promise<Touch[]> {
  const { data, error } = await db()
    .from('touches')
    .select('id,org_id,channel,note,url,occurred_at')
    .eq('csm_email', email)
    .eq('org_id', orgId)
    .order('occurred_at', { ascending: false })
  fail('Could not load contact history', error)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    orgId: r.org_id as string,
    channel: r.channel as TouchChannel,
    note: (r.note as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    occurredAt: r.occurred_at as string
  }))
}

export async function addTouch(
  email: string,
  orgId: string,
  raw: TouchValues
): Promise<void> {
  // Normalised here rather than at the call site, so no caller can hang a URL
  // on a channel that has no business carrying one. See `normalizeTouchValues`.
  const values = normalizeTouchValues(raw)
  const { error } = await db().from('touches').insert({
    csm_email: email,
    org_id: orgId,
    channel: values.channel,
    note: values.note.trim() || null,
    url: values.url.trim() || null,
    occurred_at: values.occurredAt
  })
  fail('Could not log the touch', error)
}

/** Rewrites an existing touch. The account it belongs to never changes. */
export async function updateTouch(id: string, raw: TouchValues): Promise<void> {
  const values = normalizeTouchValues(raw)
  const { error } = await db()
    .from('touches')
    .update({
      channel: values.channel,
      note: values.note.trim() || null,
      // Written unconditionally, not only when set: re-filing a link touch as a
      // call has to clear the URL that is already on the row, and a partial
      // update would leave it there.
      url: values.url.trim() || null,
      occurred_at: values.occurredAt
    })
    .eq('id', id)
  fail('Could not save the touch', error)
}

export async function deleteTouch(id: string): Promise<void> {
  const { error } = await db().from('touches').delete().eq('id', id)
  fail('Could not delete the touch', error)
}

// --- Activity export -------------------------------------------------------

/**
 * A logged touch with everything the export needs. Separate from `Touch`, which
 * is the account panel's editable shape and deliberately has no `replied` — the
 * export cares whether the account answered, the panel does not edit it.
 */
export interface ActivityTouch {
  id: string
  orgId: string
  channel: TouchChannel
  note: string | null
  url: string | null
  occurredAt: string
  replied: boolean
}

/** Every touch logged since `sinceIso`, across all accounts, newest first. */
export async function loadTouchesSince(
  email: string,
  sinceIso: string
): Promise<ActivityTouch[]> {
  const { data, error } = await db()
    .from('touches')
    .select('id,org_id,channel,note,url,occurred_at,replied')
    .eq('csm_email', email)
    .gte('occurred_at', sinceIso)
    .order('occurred_at', { ascending: false })
  fail('Could not load your contact history', error)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    orgId: r.org_id as string,
    channel: r.channel as TouchChannel,
    note: (r.note as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    occurredAt: r.occurred_at as string,
    replied: r.replied === true
  }))
}

/** Every to-do completed since `sinceIso`, newest completion first. */
export async function loadTodosCompletedSince(
  email: string,
  sinceIso: string
): Promise<Todo[]> {
  const { data, error } = await db()
    .from('todos')
    .select(TODO_COLUMNS)
    .eq('csm_email', email)
    .gte('completed_at', sinceIso)
    .order('completed_at', { ascending: false })
  fail('Could not load your completed to-dos', error)
  return ((data ?? []) as TodoRow[]).map(toTodo)
}

/**
 * Account names by org id, read from board_cards rather than from the live book.
 *
 * That matters for an export: a touch logged three months ago may belong to an
 * account since reassigned away, which is gone from PostHog's answer but still has
 * its row here. Falling back to the raw org id would put a uuid in the document.
 */
export async function loadOrgNames(email: string): Promise<Record<string, string>> {
  const { data, error } = await db()
    .from('board_cards')
    .select('org_id,org_name')
    .eq('csm_email', email)
  fail('Could not load account names', error)

  const names: Record<string, string> = {}
  for (const row of data ?? []) {
    const orgId = row.org_id as string
    const orgName = row.org_name as string | null
    if (orgName) names[orgId] = orgName
  }
  return names
}

// --- To-dos ----------------------------------------------------------------

/*
 * Every write here is scoped by csm_email as well as by id. updateTouch and
 * deleteTouch above are the only two writes in this file addressed by bare id;
 * the other dozen are email-scoped, so the to-do surface follows the majority.
 * It costs nothing on an indexed column and means an id held over from another
 * session cannot write.
 */

const TODO_COLUMNS =
  'id,title,note,url,bucket,position,kind,org_id,completed_at,created_at'

interface TodoRow {
  id: string
  title: string
  note: string | null
  url: string | null
  bucket: string
  position: number
  kind: string
  org_id: string | null
  completed_at: string | null
  created_at: string
}

function toTodo(r: TodoRow): Todo {
  return {
    id: r.id,
    title: r.title,
    note: r.note ?? null,
    url: r.url ?? null,
    // Guarded rather than cast: same cost, one fewer `as`, and it keeps the
    // guard from being a dead export. Skipping an unrecognised row the way
    // loadCardProps skips a bad colour is not an option — a to-do would
    // silently disappear.
    bucket: isTodoBucket(r.bucket) ? r.bucket : 'today',
    position: r.position,
    // The fallback is the same rule the backfill migration used, so a row
    // written by an older build reads back the way the column was seeded.
    kind: isTodoKind(r.kind) ? r.kind : r.org_id ? 'account' : 'other',
    orgId: r.org_id ?? null,
    completedAt: r.completed_at ?? null,
    createdAt: r.created_at
  }
}

/** Open to-dos across all three buckets, position-ordered. */
export async function loadTodos(email: string): Promise<Todo[]> {
  const { data, error } = await db()
    .from('todos')
    .select(TODO_COLUMNS)
    .eq('csm_email', email)
    .is('completed_at', null)
    .order('position')
  fail('Could not load your to-dos', error)
  return ((data ?? []) as TodoRow[]).map(toTodo)
}

/**
 * Today's completions, newest first — both the rail's count and the undo
 * targets. Rows rather than a bare count: reads return arrays by convention
 * here, and rows cost the same for a day's worth while also surviving a reload.
 */
export async function loadTodosDoneToday(email: string, sinceIso: string): Promise<Todo[]> {
  const { data, error } = await db()
    .from('todos')
    .select(TODO_COLUMNS)
    .eq('csm_email', email)
    .gte('completed_at', sinceIso)
    .order('completed_at', { ascending: false })
  fail('Could not load what you finished today', error)
  return ((data ?? []) as TodoRow[]).map(toTodo)
}

/**
 * Recent completions, newest first, regardless of which day they happened on.
 *
 * Separate from loadTodosDoneToday, which is scoped to the day because it feeds a
 * counter. This one feeds the completed list, where the whole point is being able
 * to find something you finished (or finished by accident) a while ago.
 */
export async function loadCompletedTodos(email: string, limit = 100): Promise<Todo[]> {
  const { data, error } = await db()
    .from('todos')
    .select(TODO_COLUMNS)
    .eq('csm_email', email)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit)
  fail('Could not load your completed to-dos', error)
  return ((data ?? []) as TodoRow[]).map(toTodo)
}

/**
 * Appends a to-do to the bottom of its bucket, returning the created row.
 *
 * Returning it matters: the id is server-generated, and a to-do inserted
 * optimistically under a client-invented id is immediately draggable — a drag
 * resolving before the insert would then move a row that does not exist. One
 * round trip buys a real id and no reconciliation.
 */
export async function addTodo(
  email: string,
  raw: TodoValues,
  existing: Todo[]
): Promise<Todo> {
  // Normalised here rather than at the call site, so no caller can write a `pr`
  // or `other` row still carrying an account. See `normalizeTodoValues`.
  const values = normalizeTodoValues(raw)
  const tail = existing
    .filter((t) => t.bucket === values.bucket)
    .reduce((max, t) => Math.max(max, t.position), 0)

  const { data, error } = await db()
    .from('todos')
    .insert({
      csm_email: email,
      title: values.title.trim(),
      note: values.note.trim() || null,
      url: values.url.trim() || null,
      bucket: values.bucket,
      position: tail + POSITION_STEP,
      kind: values.kind,
      org_id: values.orgId
    })
    .select(TODO_COLUMNS)
    .single()
  fail('Could not add the to-do', error)
  return toTodo(data as unknown as TodoRow)
}

/**
 * Rewrites a to-do's editable body. Position travels with it because the form
 * can change the bucket, and bucket and position are only meaningful together —
 * written apart they could half-apply.
 */
export async function updateTodo(
  email: string,
  id: string,
  raw: TodoValues,
  position: number
): Promise<void> {
  const values = normalizeTodoValues(raw)
  const { error } = await db()
    .from('todos')
    .update({
      title: values.title.trim(),
      note: values.note.trim() || null,
      // Written unconditionally, not only when set: clearing the link on an
      // existing to-do has to clear the column, and a partial update would
      // leave the old URL on the row.
      url: values.url.trim() || null,
      bucket: values.bucket,
      position,
      kind: values.kind,
      org_id: values.orgId,
      updated_at: new Date().toISOString()
    })
    .eq('csm_email', email)
    .eq('id', id)
  fail('Could not save the to-do', error)
}

export async function moveTodo(
  email: string,
  id: string,
  bucket: TodoBucket,
  position: number
): Promise<void> {
  const { error } = await db()
    .from('todos')
    .update({ bucket, position, updated_at: new Date().toISOString() })
    .eq('csm_email', email)
    .eq('id', id)
  fail('Could not move the to-do', error)
}

/**
 * Soft-archives a to-do. Bucket and position are deliberately left alone: that
 * is what makes undo exact, restoring the card to the slot it left with no
 * arithmetic.
 */
export async function completeTodo(
  email: string,
  id: string,
  completedAt: string
): Promise<void> {
  const { error } = await db()
    .from('todos')
    .update({ completed_at: completedAt, updated_at: new Date().toISOString() })
    .eq('csm_email', email)
    .eq('id', id)
  fail('Could not complete the to-do', error)
}

/** Restores a completed to-do to the slot it left. */
export async function uncompleteTodo(email: string, id: string): Promise<void> {
  const { error } = await db()
    .from('todos')
    .update({ completed_at: null, updated_at: new Date().toISOString() })
    .eq('csm_email', email)
    .eq('id', id)
  fail('Could not restore the to-do', error)
}

export async function deleteTodo(email: string, id: string): Promise<void> {
  const { error } = await db()
    .from('todos')
    .delete()
    .eq('csm_email', email)
    .eq('id', id)
  fail('Could not delete the to-do', error)
}

export { POSITION_STEP }
