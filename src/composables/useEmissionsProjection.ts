/**
 * Project the emissions of the embedded visus into the dashboard URL.
 *
 * Each embed writes its own state in a private, namespaced channel
 * (`sync-params="*:<scope>_"` on its d-frame): a filter it emits lands as
 * `<scope>_<key>` in the dashboard URL. This composable turns those private
 * keys into the clean, shared namespace (`_c_*` / `_d_*`) every visu and every
 * outer page understands, for the elements in `shared-filters` mode (see
 * `utils/emissions.ts`).
 *
 * Called once by `dashboard.vue`. In the compare view the right column publishes
 * under its column prefix and the left one stays in the clean keys, which the
 * right column ignores (`useFiltersValues`). Selections (`_eq` / `_in`) are
 * mirrored into the other column's private channel on every change, so a click
 * on one map selects the same entity on the other side while each column keeps
 * its own filters (notably its year).
 */
import { computed, ref, watch } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useConfig } from './config'
import {
  collectEmissionsTargets,
  computeProjections,
  computeSelectionSync,
  emissionsSignature,
  nextEchoState,
  seedProjected,
  selectionEmissionsState
} from '@/utils/emissions'
import type { EchoState } from '@/utils/emissions'
import { ownedFilterKeys } from '@/utils/filters'

export const useEmissionsProjection = (): void => {
  const { config, dataset, fields } = useConfig()
  const targets = computed(() => collectEmissionsTargets(config.value?.sections, ['', 'c']))
  const owned = computed(() => ownedFilterKeys({
    config: config.value || {},
    fields: fields.value,
    datasetId: dataset.value?.id
  }))
  // Keys this projection wrote (or adopted after a reload), so it can remove a
  // selection that an element cleared without touching the page's own keys.
  const projected = ref<Record<string, string>>({})
  // Keys it removed, to drop their late echo instead of republishing it.
  let echoState: EchoState = { sources: {}, withdrawn: {} }
  // Selection state of the previous run, to mirror only a changed/cleared
  // selection into the other compare-view column (last click wins).
  let previousSelections: Record<string, Record<string, string>> = {}
  let seeded = false

  watch(
    () => emissionsSignature(reactiveSearchParams, targets.value),
    () => {
      if (!seeded) {
        projected.value = seedProjected(reactiveSearchParams, targets.value)
        previousSelections = selectionEmissionsState(reactiveSearchParams, targets.value)
        seeded = true
      } else {
        const sync = computeSelectionSync(reactiveSearchParams, targets.value, previousSelections, owned.value)
        for (const key of sync.remove) delete reactiveSearchParams[key]
        for (const [key, value] of Object.entries(sync.set)) {
          if (reactiveSearchParams[key] !== value) reactiveSearchParams[key] = value
        }
        previousSelections = selectionEmissionsState(reactiveSearchParams, targets.value)
      }
      const result = computeProjections(reactiveSearchParams, targets.value, owned.value, projected.value, echoState.withdrawn)
      echoState = nextEchoState(reactiveSearchParams, targets.value, echoState, projected.value, result)
      const { values, remove } = result
      for (const key of remove) delete reactiveSearchParams[key]
      for (const [key, value] of Object.entries(values)) {
        if (reactiveSearchParams[key] !== value) reactiveSearchParams[key] = value
      }
      projected.value = values
    },
    { immediate: true }
  )
}
