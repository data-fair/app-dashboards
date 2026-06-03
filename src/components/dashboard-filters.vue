<script setup lang="ts">
/**
 * Dynamic filter row.
 *
 * - For each filter declared in the config, manages a `useFilterState`
 *   (items / loading / value / search).
 * - Computes the aggregated `filtersValues` broadcast to embeds via
 *   `useFiltersValues`.
 * - Renders the period picker and the address filter (if enabled in config).
 */
import { computed, ref, watch } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import SearchAddress from '@data-fair/lib-vuetify/search-address.vue'
import DateRangePicker from '@data-fair/lib-vuetify/date-range-picker.vue'
import { useElementSize } from '@vueuse/core'
import { useConfig } from '@/composables/config'
import { useFiltersValues } from '@/composables/useFiltersValues'
import { useFilterState } from '@/composables/useFilterState'
import type { DashboardFilter } from '@/config'
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import { datasetFilterKey } from '@/utils/dataset-filter'

const props = defineProps<{
  prefix?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const root = ref<HTMLElement | null>(null)
const { width } = useElementSize(root)
const { config, filters, dataset, fields } = useConfig()

const address = ref<{ lon: number; lat: number } | undefined>(undefined)

const filtersStateList = computed(() => {
  return (filters.value || []).map(f => useFilterState({
    filter: f,
    prefix: props.prefix || '',
    datasetId: computed(() => dataset.value?.id),
    config,
    address
  }))
})

// Re-aggregate filter values whenever any dependency changes
const { values: filtersValues, update } = useFiltersValues({
  prefix: props.prefix || '',
  address
})

watch(filtersValues, (val) => {
  emit('update:modelValue', val)
}, { immediate: true, deep: true })

const updateValue = (filter: DashboardFilter, value: string | string[] | undefined) => {
  if (!filter.forceOneValue || value) {
    update(filter.labelField)
  }
}

const onPeriodChange = () => update()

const onAddressSelected = (ev: { lon: number; lat: number }) => {
  address.value = ev
  update()
}

const onRadiusChange = () => update()

const colWidth = computed(() => Math.min(Math.max(1, Math.ceil(12 * 250 / (width.value || 1))), 12))

const fieldLabel = (filter: DashboardFilter): string => {
  const field = fields.value[filter.labelField] as (Field & { 'x-originalName'?: string }) | undefined
  return (field?.label as string | undefined) || (field?.title as string | undefined) || field?.['x-originalName'] || filter.labelField
}
</script>

<template>
  <v-row
    ref="root"
    justify="center"
    align="center"
    class="py-3"
  >
    <v-col
      v-for="(filter, i) in filters"
      :key="filter.labelField || i"
      :cols="colWidth"
    >
      <v-autocomplete
        v-if="filtersStateList[i]"
        v-model="filtersStateList[i].value.value"
        :loading="filtersStateList[i].loading.value"
        :items="filtersStateList[i].items.value"
        :item-title="(v: string) => (fields[filter.labelField]?.['x-labels'] as Record<string, string> | undefined)?.[v] ?? v"
        :item-value="(v: string) => v"
        variant="outlined"
        hide-details
        no-data-text="Aucun élément trouvé"
        :label="fieldLabel(filter)"
        :clearable="!filter.forceOneValue"
        :persistent-clear="!filter.forceOneValue"
        :multiple="filter.multipleValues"
        style="min-width:250px;"
        density="comfortable"
        autocomplete="off"
        @update:search="search => (search == null || search.length) && search !== reactiveSearchParams[datasetFilterKey(dataset?.id || '', filter.labelField, props.prefix || '')] && !filter.showAllValues && filtersStateList[i].searchItems(search)"
        @update:model-value="updateValue(filter, $event)"
      />
    </v-col>
    <v-col
      v-if="config.periodFilter"
      :cols="colWidth"
    >
      <date-range-picker
        v-model="reactiveSearchParams.period"
        :min="dataset?.timePeriod?.startDate?.slice(0, 10)"
        :max="dataset?.timePeriod?.endDate?.slice(0, 10)"
        label="Période"
        @update:model-value="onPeriodChange"
      />
    </v-col>
    <v-col
      v-if="config.addressFilter"
      cols="auto"
    >
      <v-card
        variant="outlined"
        class="px-1 py-2"
        style="width:320px;border-color:#A0A0A0"
      >
        <v-row align="start">
          <v-col
            class="pr-0"
            :cols="8"
          >
            <search-address
              v-model="reactiveSearchParams.address"
              variant="plain"
              @selected="onAddressSelected"
            />
          </v-col>
          <v-col
            class="pl-0"
            :cols="4"
          >
            <v-text-field
              v-model="reactiveSearchParams.radius"
              style="height:38px"
              variant="plain"
              type="number"
              label="Rayon (km)"
              density="compact"
              @update:model-value="onRadiusChange"
            />
          </v-col>
        </v-row>
      </v-card>
    </v-col>
  </v-row>
</template>
