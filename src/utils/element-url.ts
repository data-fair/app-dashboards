/**
 * Build URLs for the different embed modes supported by a dashboard element.
 *
 * Three kinds of URLs are produced:
 *  - d-frame src for the `<d-frame>` tag (used by all element types)
 *  - capture URL (server-side screenshot of an application)
 *  - embed code (iframe snippet for sharing)
 *
 * Note on filter transmission:
 *  - The native dataset embed (`/data-fair/embed/dataset/.../table|form`)
 *    is served on the same dataset as the dashboard's root, so we strip
 *    the `<prefix>_d_<datasetId>_` part from dynamic and static filter
 *    keys before forwarding them: the embed REST API expects unprefixed
 *    field names (e.g. `int_in=...` rather than `_d_<datasetId>_int_in=...`).
 *    Concept params (`_c_date_match`, `_c_geo_distance`) and `finalizedAt`
 *    are passed through unchanged.
 *  - The application embed (`/data-fair/app/...`) receives the full
 *    `filtersValues` map with dataset-scoped keys preserved
 *    (`<prefix>_d_<datasetId>_<field>_in`, etc.). The application is
 *    responsible for picking the ones that target its own dataset and
 *    ignoring the rest.
 */
import type { DashboardElement, ApplicationElement, TablePreviewElement, FormElement } from '@/config'
import { datasetFilterKey } from './dataset-filter'

export interface ApplicationLike { href: string }
export interface FilterValues { [key: string]: any }

const stripAfterDataFair = (href: string): string => href.split('/data-fair/')[0]

const accessKeyPrefix = (accessKey: string | null): string => accessKey ? `${accessKey}%3A` : ''

const toStringRecord = (obj: FilterValues | null | undefined): Record<string, string> => {
  if (!obj) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'keys') continue
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

/**
 * Strip the `<prefix>_d_<datasetId>_` dataset scope from filter keys.
 * Concept params (`_c_*`) and `finalizedAt` are kept as-is.
 */
const stripDatasetScope = (filtersValues: FilterValues | null | undefined, prefix: string, datasetId: string): Record<string, string> => {
  const record = toStringRecord(filtersValues)
  const scope = `${prefix}_d_${datasetId}_`
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith(scope)) out[k.slice(scope.length)] = v
    else out[k] = v
  }
  return out
}

const datasetEmbedParams = (filtersValues: FilterValues | null, primary: unknown, secondary: unknown, print: unknown, ignoreFilters: boolean | undefined, prefix: string, datasetId: string): Record<string, string> => {
  const params: Record<string, string> = {}
  if (!ignoreFilters) Object.assign(params, stripDatasetScope(filtersValues, prefix, datasetId))
  params['d-frame'] = 'true'
  if (primary) params.primary = String(primary)
  if (secondary) params.secondary = String(secondary)
  if (print === 'true') params.interaction = 'false'
  return params
}

/**
 * Param set for embedded applications. The `filtersValues` passed here is
 * the application-shaped object emitted by `useFiltersValues` →
 * `applicationValues`: keys are dataset-scoped
 * (`<prefix>_d_<datasetId>_<field>_in`, etc.), the application picks the
 * ones that target its own dataset.
 */
const applicationEmbedParams = (filtersValues: FilterValues | null, primary: unknown, secondary: unknown, print: unknown, ignoreFilters: boolean | undefined): Record<string, string> => {
  const params: Record<string, string> = {}
  if (!ignoreFilters) Object.assign(params, toStringRecord(filtersValues))
  params['d-frame'] = 'true'
  if (primary) params.primary = String(primary)
  if (secondary) params.secondary = String(secondary)
  if (print === 'true') params.interaction = 'false'
  return params
}

export const tableDFrameSrc = (
  element: TablePreviewElement,
  datasetId: string,
  accessKey: string | null,
  filtersValues: FilterValues | null,
  primary: unknown,
  secondary: unknown,
  print: unknown,
  prefix: string
): string => {
  const params: Record<string, string> = datasetEmbedParams(filtersValues, primary, secondary, print, element.ignoreFilters, prefix, datasetId)
  if (element.display) params.display = element.display
  params.interaction = String(!element.noInteractions)
  if (element.fields?.length) params.cols = element.fields.join(',')
  return `/data-fair/embed/dataset/${accessKeyPrefix(accessKey)}${datasetId}/table?${new URLSearchParams(params).toString()}`
}

export const formDFrameSrc = (
  element: FormElement,
  accessKey: string | null,
  filtersValues: FilterValues | null,
  primary: unknown,
  secondary: unknown,
  print: unknown,
  prefix: string
): string => {
  const params = datasetEmbedParams(filtersValues, primary, secondary, print, element.ignoreFilters, prefix, element.dataset?.id || '')
  return `/data-fair/embed/dataset/${accessKeyPrefix(accessKey)}${element.dataset?.id}/form?${new URLSearchParams(params).toString()}`
}

export const applicationDFrameSrc = (
  element: ApplicationElement,
  accessKey: string | null,
  applicationFiltersValues: FilterValues | null,
  primary: unknown,
  secondary: unknown,
  print: unknown
): string => {
  const params = applicationEmbedParams(applicationFiltersValues, primary, secondary, print, element.ignoreFilters)
  return `/data-fair/app/${accessKeyPrefix(accessKey)}${element.application?.id}?${new URLSearchParams(params).toString()}`
}

export const applicationUrl = (element: DashboardElement, application: ApplicationLike): string | undefined => {
  if (element.type !== 'application') return undefined
  const appHref = element.application?.href
  if (!appHref) return undefined
  return `${stripAfterDataFair(application.href)}/data-fair/${appHref.split('/data-fair/').pop()}`
}

export const descriptionUrl = (element: DashboardElement, application: ApplicationLike): string | undefined => {
  if (element.type !== 'application') return undefined
  if (!element.description || element.description === 'none') return undefined
  return applicationUrl(element, application)
}

export const sourcesUrl = (element: DashboardElement, application: ApplicationLike, showSources: boolean | undefined): string | undefined => {
  if (!showSources) return undefined
  if (element.type !== 'application') return undefined
  const url = applicationUrl(element, application)
  return url ? `${url}/configuration` : undefined
}

/**
 * URL de capture (screenshot) d'un élément application.
 *
 * L'endpoint de capture est servi par l'API (`GET {app.href}/capture`) :
 * les paramètres préfixés `app_` sont dé-préfixés et propagés à l'URL cible
 * de l'application, ce qui permet de capturer la visu dans l'état filtré
 * courant du dashboard. `width`/`height` ne sont transmis que si la baseApp
 * les déclare (metas df:capture-width / df:capture-height), sinon le
 * serveur applique ses dimensions par défaut.
 */
export const captureUrl = (
  element: DashboardElement,
  filtersValues: FilterValues | null
): string | undefined => {
  if (element.type !== 'application') return undefined
  const app = element.application
  if (!app?.href) return undefined
  const meta = (app.baseApp?.meta || {}) as Record<string, any>
  const params: Record<string, string> = { app_embed: 'true' }
  if (meta['df:capture-width']) params.width = String(meta['df:capture-width'])
  if (meta['df:capture-height']) params.height = String(meta['df:capture-height'])
  for (const [key, value] of Object.entries(filtersValues || {})) {
    if (key === 'keys') continue
    params[`app_${key}`] = String(value)
  }
  return `${app.href}/capture?${new URLSearchParams(params).toString()}`
}

export const embedCode = (
  element: DashboardElement,
  exposedUrl: string,
  accessKey: string | null
): string | undefined => {
  if (element.type !== 'application') return undefined
  const appId = element.application?.id
  if (!appId) return undefined
  const key = accessKeyPrefix(accessKey)
  const url = `${stripAfterDataFair(exposedUrl)}data-fair/app/${key}${appId}?embed=true`
  return `<iframe src="${url}" width="100%" height="500px" style="background-color: transparent; border: none;"></iframe>`
}

export { datasetFilterKey }
