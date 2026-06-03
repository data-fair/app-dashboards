/**
 * Build URLs for the different embed modes supported by a dashboard element.
 *
 * Three kinds of URLs are produced:
 *  - d-frame src for the `<d-frame>` tag (used by all element types)
 *  - capture URL (server-side screenshot of an application)
 *  - embed code (iframe snippet for sharing)
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

const baseEmbedParams = (filtersValues: FilterValues | null, primary: unknown, secondary: unknown, print: unknown, ignoreFilters: boolean | undefined): Record<string, string> => {
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
  print: unknown
): string => {
  const params: Record<string, string> = baseEmbedParams(filtersValues, primary, secondary, print, element.ignoreFilters)
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
  print: unknown
): string => {
  const params = baseEmbedParams(filtersValues, primary, secondary, print, element.ignoreFilters)
  return `/data-fair/embed/dataset/${accessKeyPrefix(accessKey)}${element.dataset?.id}/form?${new URLSearchParams(params).toString()}`
}

export const applicationDFrameSrc = (
  element: ApplicationElement,
  accessKey: string | null,
  filtersValues: FilterValues | null,
  primary: unknown,
  secondary: unknown,
  print: unknown
): string => {
  const params = baseEmbedParams(filtersValues, primary, secondary, print, element.ignoreFilters)
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

export const captureUrl = (
  element: DashboardElement,
  application: ApplicationLike,
  filtersValues: FilterValues | null
): string | undefined => {
  if (element.type !== 'application') return undefined
  const app = element.application
  if (!app) return undefined
  const meta = (app.baseApp?.meta || {}) as Record<string, any>
  const params: Record<string, string> = {
    width: String(meta['df:capture-width'] || 1280),
    height: String(meta['df:capture-height'] || 720),
    app_embed: 'true'
  }
  for (const [key, value] of Object.entries(filtersValues || {})) {
    if (key === 'keys') continue
    params[`app_${key}`] = String(value)
  }
  const url = applicationUrl(element, application)
  return url ? `${url}/capture?${new URLSearchParams(params).toString()}` : undefined
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
