<script setup lang="ts">
/**
 * Root of the dashboard view.
 *
 * Responsibilities:
 *  - initialize the reactive search params from the config (default filter
 *    values, default period),
 *  - decide between single-view and compare-view layout,
 *  - render the chosen section layout (single, tabs, accordion or flow).
 */
import { computed, reactive } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import dashboardFilters from './dashboard-filters.vue'
import dashboardSection from './dashboard-section.vue'
import dTitle from './d-title.vue'
import { useConfig } from '@/composables/config'
import type { DashboardSection } from '@/config'
import { initDefaultFilterValues } from '@/utils/filters'

const { config, dataset } = useConfig()

const filtersValues = reactive<Record<number, Record<string, any>>>({ 0: {}, 1: {} })
const applicationFiltersValues = reactive<Record<number, Record<string, any>>>({ 0: {}, 1: {} })
const tab = reactive<Record<number, number | null>>({ 0: null, 1: null })

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

const sections = computed<DashboardSection[]>(() => config.value.sections || [])

const maxTitleLength = computed(() =>
  Math.max(...sections.value.map(s => s.title?.length || 0), 0)
)

const sumTitleLength = computed(() =>
  sections.value.reduce((acc, s) => acc + (s.title?.length || 0), 0)
)

const isCompareView = computed(() => reactiveSearchParams.view === 'compare')
const compareViewIndices = computed(() => isCompareView.value ? [0, 1] : [0])

const showSectionsTabs = computed(() => (config.value.sectionsGroup || '').includes('tabs'))

function updateSwitch (v: boolean | null) {
  if (v) reactiveSearchParams.view = 'compare'
  else delete reactiveSearchParams.view
}

const pageTitleDefaults = {
  tag: 'h2' as const,
  size: 'h4' as const,
  center: true,
  bold: false,
  linePosition: 'none' as const,
  lineColor: 'primary' as const
}

const sectionTitleDefaults = {
  tag: 'h3' as const,
  size: 'h4' as const,
  center: false,
  bold: false,
  linePosition: 'none' as const,
  lineColor: 'primary' as const
}
</script>

<template>
  <v-container
    fluid
    data-iframe-height
  >
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
      label="Mode comparaison"
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
        <dashboard-section
          v-if="sections.length === 1"
          :section="sections[0]"
          :filters-values="filtersValues[i]"
          :application-filters-values="applicationFiltersValues[i]"
          :prefix="i ? 'c' : ''"
        />
        <template v-else-if="showSectionsTabs">
          <v-tabs
            v-if="config.sectionsGroup === 'tabs-tab'"
            v-model="tab[i]"
            class="mb-3"
            color="primary"
            :fixed-tabs="maxTitleLength <= 30"
            :grow="maxTitleLength > 30 && sumTitleLength < 200"
            :direction="sumTitleLength >= 200 ? 'vertical' : 'horizontal'"
          >
            <v-tab
              v-for="(section, idx) of sections"
              :key="idx"
              :value="idx"
            >
              <template v-if="section.icon">
                <v-icon :icon="section.icon.svgPath" />
                &nbsp;
              </template>
              {{ section.title }}
            </v-tab>
          </v-tabs>
          <v-row v-else-if="config.sectionsGroup === 'tabs-button'">
            <v-spacer />
            <v-col cols="auto">
              <v-card variant="outlined">
                <v-btn-toggle
                  v-model="tab[i]"
                  color="primary"
                  mandatory
                  :style="sumTitleLength * 15 >= $vuetify.display.width ? 'flex-direction: column;height:' + (sections.length * 36) + 'px' : ''"
                >
                  <v-btn
                    v-for="(section, idx) of sections"
                    :key="idx"
                    :value="idx"
                    :height="sumTitleLength * 15 >= $vuetify.display.width ? 36 : 48"
                  >
                    <template v-if="section.icon">
                      <v-icon :icon="section.icon.svgPath" />
                      &nbsp;
                    </template>
                    {{ section.title }}
                  </v-btn>
                </v-btn-toggle>
              </v-card>
            </v-col>
            <v-spacer />
          </v-row>
          <v-window v-model="tab[i]">
            <v-window-item
              v-for="(section, j) of sections"
              :key="j"
              :value="j"
            >
              <dashboard-section
                :section="section"
                :filters-values="filtersValues[i]"
                :application-filters-values="applicationFiltersValues[i]"
                :prefix="i ? 'c' : ''"
                hide-title
              />
            </v-window-item>
          </v-window>
        </template>
        <v-expansion-panels
          v-else-if="config.sectionsGroup === 'accordion'"
          multiple
          variant="accordion"
          :model-value="sections.map((_, j) => j)"
        >
          <v-expansion-panel
            v-for="(section, j) of sections"
            :key="j"
            :value="j"
            eager
          >
            <v-expansion-panel-title class="bg-primary">
              <h3>
                <template v-if="section.icon">
                  <v-icon :icon="section.icon.svgPath" />
                  &nbsp;
                </template>
                {{ section.title }}
              </h3>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <dashboard-section
                :section="section"
                :filters-values="filtersValues[i]"
                :application-filters-values="applicationFiltersValues[i]"
                :prefix="i ? 'c' : ''"
                hide-title
              />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <template v-else>
          <div
            v-for="(section, j) of sections"
            :key="j"
            class="my-6"
          >
            <d-title
              v-if="section.title"
              :text="section.title"
              :style="config.sectionsTitleStyle"
              :icon="section.icon"
              :defaults="sectionTitleDefaults"
            />
            <dashboard-section
              :section="section"
              :filters-values="filtersValues[i]"
              :application-filters-values="applicationFiltersValues[i]"
              :prefix="i ? 'c' : ''"
              hide-title
            />
          </div>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>
