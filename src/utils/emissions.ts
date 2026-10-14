/**
 * Pure helpers for the emission channel between the dashboard and its embeds.
 *
 * Each embed gets a private d-frame channel namespaced by an element scope
 * (`sync-params="*:<scope>_"`): everything it writes in its own URL lands
 * namespaced in the dashboard URL (`<scope>_` + key) and is injected back into
 * its own src, which keeps its state alive across filter broadcasts. The
 * dashboard then *projects* those emissions into the clean, interoperable
 * namespace (`_c_*` / `_s_*` / `_d_*`) according to the per-element
 * `propagation` settings: what everyone else sees.
 *
 * Why not let d-frame route the raw keys (`sync-params="_c*,_s*,_d*"`)?
 *  - `getChildSrc` re-injects every matching parent key into every child src,
 *    which defeats any per-element filtering (including `ignoreFilters`);
 *  - `getParentUrl` deletes from the parent URL every matching key absent from
 *    the emitting child, so one child state change can wipe the dashboard's own
 *    filters.
 * The namespaced channel has neither problem: a scope only ever matches itself.
 */
import type { ApplicationElement, DashboardElement, DashboardSection, SelectionPropagation, TablePreviewElement } from '@/config'
import { dedupeKeys, elementKey } from './layout'
import type { ReactiveParams } from './filters'

/** Trailing REST operator of a filter key (`codeCommune_in` → `codeCommune`). */
export const FILTER_OP_SUFFIX = /_(in|nin|eq|neq|lt|lte|gt|gte|starts|exists|nexists|contains|search)$/

/** A dataset-scoped or concept-scoped filter key (`_d_…` / `_c_…`). */
export const isFilterKey = (key: string): boolean => key.startsWith('_c_') || key.startsWith('_d_')

/** A selection marker key (`_s_…`), i.e. a filter key without its operator. */
export const isMarkerKey = (key: string): boolean => key.startsWith('_s_')

/** Concept id (or dataset scope + field) of a filter key, operator stripped. */
export const keyWithoutOp = (key: string): string => stripOp(key.slice(3))

/** Trailing REST operator stripped from a field name (`an_gte` → `an`). */
export const stripOp = (key: string): string => key.replace(FILTER_OP_SUFFIX, '')

/**
 * Marker key of a filter key, per the `_s_` convention: the filter key without
 * its operator (`_c_<concept>_in` → `_s_<concept>`, `_d_<ds>_<field>_eq` →
 * `_s_<ds>_<field>`).
 */
export const markerKeyOf = (filterKey: string): string | undefined =>
  isFilterKey(filterKey) ? `_s_${keyWithoutOp(filterKey)}` : undefined

/**
 * Private d-frame namespace of one element instance. The compare-view column
 * prefix is part of it so the two columns keep separate states: the clean
 * `_c_*` / `_s_*` keys stay shared between columns, as the convention wants.
 */
export const emissionScope = (prefix: string, instanceKey: string): string =>
  prefix ? `${prefix}_${instanceKey}` : instanceKey

export interface ElementPropagation {
  scope: string
  selection: SelectionPropagation
  filter: boolean
  /** Application id of the emitting element, used to attribute `_s_<x>=app_<id>` markers. */
  applicationId?: string
}

/** Configured propagation of an element, with the runtime defaults applied. */
export const elementPropagation = (el: ApplicationElement | TablePreviewElement): Omit<ElementPropagation, 'scope'> => ({
  selection: el.propagation?.selection || 'filter',
  filter: el.propagation?.filter ?? false,
  applicationId: el.type === 'application' ? el.application?.id : undefined
})

/**
 * Propagation targets of every embeddable element of the dashboard: same
 * instance keys (and nesting paths for `column` elements) as the components
 * compute, for each compare-view column prefix.
 */
export const collectEmissionsTargets = (
  sections: DashboardSection[] | undefined,
  prefixes: string[]
): ElementPropagation[] => {
  const targets: ElementPropagation[] = []
  const visitElement = (el: DashboardElement, instanceKey: string) => {
    if (el.type === 'column') {
      const children = el.elements || []
      const childKeys = dedupeKeys(children.map((child, k) => elementKey(child, k)))
      children.forEach((child, k) => visitElement(child, `${instanceKey}-${childKeys[k]}`))
      return
    }
    if (el.type !== 'application' && el.type !== 'tablePreview') return
    for (const prefix of prefixes) {
      targets.push({ scope: emissionScope(prefix, instanceKey), ...elementPropagation(el) })
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

/** Propagations by application id, to attribute a marker to its emitting element. */
export const propagationsByApplicationId = (
  sections: DashboardSection[] | undefined
): Record<string, Omit<ElementPropagation, 'scope'>> => {
  const out: Record<string, Omit<ElementPropagation, 'scope'>> = {}
  for (const target of collectEmissionsTargets(sections, [''])) {
    if (target.applicationId && !out[target.applicationId]) {
      const { scope, ...propagation } = target
      out[target.applicationId] = propagation
    }
  }
  return out
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
 * Clean keys the dashboard publishes for one emitting element: selection keys
 * and their markers per `selection`, plain filters per `filter`. Anything else
 * (page, sort, search box…) stays in the element's private namespace.
 */
export const projectEmissions = (
  emissions: Record<string, string>,
  propagation: Omit<ElementPropagation, 'scope'>
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(emissions)) {
    if (isMarkerKey(key)) {
      if (propagation.selection !== 'none') out[key] = value
      continue
    }
    if (!isFilterKey(key)) continue
    const marker = markerKeyOf(key)
    if (marker && emissions[marker] != null) {
      if (propagation.selection !== 'none') out[key] = value
      continue
    }
    if (propagation.filter) out[key] = value
  }
  return out
}

export interface StripEmissionsOptions {
  /** Application id of the receiving element: its own markers are kept. */
  applicationId?: string
  /** A native dataset embed cannot highlight: a selection reaches it as a filter. */
  nativeEmbed?: boolean
  /** Propagation of every embedded application, by application id. */
  emitters: Record<string, Omit<ElementPropagation, 'scope'>>
}

/**
 * Strip the markers of a broadcast before it reaches one element: a selection
 * propagated "en filtre" by its emitter restricts the other visus instead of
 * being rendered, and a native dataset embed has nothing to highlight with.
 * Markers set by the page (a value that is not `app_<id>`) stay selections for
 * everyone, as the convention says.
 */
export const stripEmissions = (filters: Record<string, string>, opts: StripEmissionsOptions): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (!isMarkerKey(key)) {
      out[key] = value
      continue
    }
    if (opts.nativeEmbed) continue
    const emitterId = value.startsWith('app_') ? value.slice('app_'.length) : undefined
    const emitter = emitterId ? opts.emitters[emitterId] : undefined
    if (!emitter) {
      out[key] = value
      continue
    }
    if (emitter.selection === 'none') continue
    if (emitter.selection === 'filter' && emitterId !== opts.applicationId) continue
    out[key] = value
  }
  return out
}

/**
 * Signature of the emissions of every target, with their propagation settings:
 * used to re-run the projection when an emission changes (or when a
 * propagation is reconfigured in the draft).
 */
export const emissionsSignature = (params: ReactiveParams, targets: ElementPropagation[]): string =>
  targets.map(target => [
    target.scope,
    target.selection,
    target.filter ? '1' : '0',
    ...Object.entries(collectElementEmissions(params, target.scope))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
  ].join('\u0001')).join('\u0002')

export interface ProjectionResult {
  /** Clean keys to write in the dashboard URL. */
  values: Record<string, string>
  /** Previously projected keys whose emission is gone, to remove. */
  remove: string[]
}

/**
 * Compute the clean projection of every element emission. The dashboard's own
 * keys (`ownedKeys`: configured dynamic/static filters, period, geo) always
 * win and are never projected. `previous` is what the projection wrote before,
 * so a key is only removed while it still holds the projected value.
 */
export const computeProjections = (
  params: ReactiveParams,
  targets: ElementPropagation[],
  ownedKeys: Set<string>,
  previous: Record<string, string>
): ProjectionResult => {
  const values: Record<string, string> = {}
  for (const target of targets) {
    const emissions = collectElementEmissions(params, target.scope)
    Object.assign(values, projectEmissions(emissions, target))
  }
  for (const key of Object.keys(values)) {
    if (ownedKeys.has(key)) delete values[key]
  }
  const remove = Object.keys(previous).filter(key =>
    !(key in values) && !ownedKeys.has(key) &&
    (params[key] == null || params[key] === previous[key])
  )
  return { values, remove }
}

/**
 * Clean keys already present in a reloaded URL that duplicate an element
 * emission: the projection adopts them so it can remove them later.
 */
export const seedProjected = (params: ReactiveParams, targets: ElementPropagation[]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const target of targets) {
    for (const [key, value] of Object.entries(collectElementEmissions(params, target.scope))) {
      if (!isFilterKey(key) && !isMarkerKey(key)) continue
      if (params[key] === value) out[key] = value
    }
  }
  return out
}
