import { supabase } from './supabase'
import { LAYOUTS, intakeStageOf, layoutDef, type Layout, type Stage } from './layouts'
import { isCardColor, type CardColor } from './colors'
import type { Account, TouchChannel } from '../../../shared/types'

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
  occurredAt: string
}

/** Gap between card positions, leaving room to drop between neighbours. */
const POSITION_STEP = 1000

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

/** True when the email is on the allowlist. This is the whole login check. */
export async function isAllowlisted(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('csm_users')
    .select('email')
    .eq('email', email)
    .maybeSingle()
  fail('Could not verify the email', error)
  return data !== null
}

// --- Layouts ---------------------------------------------------------------

/** The user's layouts, seeding the built-in presets if they have none. */
export async function loadLayouts(email: string): Promise<Layout[]> {
  const { data, error } = await supabase
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
  const { error: seedError } = await supabase.from('board_layouts').insert(seeded)
  fail('Could not create default layouts', seedError)
  return seeded.map(({ key, label, position }) => ({ key, label, position }))
}

export async function loadActiveLayout(email: string): Promise<string> {
  const { data, error } = await supabase
    .from('csm_users')
    .select('active_layout')
    .eq('email', email)
    .maybeSingle()
  fail('Could not read the active layout', error)
  return (data?.active_layout as string | undefined) ?? LAYOUTS[0].key
}

export async function setActiveLayout(email: string, layoutKey: string): Promise<void> {
  const { error } = await supabase
    .from('csm_users')
    .update({ active_layout: layoutKey })
    .eq('email', email)
  fail('Could not switch layout', error)
}

// --- Stages ----------------------------------------------------------------

/** A layout's columns, seeding that layout's preset if it has none yet. */
export async function loadStages(email: string, layoutKey: string): Promise<Stage[]> {
  const { data, error } = await supabase
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
  const { error: seedError } = await supabase.from('board_stages').insert(seeded)
  fail('Could not create default columns', seedError)
  return seeded.map(({ key, label, position }) => ({ key, label, position }))
}

export async function renameStage(
  email: string,
  layoutKey: string,
  key: string,
  label: string
): Promise<void> {
  const { error } = await supabase
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

  const { error } = await supabase.from('board_stages').insert({
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
  const { error } = await supabase.rpc('reorder_board_stages', {
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
  const { error } = await supabase.rpc('delete_board_stage', {
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
  const { error } = await supabase
    .from('board_cards')
    .upsert(rows, { onConflict: 'csm_email,org_id', ignoreDuplicates: true })
  fail('Could not register accounts', error)
}

export async function loadCardColors(email: string): Promise<Record<string, CardColor>> {
  const { data, error } = await supabase
    .from('board_cards')
    .select('org_id,color')
    .eq('csm_email', email)
    .not('color', 'is', null)
  fail('Could not load card colours', error)

  const out: Record<string, CardColor> = {}
  for (const row of data ?? []) {
    if (isCardColor(row.color)) out[row.org_id as string] = row.color
  }
  return out
}

/** Sets or clears a card's accent colour. Pass null to return it to monochrome. */
export async function setCardColor(
  email: string,
  orgId: string,
  color: CardColor | null
): Promise<void> {
  const { error } = await supabase
    .from('board_cards')
    .update({ color, updated_at: new Date().toISOString() })
    .eq('csm_email', email)
    .eq('org_id', orgId)
  fail('Could not change the card colour', error)
}

// --- Placements (per layout) ----------------------------------------------

export async function loadPlacements(email: string, layoutKey: string): Promise<Placement[]> {
  const { data, error } = await supabase
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

  const { error } = await supabase
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
  const { error } = await supabase
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
  const { data, error } = await supabase
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
  const { data, error } = await supabase
    .from('touches')
    .select('id,org_id,channel,note,occurred_at')
    .eq('csm_email', email)
    .eq('org_id', orgId)
    .order('occurred_at', { ascending: false })
  fail('Could not load contact history', error)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    orgId: r.org_id as string,
    channel: r.channel as TouchChannel,
    note: (r.note as string | null) ?? null,
    occurredAt: r.occurred_at as string
  }))
}

export async function addTouch(
  email: string,
  orgId: string,
  channel: TouchChannel,
  note: string,
  occurredAt: string
): Promise<void> {
  const { error } = await supabase.from('touches').insert({
    csm_email: email,
    org_id: orgId,
    channel,
    note: note.trim() || null,
    occurred_at: occurredAt
  })
  fail('Could not log the touch', error)
}

export async function deleteTouch(id: string): Promise<void> {
  const { error } = await supabase.from('touches').delete().eq('id', id)
  fail('Could not delete the touch', error)
}

export { POSITION_STEP }
