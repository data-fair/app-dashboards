<script setup lang="ts">
/**
 * Dynamic filter row.
 *
 * - Renders one `dashboard-filter-item` per filter declared in the config:
 *   each item owns its own `useFilterState` (items / loading / value /
 *   search) in a real component setup, so draft config hot reloads
 *   add/remove autocompletes without an effect scope.
 * - Computes the aggregated `filtersValues` broadcast to embeds via
 *   `useFiltersValues`.
 * - Renders the period picker and the address filter (if enabled in config).
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import SearchAddress from '@data-fair/lib-vuetify/search-address.vue'
import { useElementSize } from '@vueuse/core'
import { useConfig } from '@/composables/config'
import { useFiltersValues } from '@/composables/useFiltersValues'
import DashboardFilterItem from './dashboard-filter-item.vue'
import DateRangeFilter from './date-range-filter.vue'
import type { FiltersValues, ApplicationFiltersValues } from '@/utils/filters'

const props = defineProps<{
  prefix?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FiltersValues]
  'update:applicationFilters': [value: ApplicationFiltersValues]
}>()

const root = ref<HTMLElement | null>(null)
const { width } = useElementSize(root)
const { config, filters, dataset } = useConfig()
const { t } = useI18n()

const address = ref<{ lon: number; lat: number } | undefined>(undefined)

// Re-aggregate filter values whenever any dependency changes
const { values: filtersValues, applicationValues } = useFiltersValues({
  prefix: props.prefix || '',
  address
})

watch(filtersValues, (val) => {
  emit('update:modelValue', val)
}, { immediate: true, deep: true })

watch(applicationValues, (val) => {
  emit('update:applicationFilters', val)
}, { immediate: true, deep: true })

// The selected address must be fed to the local `address` ref: the geo
// distance filter is computed from it, and the v-model only writes the
// `address` URL param. Re-aggregation is handled by the useFiltersValues
// watcher (which now depends on `address`).
const onAddressSelected = (ev: { lon: number; lat: number }) => {
  address.value = ev
}

const colWidth = computed(() => Math.min(Math.max(1, Math.ceil(12 * 250 / (width.value || 1))), 12))
</script>

<template>
  <v-row
    ref="root"
    justify="center"
    align="center"
    class="py-3"
  >
    <dashboard-filter-item
      v-for="(filter, i) in filters"
      :key="filter.labelField || i"
      :filter="filter"
      :prefix="prefix || ''"
      :address="address"
      :cols="colWidth"
    />
    <v-col
      v-if="config.periodFilter"
      :cols="colWidth"
    >
      <date-range-filter
        v-model="reactiveSearchParams.period"
        :min="dataset?.timePeriod?.startDate?.slice(0, 10)"
        :max="dataset?.timePeriod?.endDate?.slice(0, 10)"
        :label="t('filters.period')"
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
              :label="t('filters.radius')"
              density="compact"
            />
          </v-col>
        </v-row>
      </v-card>
    </v-col>
  </v-row>
</template>
