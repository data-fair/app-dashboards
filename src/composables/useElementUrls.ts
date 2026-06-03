/**
 * Reactive URLs for a dashboard element: d-frame src, capture URL, sources URL,
 * description URL. Encapsulates the `accessKey` and `filtersValues` resolution
 * and the type-narrowing per element type.
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useFetch } from '@data-fair/lib-vue/fetch.js'
import type { DashboardElement, DashboardDataset } from '@/config'
import {
  tableDFrameSrc,
  formDFrameSrc,
  applicationDFrameSrc,
  applicationUrl,
  descriptionUrl,
  sourcesUrl,
  captureUrl
} from '@/utils/element-url'
import { useConfig } from './config'

export interface UseElementUrlsOptions {
  element: Ref<DashboardElement>
  filtersValues: Ref<Record<string, any> | null>
  fallbackDataset?: ComputedRef<DashboardDataset | undefined>
}

export interface ElementUrlsApi {
  dFrameSrc: ComputedRef<string | undefined>
  applicationHref: ComputedRef<string | undefined>
  descriptionHtml: ComputedRef<string | null>
  sourcesList: ComputedRef<{ id: string; title: string; href?: string }[]>
  captureHref: ComputedRef<string | undefined>
}

export const useElementUrls = (opts: UseElementUrlsOptions): ElementUrlsApi => {
  const { element, filtersValues, fallbackDataset } = opts
  const { application, accessKey } = useConfig()
  const primary = computed(() => reactiveSearchParams.primary)
  const secondary = computed(() => reactiveSearchParams.secondary)
  const print = computed(() => reactiveSearchParams.print)

  const dFrameSrc = computed<string | undefined>(() => {
    const el = element.value
    if (el.type === 'tablePreview') {
      const dsId = el.dataset?.id || fallbackDataset?.value?.id
      if (!dsId) return undefined
      return tableDFrameSrc(el, dsId, accessKey.value, filtersValues.value, primary.value, secondary.value, print.value)
    }
    if (el.type === 'form') {
      return formDFrameSrc(el, accessKey.value, filtersValues.value, primary.value, secondary.value, print.value)
    }
    if (el.type === 'application') {
      return applicationDFrameSrc(el, accessKey.value, filtersValues.value, primary.value, secondary.value, print.value)
    }
    return undefined
  })

  const applicationHref = computed(() => applicationUrl(element.value, application))

  const descriptionFetchUrl = computed(() => {
    const base = descriptionUrl(element.value, application)
    return base ? `${base}?html=true` : null
  })
  const { data: appData } = useFetch(() => descriptionFetchUrl.value, { immediate: true })
  const descriptionHtml = computed(() => (appData.value as { description?: string } | null)?.description || null)

  const sourcesFetchUrl = computed(() => sourcesUrl(element.value, application, undefined))
  const { data: sourcesData } = useFetch(() => sourcesFetchUrl.value, { immediate: true })
  const sourcesList = computed(() => {
    if (element.value.type === 'tablePreview') {
      return [element.value.dataset || fallbackDataset?.value].filter(Boolean) as { id: string; title: string }[]
    }
    return ((sourcesData.value as { datasets?: { id: string; title: string; href?: string }[] } | null)?.datasets || [])
  })

  const captureHref = computed(() => captureUrl(element.value, application, filtersValues.value))

  return { dFrameSrc, applicationHref, descriptionHtml, sourcesList, captureHref }
}
