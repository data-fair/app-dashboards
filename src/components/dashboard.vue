<script setup lang="ts">
/**
 * Root of the dashboard view.
 *
 * Responsibilities:
 *  - initialize the reactive search params from the config (default filter
 *    values, default period),
 *  - decide between single-view and compare-view layout,
 *  - render the filters and delegate the sections layout to
 *    `sections-view.vue`.
 */
import { computed, onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import dashboardFilters from './dashboard-filters.vue'
import sectionsView from './sections-view.vue'
import dTitle from './d-title.vue'
import { useConfig } from '@/composables/config'
import { initDefaultFilterValues } from '@/utils/filters'
import type { FiltersValues, ApplicationFiltersValues } from '@/utils/filters'
import { pageTitleDefaults } from '@/utils/title-style'

const { config, dataset, error } = useConfig()
const { t } = useI18n()

const filtersValues = reactive<Record<number, FiltersValues>>({ 0: { keys: [] }, 1: { keys: [] } })
const applicationFiltersValues = reactive<Record<number, ApplicationFiltersValues>>({ 0: {}, 1: {} })

// Initialize default filter values from config
initDefaultFilterValues(config.value.filters, dataset.value?.id, reactiveSearchParams)

if (config.value.periodFilter && !reactiveSearchParams.period) {
  const timePeriod = dataset.value?.timePeriod
  const start = (timePeriod?.startDate || new Date().toISOString()).slice(0, 10)
  const end = (timePeriod?.endDate || new Date().toISOString()).slice(0, 10)
  const period = [start]
  if (start !== end) period.push(end)
  reactiveSearchParams.period = period.join(',')
}

// Signale au service de capture DataFair que le dashboard est rendu.
// Le service attend ensuite le network idle (chargement des iframes) ou
// le délai df:capture-delay avant de capturer.
onMounted(() => {
  window.triggerCapture?.()
})

const isCompareView = computed(() => reactiveSearchParams.view === 'compare')
const compareViewIndices = computed(() => isCompareView.value ? [0, 1] : [0])

function updateSwitch (v: boolean | null) {
  if (v) reactiveSearchParams.view = 'compare'
  else delete reactiveSearchParams.view
}
</script>

<template>
  <v-container
    fluid
    data-iframe-height
  >
    <v-empty-state
      v-if="error"
      :title="error"
      icon="mdi-alert-circle-outline"
      class="mt-8"
    />
    <template v-else>
      <d-title
        v-if="config.title"
        :text="config.title"
        :style="config.titleStyle"
        :defaults="pageTitleDefaults"
      />
      <p
        v-if="config.description"
        class="mt-2"
      >
        {{ config.description }}
      </p>
      <v-switch
        v-if="config.allowDuplicate"
        :label="t('dashboard.compareMode')"
        density="compact"
        :model-value="isCompareView"
        style="max-height:40px"
        @update:model-value="updateSwitch"
      />
      <v-row>
        <v-col
          v-for="i in compareViewIndices"
          :key="i"
          :cols="isCompareView ? 6 : 12"
        >
          <dashboard-filters
            :prefix="i ? 'c' : ''"
            @update:model-value="value => filtersValues[i] = value"
            @update:application-filters="value => applicationFiltersValues[i] = value"
          />
          <sections-view
            :sections="config.sections || []"
            :filters-values="filtersValues[i]"
            :application-filters-values="applicationFiltersValues[i]"
            :prefix="i ? 'c' : ''"
          />
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>
