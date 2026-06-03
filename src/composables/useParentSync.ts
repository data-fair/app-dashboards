/**
 * Watch the dashboard configuration and propagate application/dataset
 * references to the parent iframe (used in DataFair's draft mode).
 */
import { watch } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { Ref } from 'vue'
import type { DashboardConfig } from '@/config'
import { buildSyncDeltas, postConfigField } from '@/utils/draft-sync'

export const useParentSync = (config: Ref<DashboardConfig>) => {
  if (reactiveSearchParams.draft !== 'true' || !window.parent || window.parent === window) return

  watch(config, (next, prev) => {
    if (!next || !prev) return
    const deltas = buildSyncDeltas(prev, next)
    if (deltas.applications) postConfigField('applications', deltas.applications)
    if (deltas.datasets) postConfigField('datasets', deltas.datasets)
  }, { deep: true })
}
