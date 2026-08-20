<script setup lang="ts">
/**
 * One dynamic filter: owns its `useFilterState` (items / loading / value /
 * search) in its own setup so the composable's `useFetch` runs in a real
 * component context (inject works). Vue creates/disposes one instance per
 * configured filter: a draft config change (hot reload) adds/removes
 * autocompletes without any manual effect scope.
 *
 * When the filter is configured as a range slider (`slider: true`), the
 * autocomplete is replaced by a `v-range-slider` bound to the same
 * `useFilterState` value (a `[min, max]` pair stored as `_gte`/`_lte` keys).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useConfig } from '@/composables/config'
import { useFilterState } from '@/composables/useFilterState'
import type { DashboardFilter } from '@/config'
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import { datasetFilterKey } from '@/utils/dataset-filter'

const props = defineProps<{
  filter: DashboardFilter
  prefix: string
  address: { lon: number; lat: number } | undefined
  cols: number
}>()

const { config, dataset, fields } = useConfig()
const { t } = useI18n()

// Reactive stand-in for the parent's `address` ref: a computed is a Ref, so
// `useFilterState` tracks it (geo filters) while the parent only re-renders
// with a new prop value.
const address = computed(() => props.address)

const { items, loading, value, searchItems, sliderMin, sliderMax, step, boundsLoading, formatValue } = useFilterState({
  filter: () => props.filter,
  prefix: props.prefix,
  datasetId: computed(() => dataset.value?.id),
  datasetHref: computed(() => dataset.value?.href),
  config,
  address
})

const onFilterSearch = (search: string | undefined) => {
  const key = datasetFilterKey(dataset.value?.id || '', props.filter.labelField, props.prefix)
  if ((search == null || search.length) && search !== reactiveSearchParams[key] && !props.filter.showAllValues) {
    searchItems(search)
  }
}

const fieldLabel = computed<string>(() => {
  const field = fields.value[props.filter.labelField] as (Field & { 'x-originalName'?: string }) | undefined
  return (field?.label as string | undefined) || (field?.title as string | undefined) || field?.['x-originalName'] || props.filter.labelField
})
</script>

<template>
  <v-col :cols="cols">
    <div
      v-if="filter.slider"
      class="text-body-2 text-medium-emphasis"
      style="min-width:280px;"
    >
      {{ fieldLabel }}
    </div>
    <v-range-slider
      v-if="filter.slider"
      :model-value="(value ?? [sliderMin ?? 0, sliderMax ?? 0]) as [number, number]"
      :min="sliderMin ?? 0"
      :max="sliderMax ?? 0"
      :step="step"
      :disabled="sliderMin == null || sliderMax == null"
      :loading="boundsLoading"
      density="compact"
      hide-details
      show-ticks="always"
      :ticks="sliderMin != null && sliderMax != null ? [sliderMin, (sliderMin + sliderMax) / 2, sliderMax] : []"
      :tick-size="4"
      thumb-label="hover"
      style="min-width:280px;"
      @update:model-value="v => value = (v as [number, number])"
    >
      <template #tick-label="slotProps">
        <small>{{ formatValue(slotProps.tick.value) }}</small>
      </template>
      <template #thumb-label="slotProps">
        {{ formatValue(slotProps.modelValue) }}
      </template>
    </v-range-slider>
    <v-autocomplete
      v-else
      v-model="value"
      :loading="loading"
      :items="items"
      :item-title="'label'"
      :item-value="'value'"
      variant="outlined"
      hide-details
      :no-data-text="t('filters.noData')"
      :label="fieldLabel"
      :clearable="!filter.forceOneValue"
      :persistent-clear="!filter.forceOneValue"
      :multiple="filter.multipleValues"
      style="min-width:250px;"
      density="comfortable"
      autocomplete="off"
      @update:search="search => onFilterSearch(search)"
    />
  </v-col>
</template>
