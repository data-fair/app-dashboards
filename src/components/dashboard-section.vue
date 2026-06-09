<script setup lang="ts">
/**
 * Renders a single section: title, description, and a vertical stack of
 * `v-row`s containing the elements. The per-element responsive layout
 * (sm/md/lg/xl column spans, ordering classes) is computed by the
 * `computeSectionBreakpoints` utility.
 */
import { computed } from 'vue'
import type { DashboardSection } from '@/config'
import { computeSectionBreakpoints } from '@/utils/layout'
import dashboardColumn from './dashboard-column.vue'

const props = defineProps<{
  section: DashboardSection
  filtersValues: Record<string, any> | null
  applicationFiltersValues: Record<string, any> | null
  hideTitle?: boolean
  prefix?: string
}>()

const processedRows = computed(() => computeSectionBreakpoints(props.section.rows))
</script>

<template>
  <h3
    v-if="!hideTitle"
    class="text-h5 mt-8"
  >
    <template v-if="section.icon">
      <v-icon :icon="section.icon.svgPath" />
      &nbsp;
    </template>
    {{ section.title }}
  </h3>
  <p
    v-if="section.description"
    class="mt-4"
  >
    {{ section.description }}
  </p>
  <v-row
    v-for="(row, j) of processedRows"
    :key="j"
    justify="center"
  >
    <v-col
      v-for="(element, i) of row.elements"
      :key="i"
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
        :instance-key="`${j}-${i}`"
      />
    </v-col>
  </v-row>
</template>
