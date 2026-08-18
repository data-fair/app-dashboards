<script setup lang="ts">
/**
 * Renders a single section: title, description, and a vertical stack of
 * `v-row`s containing the elements. The per-element responsive layout
 * (sm/md/lg/xl column spans, ordering classes) is computed by the
 * `computeSectionBreakpoints` utility.
 */
import { computed } from 'vue'
import type { DashboardSection } from '@/config'
import { useConfig } from '@/composables/config'
import { computeSectionBreakpoints, dedupeKeys, elementKey } from '@/utils/layout'
import { sectionTitleDefaults } from '@/utils/title-style'
import type { FiltersValues, ApplicationFiltersValues } from '@/utils/filters'
import dashboardColumn from './dashboard-column.vue'
import dTitle from './d-title.vue'

const props = defineProps<{
  section: DashboardSection
  filtersValues: FiltersValues | null
  applicationFiltersValues: ApplicationFiltersValues | null
  hideTitle?: boolean
  prefix?: string
}>()

const { config } = useConfig()

const processedRows = computed(() => computeSectionBreakpoints(props.section.rows))

// Stable per-element keys (identity-based, deduplicated) so reordering or
// inserting elements in draft reuses the existing components/iframes instead
// of recreating them.
const rowsWithKeys = computed(() => processedRows.value.map(row => ({
  ...row,
  keys: dedupeKeys(row.elements.map((el, i) => elementKey(el, i)))
})))
</script>

<template>
  <d-title
    v-if="!hideTitle && section.title"
    :text="section.title"
    :style="config.sectionsTitleStyle"
    :icon="section.icon"
    :defaults="sectionTitleDefaults"
    class="mt-8"
  />
  <p
    v-if="section.description"
    class="mt-4"
  >
    {{ section.description }}
  </p>
  <v-row
    v-for="(row, j) of rowsWithKeys"
    :key="j"
    justify="center"
  >
    <v-col
      v-for="(element, i) of row.elements"
      :key="row.keys[i]"
      :cols="12"
      :sm="row.layouts[i].sm"
      :md="row.layouts[i].md"
      :lg="row.layouts[i].lg"
      :xl="row.layouts[i].xl"
      :class="row.layouts[i].class.join(' ')"
    >
      <h4
        v-if="element.title"
        class="text-h6 text-center mt-4"
      >
        {{ element.title }}
      </h4>
      <dashboard-column
        :element="element"
        :height="row.height"
        :filters-values="filtersValues"
        :application-filters-values="applicationFiltersValues"
        :prefix="prefix"
        :instance-key="row.keys[i]"
      />
    </v-col>
  </v-row>
</template>
