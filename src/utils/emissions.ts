/**
 * Pure helpers for the emission channel between the dashboard and its embeds.
 *
 * Each embed gets a private d-frame channel namespaced by an element scope
 * (`sync-params="*:<scope>_"`): everything it writes in its own URL lands
 * namespaced in the dashboard URL (`<scope>_` + key) and is injected back into
 * its own src, which keeps its state alive across filter broadcasts. The
 * dashboard then *projects* those emissions into the clean, interoperable
 * namespace (`_c_*` / `_d_*`) according to the per-element `syncParams` mode:
 * what everyone else sees. In the compare view each column publishes apart: the
 * left one in the clean keys, the right one under its column prefix (`c_d_*` /
 * `c_c_*`), so a selection never leaks into the other column.
 *
 * Why not let d-frame route the raw keys (`sync-params="_c*,_d*"`)?
 *  - `getChildSrc` re-injects every matching parent key into every child src,
 *    which defeats the per-column separation of the compare view;
 *  - `getParentUrl` deletes from the parent URL every matching key absent from
 *    the emitting child, so one child state change can wipe the dashboard's own
 *    filters (and the other column's).
 * The namespaced channel has neither problem: a scope only ever matches itself.
 */
import type { ApplicationElement, DashboardElement, DashboardSection, FormElement, SyncParams, TablePreviewElement } from '@/config'
import type { ReactiveParams } from './filters'
import { dedupeKeys, elementKey } from './layout'

/** Trailing REST operator of a filter key (`codeCommune_in` → `codeCommune`). */
export const FILTER_OP_SUFFIX = /_(in|nin|eq|neq|lt|lte|gt|gte|starts|exists|nexists|contains|search)$/

/** A dataset-scoped or concept-scoped filter key (`_d_…` / `_c_…`). */
export const isFilterKey = (key: string): boolean => key.startsWith('_c_') || key.startsWith('_d_')

/** Concept id (or dataset scope + field) of a filter key, operator stripped. */
export const keyWithoutOp = (key: string): string => stripOp(key.slice(3))

/** Trailing REST operator stripped from a field name (`an_gte` → `an`). */
export const stripOp = (key: string): string => key.replace(FILTER_OP_SUFFIX, '')

/**
 * Private d-frame namespace of one element instance. The compare-view column
 * prefix is part of it so the two columns keep separate states.
 */
export const emissionScope = (prefix: string, instanceKey: string): string =>
  prefix ? `${prefix}_${instanceKey}` : instanceKey

/** URL key a clean filter key takes in a compare-view column. */
export const columnFilterKey = (prefix: string, key: string): string => `${prefix}${key}`

export interface ElementSyncParams {
  scope: string
  /** Compare-view column of the element, empty for the left one. */
  prefix?: string
  syncParams: SyncParams
}

/** Configured sync mode of an element, with the runtime default applied. */
export const elementSyncParams = (el: ApplicationElement | TablePreviewElement | FormElement): SyncParams =>
  el.syncParams || 'shared-filters'

/**
 * Sync targets of every embeddable element of the dashboard: same instance keys
 * (and nesting paths for `column` elements) as the components compute, for each
 * compare-view column prefix.
 */
export const collectEmissionsTargets = (
  sections: DashboardSection[] | undefined,
  prefixes: string[]
): ElementSyncParams[] => {
  const targets: ElementSyncParams[] = []
  const visitElement = (el: DashboardElement, instanceKey: string) => {
    if (el.type === 'column') {
      const children = el.elements || []
      const childKeys = dedupeKeys(children.map((child, k) => elementKey(child, k)))
      children.forEach((child, k) => visitElement(child, `${instanceKey}-${childKeys[k]}`))
      return
    }
    if (el.type !== 'application' && el.type !== 'tablePreview' && el.type !== 'form') return
    for (const prefix of prefixes) {
      targets.push({ scope: emissionScope(prefix, instanceKey), prefix, syncParams: elementSyncParams(el) })
    }
  }
  for (const section of sections || []) {
    for (const row of section.rows || []) {
      const elements = row.elements || []
      // Mirrors `dashboard-section.vue`: keys are deduplicated per row.
      const keys = dedupeKeys(elements.map((el, i) => elementKey(el, i)))
      elements.forEach((el, i) => visitElement(el, keys[i]))
    }
  }
  return targets
}

/** Keys an element instance wrote in its own URL (namespaced in the dashboard URL). */
export const collectElementEmissions = (params: ReactiveParams, scope: string): Record<string, string> => {
  const prefix = `${scope}_`
  const out: Record<string, string> = {}
  for (const key of Object.keys(params)) {
    if (!key.startsWith(prefix)) continue
    const value = params[key]
    if (value == null || value === '') continue
    out[key.slice(prefix.length)] = String(value)
  }
  return out
}

/**
 * Clean keys the dashboard publishes for one emitting element: its `_c_*` /
 * `_d_*` filters. Empty unless the element is in `shared-filters` mode. Anything
 * else (page, sort, search box…) stays in the element's private namespace.
 */
export const projectEmissions = (emissions: Record<string, string>, syncParams: SyncParams): Record<string, string> => {
  if (syncParams !== 'shared-filters') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(emissions)) {
    if (isFilterKey(key)) out[key] = value
  }
  return out
}

/**
 * A selection-like filter key (`_eq` / `_in`). Other app state that also uses
 * the `_c_` / `_d_` prefixes stays local to its column: search (`_c_q`),
 * geo distance, camera (`_c_map_*`), ranges (`_gte` / `_lte`).
 */
export const isSelectionKey = (key: string): boolean =>
  isFilterKey(key) && (key.endsWith('_eq') || key.endsWith('_in'))

/** Selection emissions of one element, keyed by raw filter key. */
export const collectSelectionEmissions = (params: ReactiveParams, scope: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(collectElementEmissions(params, scope))) {
    if (isSelectionKey(key)) out[key] = value
  }
  return out
}

/** Selection state of every shared element, for the next synchronization run. */
export const selectionEmissionsState = (
  params: ReactiveParams,
  targets: ElementSyncParams[]
): Record<string, Record<string, string>> => {
  const out: Record<string, Record<string, string>> = {}
  for (const target of targets) {
    if (target.syncParams !== 'shared-filters') continue
    out[target.scope] = collectSelectionEmissions(params, target.scope)
  }
  return out
}

export interface SelectionSyncResult {
  /** Private keys to write, so the other compare-view column follows the selection. */
  set: Record<string, string>
  /** Private keys to remove, when the selection was cleared. */
  remove: string[]
}

/**
 * Mirror a selection emitted in one compare-view column into the private
 * channel of the other column. `previous` is the selection state of the last
 * run, so only a changed or cleared selection is propagated: the last click
 * wins. Dashboard-owned keys never cross (each column keeps its own year and
 * static filters), and non-selection app state is left alone.
 *
 * The private channel is used instead of the clean keys because the right
 * column deliberately ignores the clean keys published by the left one
 * (`useFiltersValues`), and because the d-frame re-injects an element's private
 * key over its base src: without this mirror, the second click would be
 * overridden by the other column's previous private selection.
 */
export const computeSelectionSync = (
  params: ReactiveParams,
  targets: ElementSyncParams[],
  previous: Record<string, Record<string, string>>,
  ownedKeys: Set<string>
): SelectionSyncResult => {
  // In single view there is only one rendered column: mirroring would create
  // unused private keys (and confuse the "none" purge test).
  if (params.view !== 'compare') return { set: {}, remove: [] }
  const shared = targets.filter(target => target.syncParams === 'shared-filters')
  const current = new Map<string, Record<string, string>>()
  for (const target of shared) current.set(target.scope, collectSelectionEmissions(params, target.scope))

  const changes: { target: ElementSyncParams, key: string, value?: string }[] = []
  for (const target of shared) {
    const before = previous[target.scope] || {}
    const now = current.get(target.scope) || {}
    for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
      if (before[key] !== now[key]) changes.push({ target, key, value: now[key] })
    }
  }

  const set: Record<string, string> = {}
  const remove: string[] = []
  for (const key of new Set(changes.map(change => change.key))) {
    if (ownedKeys.has(key)) continue
    // If both columns changed in the same run, the last one in DOM order wins.
    const winner = changes.filter(change => change.key === key).at(-1)
    if (!winner) continue
    const winnerPrefix = winner.target.prefix ?? ''
    for (const target of shared) {
      if ((target.prefix ?? '') === winnerPrefix) continue
      const currentValue = current.get(target.scope)?.[key]
      if (winner.value === undefined) {
        if (currentValue !== undefined) remove.push(`${target.scope}_${key}`)
      } else if (currentValue !== winner.value) {
        set[`${target.scope}_${key}`] = winner.value
      }
    }
  }
  return { set, remove }
}

/** Clean filter keys published by these elements, under their column key. */
export const publishedEmissions = (params: ReactiveParams, targets: ElementSyncParams[]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const target of targets) {
    for (const [key, value] of Object.entries(projectEmissions(collectElementEmissions(params, target.scope), target.syncParams))) {
      out[columnFilterKey(target.prefix ?? '', key)] = value
    }
  }
  return out
}

/** Every emission of an element, under the key it would be published with. */
const columnEmissions = (params: ReactiveParams, target: ElementSyncParams): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(collectElementEmissions(params, target.scope))) {
    out[columnFilterKey(target.prefix ?? '', key)] = value
  }
  return out
}

/**
 * Signature of the emissions of every target, with their sync mode: used to
 * re-run the projection when an emission changes (or when a mode is
 * reconfigured in the draft).
 */
export const emissionsSignature = (params: ReactiveParams, targets: ElementSyncParams[]): string =>
  targets.map(target => [
    target.scope,
    target.syncParams,
    ...Object.entries(collectElementEmissions(params, target.scope))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
  ].join('\u0001')).join('\u0002')

export interface ProjectionResult {
  /** Keys to write in the dashboard URL: clean, or under the column prefix. */
  values: Record<string, string>
  /** Previously projected keys whose emission is gone, to remove. */
  remove: string[]
}

/**
 * A clean key the projection removed, remembered to recognize its echo: an
 * element that received it through its src can send the old value back after
 * the removal (late d-frame stateChange, stamped with the previous src), and
 * keep sending it. `origins` are the elements that had published it: their
 * emission of the same value stays genuine (clear then select it again).
 */
export interface WithdrawnKey {
  value: string
  origins: string[]
}

/** What the projection remembers between runs to tell an echo from an emission. */
export interface EchoState {
  /** Elements whose emission produced each published clean key. */
  sources: Record<string, string[]>
  withdrawn: Record<string, WithdrawnKey>
}

const isEcho = (withdrawn: Record<string, WithdrawnKey>, scope: string, key: string, value: string): boolean =>
  withdrawn[key]?.value === value && !withdrawn[key].origins.includes(scope)

/**
 * Compute the clean projection of every element emission. The dashboard's own
 * keys (`ownedKeys`: configured dynamic/static filters, period, geo) always
 * win and are never projected. `previous` is what the projection wrote before,
 * so a key is only removed while it still holds the projected value. The
 * namespaced keys of a `none` element are purged (no channel keeps them alive).
 * The echo of a `withdrawn` key is not republished: that would put the key back
 * in every src, then the d-frame anti-echo would remove it again, forever. It
 * stays in the echoing element's channel, as its own state (removing it there
 * loops the same way with a visu that reasserts its state, e.g. carto-stats 1.0).
 */
export const computeProjections = (
  params: ReactiveParams,
  targets: ElementSyncParams[],
  ownedKeys: Set<string>,
  previous: Record<string, string>,
  withdrawn: Record<string, WithdrawnKey> = {}
): ProjectionResult => {
  const values: Record<string, string> = {}
  const staleScopes: string[] = []
  for (const target of targets) {
    if (target.syncParams === 'none') {
      staleScopes.push(`${target.scope}_`)
      continue
    }
    for (const [key, value] of Object.entries(projectEmissions(collectElementEmissions(params, target.scope), target.syncParams))) {
      const columnKey = columnFilterKey(target.prefix ?? '', key)
      if (ownedKeys.has(key) || ownedKeys.has(columnKey)) continue
      if (!isEcho(withdrawn, target.scope, columnKey, value)) values[columnKey] = value
    }
  }
  const remove = Object.keys(previous).filter(key =>
    !(key in values) && !ownedKeys.has(key) &&
    (params[key] == null || params[key] === previous[key])
  )
  for (const key of Object.keys(params)) {
    if (staleScopes.some(prefix => key.startsWith(prefix))) remove.push(key)
  }
  return { values, remove }
}

/**
 * Echo state after a projection run: the sources of the published keys, and
 * the removed keys with the elements that had published them. A withdrawn key
 * is forgotten when it is published again; an echo can come and go (a visu
 * reasserting its state), so it is never a reason to forget it.
 * ponytail: another element selecting exactly a withdrawn value is not shared
 * until it selects another one or an origin republishes it; a timestamp would
 * lift that if a real case shows up.
 */
export const nextEchoState = (
  params: ReactiveParams,
  targets: ElementSyncParams[],
  state: EchoState,
  previous: Record<string, string>,
  result: ProjectionResult
): EchoState => {
  const emissions = targets.map(target => ({ scope: target.scope, values: columnEmissions(params, target) }))
  const sources: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(result.values)) {
    sources[key] = emissions.filter(e => e.values[key] === value).map(e => e.scope)
  }
  const withdrawn: Record<string, WithdrawnKey> = {}
  for (const [key, marker] of Object.entries(state.withdrawn)) {
    if (!(key in result.values)) withdrawn[key] = marker
  }
  for (const key of result.remove) {
    if (!(key in previous)) continue
    const holders = emissions.filter(e => e.values[key] === previous[key]).map(e => e.scope)
    withdrawn[key] = { value: previous[key], origins: [...new Set([...(state.sources[key] || []), ...holders])] }
  }
  return { sources, withdrawn }
}

/**
 * Clean keys already present in a reloaded URL that duplicate an element
 * emission: the projection adopts them so it can remove them later.
 */
export const seedProjected = (params: ReactiveParams, targets: ElementSyncParams[]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const target of targets) {
    if (target.syncParams !== 'shared-filters') continue
    for (const [key, value] of Object.entries(collectElementEmissions(params, target.scope))) {
      if (!isFilterKey(key)) continue
      const columnKey = columnFilterKey(target.prefix ?? '', key)
      if (params[columnKey] === value) out[columnKey] = value
    }
  }
  return out
}
