<script setup lang="ts">
/**
 * Renders the configured sections with the layout chosen in config
 * (`sectionsGroup`): single section, tabs (v-tabs or button toggle),
 * accordion or flow.
 *
 * Extracted from `dashboard.vue` so each compare-view column owns its own
 * tab state.
 */
import { computed, ref } from 'vue'
import type { DashboardSection } from '@/config'
import { useConfig } from '@/composables/config'
import { sectionTitleDefaults } from '@/utils/title-style'
import type { FiltersValues, ApplicationFiltersValues } from '@/utils/filters'
import dashboardSection from './dashboard-section.vue'
import dTitle from './d-title.vue'

const props = defineProps<{
  sections: DashboardSection[]
  filtersValues: FiltersValues | null
  applicationFiltersValues: ApplicationFiltersValues | null
  prefix?: string
}>()

const { config } = useConfig()

const tab = ref<number | null>(null)

const maxTitleLength = computed(() =>
  Math.max(...props.sections.map(s => s.title?.length || 0), 0)
)

const sumTitleLength = computed(() =>
  props.sections.reduce((acc, s) => acc + (s.title?.length || 0), 0)
)

const showSectionsTabs = computed(() => (config.value.sectionsGroup || '').includes('tabs'))
</script>

<template>
  <dashboard-section
    v-if="sections.length === 1"
    :section="sections[0]"
    :filters-values="filtersValues"
    :application-filters-values="applicationFiltersValues"
    :prefix="prefix"
  />
  <template v-else-if="showSectionsTabs">
    <v-tabs
      v-if="config.sectionsGroup === 'tabs-tab'"
      v-model="tab"
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
            v-model="tab"
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
    <v-window v-model="tab">
      <v-window-item
        v-for="(section, j) of sections"
        :key="j"
        :value="j"
      >
        <dashboard-section
          :section="section"
          :filters-values="filtersValues"
          :application-filters-values="applicationFiltersValues"
          :prefix="prefix"
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
          :filters-values="filtersValues"
          :application-filters-values="applicationFiltersValues"
          :prefix="prefix"
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
        :filters-values="filtersValues"
        :application-filters-values="applicationFiltersValues"
        :prefix="prefix"
        hide-title
      />
    </div>
  </template>
</template>
