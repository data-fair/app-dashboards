/**
 * Aggregate the current filter selection into the `FiltersValues` object that
 * is broadcast to d-frame embeds.
 *
 * Extracted from `dashboard-filters.vue`. The pure serialization logic lives
 * in `utils/filters.ts` (`serializeFiltersValues`); this composable only
 * orchestrates the values resolution (fetch) and the reactivity.
 */
import { computed, ref, watch, type Ref } from 'vue'
import { ofetch } from 'ofetch'
import { filters2params } from '@data-fair/lib-utils/filters/index.js'
import { useAsyncAction } from '@data-fair/lib-vue/async-action.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardFilter } from '@/config'
import { useConfig } from './config'
import { datasetFilterKey } from '@/utils/dataset-filter'
import { normalizeStaticFilters } from '@/utils/staticFilters'
import {
  collectActiveFields,
  collectFilterEmitFields,
  isRangeFilter,
  serializeFiltersValues,
  valueMatchesStaticFilters,
  type FiltersValues,
  type ApplicationFiltersValues
} from '@/utils/filters'

export interface UseFiltersValuesOptions {
  prefix: string
  address: Ref<{ lon: number; lat: number } | undefined>
}

export const useFiltersValues = (opts: UseFiltersValuesOptions) => {
  const { prefix, address } = opts
  const { config, filters, dataset, fields } = useConfig()
  const emitted = ref<FiltersValues>({ keys: [] })

  // Abort the previous resolution when a new one starts: rapid filter/period/
  // radius changes must not leave a stale response winning the race on
  // `emitted` (last-write-wins by network arrival order).
  let abortController: AbortController | null = null

  const recompute = async (): Promise<void> => {
    abortController?.abort()
    abortController = new AbortController()
    const { signal } = abortController

    const datasetId = dataset.value?.id
    if (!datasetId) {
      emitted.value = { keys: [] }
      return
    }
    const allFilters = (filters.value || []) as DashboardFilter[]
    const active = allFilters.filter(f => reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix)])

    // Range-slider filters: raw numeric bounds read from the URL, no `/values/` resolution.
    const rangeValues: Record<string, { min?: string; max?: string }> = {}
    for (const f of allFilters.filter(isRangeFilter)) {
      if (reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix, 'gte')] || reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix, 'lte')]) {
        rangeValues[f.labelField] = {
          min: reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix, 'gte')],
          max: reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix, 'lte')]
        }
      }
    }

    let resolvedValues: Record<string, string[]> = {}
    if (active.length) {
      const emitFields = collectFilterEmitFields(active)

      const baseParams: Record<string, string> = { finalizedAt: dataset.value?.finalizedAt || '' }
      for (const f of active) {
        baseParams[`${f.labelField}_in`] = String(reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix)])
      }
      // Static filters scope the /values/ resolution to the same subset as
      // the values-labels lists and the data queries.
      Object.assign(baseParams, filters2params(normalizeStaticFilters(config.value.staticFilters)))

      const responses = await Promise.all(emitFields.map(f => {
        const filter = active.find(fwf => fwf.labelField === f || fwf.values?.includes(f))
        if (filter?.values?.length) {
          return ofetch(`${dataset.value!.href}/values/${f}`, { params: baseParams, signal })
        }
        const fv = reactiveSearchParams[datasetFilterKey(datasetId, f, prefix)]
        return filter?.multipleValues ? JSON.parse(`[${fv}]`) : [fv]
      }))

      resolvedValues = {}
      emitFields.forEach((f, i) => {
        // Client-side re-filtering of the /values/ resolution: see
        // valueMatchesStaticFilters (remove once fixed in data-fair).
        resolvedValues[f] = responses[i].filter((v: unknown) => valueMatchesStaticFilters(v, config.value.staticFilters, f))
      })
    }

    emitted.value = serializeFiltersValues({
      emitFields: Object.keys(resolvedValues),
      activeFields: collectActiveFields(allFilters, prefix, datasetId, reactiveSearchParams),
      resolvedValues,
      rangeValues,
      fields: fields.value,
      config: config.value,
      prefix,
      datasetId,
      finalizedAt: dataset.value?.finalizedAt,
      period: config.value.periodFilter ? String(reactiveSearchParams.period || '') : undefined,
      geoDistance: config.value.addressFilter && address.value && reactiveSearchParams.radius
        ? `${address.value.lon},${address.value.lat},${Number(reactiveSearchParams.radius) * 1000}`
        : undefined
    })
  }

  const { execute, loading, error } = useAsyncAction(recompute, { catch: 'error' })

  // Trigger initial computation and re-run on relevant inputs only.
  // Avoid `deep: true` on reactiveSearchParams: d-frame's state-change adapter
  // (see @data-fair/frame's VueReactiveDFrameStateChangeAdapter) rewrites every
  // key on every iframe state-change message, which would otherwise trigger
  // an unbounded fetch loop as the iframe URL drifts.
  //
  // The config-dependent inputs (staticFilters, periodFilter, addressFilter,
  // finalizedAt) are explicit watch sources so a draft config change (hot
  // reload) re-broadcasts the values to the embeds.
  watch(
    [
      () => {
        const ds = dataset.value?.id
        if (!ds) return ''
        return (filters.value || [])
          .map(f => [
            f.slider ? 's' : '',
            reactiveSearchParams[datasetFilterKey(ds, f.labelField, prefix)],
            reactiveSearchParams[datasetFilterKey(ds, f.labelField, prefix, 'gte')],
            reactiveSearchParams[datasetFilterKey(ds, f.labelField, prefix, 'lte')]
          ].join('\u0001'))
          .join('\u0002')
      },
      () => reactiveSearchParams.period,
      () => reactiveSearchParams.radius,
      () => address.value,
      () => config.value.periodFilter,
      () => config.value.addressFilter,
      () => config.value.staticFilters,
      () => dataset.value?.finalizedAt
    ],
    () => execute(),
    { immediate: true }
  )

  /**
   * Build the filter object broadcast to an embedded application
   * (`/data-fair/app/...`). The application must scope the parameters to
   * its own dataset, so we keep the dataset prefix on dynamic and static
   * filters (`<prefix>_d_<datasetId>_<field>_in`, etc.). The application
   * is expected to ignore any filter that targets a dataset it does not
   * use.
   *
   * Note: an application that uses a *different* dataset from the
   * dashboard's root will simply drop the prefixed params. This is
   * intentional: it is the only way to forward resolved values (codes
   * resolved from labels via the dataset's `/values/` endpoint) to an
   * app that does not know the dashboard's root dataset id.
   */
  const applicationValues = computed<ApplicationFiltersValues>(() => {
    return { ...emitted.value }
  })

  return {
    values: computed(() => emitted.value),
    applicationValues,
    update: execute,
    loading,
    error
  }
}
