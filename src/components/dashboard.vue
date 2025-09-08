<script setup>
import { ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import dashboardFilters from './dashboard-filters.vue'
import dashboardSection from './dashboard-section.vue'
import { useConfig } from '@/composables/config'

const { config, dataset } = useConfig()

const filtersValues = [ref({}), ref({})]
const tab = [ref(null), ref(null)]
let maxTitleLength = 0
let sumTitleLength = 0

const datasetFilterPrefix = '_d_' + dataset.value?.id + '_'
for (const filter of (config.value.filters || [])) {
  if (!reactiveSearchParams[datasetFilterPrefix + filter.labelField + '_in'] && filter.startValue) {
    reactiveSearchParams[datasetFilterPrefix + filter.labelField + '_in'] = filter.multipleValues ? JSON.stringify([filter.startValue]).slice(1, -1) : filter.startValue
  }
}
if (config.value.periodFilter && !reactiveSearchParams.period) {
  const start = (dataset.value.timePeriod ? dataset.value.timePeriod.startDate : new Date().toISOString()).slice(0, 10)
  const end = (dataset.value.timePeriod ? dataset.value.timePeriod.endDate : new Date().toISOString()).slice(0, 10)
  const period = [start]
  if (start !== end) period.push(end)
  reactiveSearchParams.period = period.join(',')
}

maxTitleLength = Math.max(...(config.value.sections?.map((/** @type{any} */s) => (s.title && s.title.length) || 0) || []))
sumTitleLength = config.value.sections?.reduce((/** @type{any} */acc, /** @type{any} */s) => acc + ((s.title && s.title.length) || 0), 0)

function updateSwitch (v) {
  if (v) reactiveSearchParams.view = 'compare'
  else delete reactiveSearchParams.view
}
</script>

<template>
  <v-container
    fluid
    data-iframe-height
  >
    <h2
      v-if="config.title"
      class="text-h4 text-center"
    >
      {{ config.title }}
    </h2>
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
      :model-value="reactiveSearchParams.view === 'compare'"
      style="max-height:40px"
      @update:model-value="updateSwitch"
    />
    <v-row>
      <v-col
        v-for="i in reactiveSearchParams.view === 'compare' ? [0, 1] : [0]"
        :key="i"
        :cols="reactiveSearchParams.view === 'compare' ? 6 : 12"
      >
        <dashboard-filters
          :prefix="i ? 'c' : ''"
          @update:model-value="value => filtersValues[i].value = value"
        />
        <dashboard-section
          v-if="config.sections?.length === 1"
          :section="config.sections[0]"
          :filters-values="filtersValues[i].value"
        />
        <template v-else-if="(config.sectionsGroup || []).includes('tabs')">
          <v-tabs
            v-if="config.sectionsGroup === 'tabs-tab'"
            v-model="tab[i].value"
            class="mb-3"
            color="primary"
            :fixed-tabs="maxTitleLength <= 30"
            :grow="maxTitleLength > 30 && sumTitleLength < 200"
            :direction="sumTitleLength >= 200 ? 'vertical' : 'horizontal'"
          >
            <v-tab
              v-for="(section, i) of (config.sections || [])"
              :key="i"
              :value="i"
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
            <v-col
              cols="auto"
            >
              <v-card
                variant="outlined"
              >
                <v-btn-toggle

                  v-model="tab[i].value"
                  color="primary"
                  mandatory
                  :style="sumTitleLength*15 >= $vuetify.display.width ? `flex-direction: column;height:${config.sections.length*36}px`:''"
                >
                  <v-btn
                    v-for="(section, i) of (config.sections || [])"
                    :key="i"
                    :value="i"
                    :height="sumTitleLength*15 >= $vuetify.display.width ? 36 : 48"
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
          <v-window v-model="tab[i].value">
            <v-window-item
              v-for="(section, j) of (config.sections || [])"
              :key="j"
              :value="j"
            >
              <dashboard-section
                :section="section"
                :filters-values="filtersValues[i].value"
                hide-title
              />
            </v-window-item>
          </v-window>
        </template>
        <v-expansion-panels
          v-else-if="config.sectionsGroup === 'accordion'"
          multiple
          variant="accordion"
          :model-value="(config.sections || []).map((s, j) => j)"
        >
          <v-expansion-panel
            v-for="(section, j) of (config.sections || [])"
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
                :filters-values="filtersValues[i].value"
                hide-title
              />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <template v-else>
          <div
            v-for="(section, j) of (config.sections || [])"
            :key="j"
            class="my-6"
          >
            <h2>
              <template v-if="section.icon">
                <v-icon :icon="section.icon.svgPath" />
                &nbsp;
              </template>
              {{ section.title }}
            </h2>
            <dashboard-section
              :section="section"
              :filters-values="filtersValues[i].value"
              hide-title
            />
          </div>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>
