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
 *    Keys without the column prefix (received from a parent page) are stripped
 *    the same way; dataset-scoped keys of another dataset or of the other
 *    compare-view column are dropped rather than forwarded raw. Concept params
 *    (`_c_date_match`, `_c_geo_distance`) and `finalizedAt` are passed through
 *    unchanged.
 *  - The application embed (`/data-fair/app/...`) receives the
 *    application-shaped `filtersValues` map: dataset-scoped keys without
 *    the compare-view column prefix (`_d_<datasetId>_<field>_<op>`, the
 *    compare prefix is stripped at emission in `useFiltersValues`), plus
 *    the concept mirrors (`_c_*`). The application picks the ones that
 *    target its own dataset and ignores the rest.
 */
import type { DashboardElement, ApplicationElement, TablePreviewElement, FormElement } from '@/config'
import { datasetFilterKey } from './dataset-filter'

export interface ApplicationLike { href: string; apiUrl?: string }
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

/** `c_d_…` / `x_d_…`: a dataset-scoped key of another compare-view column. */
const OTHER_COLUMN_SCOPE = /^[a-z]+_d_/

/**
 * Strip the `<prefix>_d_<datasetId>_` dataset scope from filter keys.
 * Concept params (`_c_*`) and `finalizedAt` are kept as-is. Dataset-scoped
 * keys of ANOTHER dataset (or of the other compare-view column) are dropped: a
 * native embed REST API only knows unprefixed field names of its own dataset, a
 * foreign `_d_*` key is at best ignored, at worst a 400. Applications keep them
 * (they read only the ones that target their own dataset), so this stripping is
 * for the native embed URLs only.
 *
 * Two families are stripped: the keys of the element's own column
 * (`<prefix>_d_<id>_…`, which win) and the unprefixed keys of the same dataset
 * (received from a parent page or projected from a visu's emission).
 */
const stripDatasetScope = (filtersValues: FilterValues | null | undefined, prefix: string, datasetId: string): Record<string, string> => {
  const record = toStringRecord(filtersValues)
  const datasetScope = `_d_${datasetId}_`
  const columnScope = `${prefix}_d_${datasetId}_`
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith(datasetScope)) out[k.slice(datasetScope.length)] = v
    else if (!k.startsWith('_d_') && !OTHER_COLUMN_SCOPE.test(k)) out[k] = v
  }
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith(columnScope)) out[k.slice(columnScope.length)] = v
  }
  return out
}

const datasetEmbedParams = (filtersValues: FilterValues | null, primary: unknown, secondary: unknown, print: unknown, prefix: string, datasetId: string): Record<string, string> => {
  const params: Record<string, string> = {}
  Object.assign(params, stripDatasetScope(filtersValues, prefix, datasetId))
  params['d-frame'] = 'true'
  if (primary) params.primary = String(primary)
  if (secondary) params.secondary = String(secondary)
  if (print === 'true') params.interaction = 'false'
  return params
}

/**
 * Param set for embedded applications. The `filtersValues` passed here is
 * the application-shaped object emitted by `useFiltersValues` →
 * `applicationValues`: dataset-scoped keys without the compare-view column
 * prefix (`_d_<datasetId>_<field>_<op>`), concept mirrors (`_c_*`) and
 * `finalizedAt`. The application picks the ones that target its own dataset.
 */
const applicationEmbedParams = (filtersValues: FilterValues | null, primary: unknown, secondary: unknown, print: unknown): Record<string, string> => {
  const params: Record<string, string> = {}
  Object.assign(params, toStringRecord(filtersValues))
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
  const params: Record<string, string> = datasetEmbedParams(filtersValues, primary, secondary, print, prefix, datasetId)
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
): string | undefined => {
  const datasetId = element.dataset?.id
  // A form is always bound to a dataset: a missing dataset is an invalid
  // state that must not render an embed URL.
  if (!datasetId) return undefined
  const params = datasetEmbedParams(filtersValues, primary, secondary, print, prefix, datasetId)
  return `/data-fair/embed/dataset/${accessKeyPrefix(accessKey)}${datasetId}/form?${new URLSearchParams(params).toString()}`
}

export const applicationDFrameSrc = (
  element: ApplicationElement,
  accessKey: string | null,
  applicationFiltersValues: FilterValues | null,
  primary: unknown,
  secondary: unknown,
  print: unknown
): string | undefined => {
  // An application is always bound to a resolved application: a missing id is
  // an invalid state that must not render an embed URL (mirrors formDFrameSrc).
  const appId = element.application?.id
  if (!appId) return undefined
  const params = applicationEmbedParams(applicationFiltersValues, primary, secondary, print)
  return `/data-fair/app/${accessKeyPrefix(accessKey)}${appId}?${new URLSearchParams(params).toString()}`
}

/**
 * URL API de l'application embarquée, rebasée sur le serveur courant.
 *
 * Le href de l'application cible (`element.application.href`) porte un
 * chemin `/data-fair/api/v1/applications/:id` (ou `/data-fair/app/:id`),
 * mais l'origine peut être celle d'un autre environnement (ex. prod quand
 * on édite en dev). On préfère `application.apiUrl` — injecté par le proxy
 * data-fair (`reqPublicBaseUrl + /api/v1`) et par le dev-server — qui est
 * l'origine fiable du serveur courant, y compris dans le contexte d'édition
 * (mode config) où `application.href` est l'URL de l'UI de config
 * (ex. `http://host/config`) sans segment `/data-fair/`. En dernier
 * recours, on rebase l'ancien chemin sur l'origine de `application.href`.
 */
export const applicationUrl = (element: DashboardElement, application: ApplicationLike): string | undefined => {
  if (element.type !== 'application') return undefined
  const app = element.application
  if (!app) return undefined
  if (application.apiUrl && app.id) return `${application.apiUrl}/applications/${app.id}`
  const appHref = app.href
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
  const url = `${stripAfterDataFair(exposedUrl)}/data-fair/app/${key}${appId}?embed=true`
  return `<iframe src="${url}" width="100%" height="500px" style="background-color: transparent; border: none;"></iframe>`
}

export { datasetFilterKey }
