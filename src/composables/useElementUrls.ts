/**
 * Reactive URLs for a dashboard element: d-frame src, capture URL, sources URL,
 * description URL. Encapsulates the `accessKey` and `filtersValues` resolution
 * and the type-narrowing per element type.
 *
 * Two filter shapes are accepted:
 *  - `datasetFiltersValues` (dataset-scoped, with `prefix_d_<datasetId>_…`
 *    keys) for `tablePreview` and `form` elements. The dataset scope is
 *    stripped before forwarding to the embed REST API.
 *  - `applicationFiltersValues` (same shape, dataset-scoped) for
 *    `application` elements. The scope is preserved: the application is
 *    expected to pick the filters that target its own dataset and ignore
 *    the rest.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useFetch } from '@data-fair/lib-vue/fetch.js'
import type { DashboardElement, DashboardDataset } from '@/config'
import {
  tableDFrameSrc,
  formDFrameSrc,
  applicationDFrameSrc,
  descriptionUrl,
  sourcesUrl,
  captureUrl
} from '@/utils/element-url'
import type { FiltersValues, ApplicationFiltersValues } from '@/utils/filters'
import { useConfig } from './config'

export interface UseElementUrlsOptions {
  element: Ref<DashboardElement>
  datasetFiltersValues?: Ref<FiltersValues | null>
  applicationFiltersValues?: Ref<ApplicationFiltersValues | null>
  fallbackDataset?: ComputedRef<DashboardDataset | undefined>
  prefix?: string
}

export interface ElementUrlsApi {
  dFrameSrc: ComputedRef<string | undefined>
  descriptionHtml: ComputedRef<string | null>
  sourcesList: ComputedRef<{ id: string; title: string; href?: string }[]>
  captureHref: ComputedRef<string | undefined>
}

export const useElementUrls = (opts: UseElementUrlsOptions): ElementUrlsApi => {
  const { element, datasetFiltersValues, applicationFiltersValues, fallbackDataset, prefix = '' } = opts
  const { application, accessKey, config } = useConfig()
  const noFilters = ref<FiltersValues | null>(null)
  const datasetFilters = datasetFiltersValues || noFilters
  const applicationFilters = applicationFiltersValues || noFilters
  const primary = computed(() => reactiveSearchParams.primary)
  const secondary = computed(() => reactiveSearchParams.secondary)
  const print = computed(() => reactiveSearchParams.print)

  const dFrameSrc = computed<string | undefined>(() => {
    const el = element.value
    if (el.type === 'tablePreview') {
      const dsId = el.dataset?.id || fallbackDataset?.value?.id
      if (!dsId) return undefined
      return tableDFrameSrc(el, dsId, accessKey.value, datasetFilters.value, primary.value, secondary.value, print.value, prefix)
    }
    if (el.type === 'form') {
      return formDFrameSrc(el, accessKey.value, datasetFilters.value, primary.value, secondary.value, print.value, prefix)
    }
    if (el.type === 'application') {
      return applicationDFrameSrc(el, accessKey.value, applicationFilters.value, primary.value, secondary.value, print.value)
    }
    return undefined
  })

  const descriptionFetchUrl = computed(() => {
    const base = descriptionUrl(element.value, application)
    return base ? `${base}?html=true` : null
  })
  const { data: appData } = useFetch(() => descriptionFetchUrl.value, { immediate: true })
  const descriptionHtml = computed(() => (appData.value as { description?: string } | null)?.description || null)

  const sourcesFetchUrl = computed(() => sourcesUrl(element.value, application, config.value?.showSources))
  const { data: sourcesData } = useFetch(() => sourcesFetchUrl.value, { immediate: true })
  const sourcesList = computed(() => {
    if (element.value.type === 'tablePreview') {
      return [element.value.dataset || fallbackDataset?.value].filter(Boolean) as { id: string; title: string }[]
    }
    return ((sourcesData.value as { datasets?: { id: string; title: string; href?: string }[] } | null)?.datasets || [])
  })

  // The capture URL is a server-side screenshot of an application. The
  // application reads its filter params from the URL on capture, so we
  // use the application-shaped values (no dataset-scoped dynamic filters).
  const captureHref = computed(() => captureUrl(element.value, applicationFilters.value))

  return { dFrameSrc, descriptionHtml, sourcesList, captureHref }
}
