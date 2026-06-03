<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardElement, DashboardSection } from '@/config'
import dashboardColumn from './dashboard-column.vue'

const props = defineProps<{
  section: DashboardSection
  filtersValues: Record<string, any> | null
  hideTitle?: boolean
}>()

const widths: Record<string, number[]> = {
  sm: [6, 12, 12],
  md: [4, 6, 8],
  lg: [3, 4, 6],
  xl: [2, 3, 6]
}

interface ProcessedElement extends DashboardElement {
  sm: number
  md: number
  lg: number
  xl: number
  class: string[]
}

interface ProcessedRow {
  height: number
  elements: ProcessedElement[]
}

const processedRows = computed<ProcessedRow[]>(() => {
  const rows = props.section.rows || []
  return rows.map((row: any) => {
    const elements: ProcessedElement[] = (row.elements || []).map((el: any) => ({
      ...el,
      sm: 12,
      md: 12,
      lg: 12,
      xl: 12,
      class: [] as string[]
    }))

    for (const breakpoint of ['sm', 'md', 'lg', 'xl']) {
      let i = 0
      while (i < elements.length) {
        let j = i
        let cpt = 0
        while (
          j < elements.length &&
          cpt + widths[breakpoint][(elements[j].width || 2) - 1] <= 12
        ) {
          cpt += widths[breakpoint][(elements[j].width || 2) - 1]
          j += 1
        }
        for (let k = i; k < j; k++) {
          const el = elements[k]
          const baseWidth = widths[breakpoint][(el.width || 2) - 1]
          ;(el as any)[breakpoint] = Math.floor(0.3 + 12 * baseWidth / cpt)
          const isText = el.type === 'text'
          el.class = isText ? ['order-first'] : []
          if (isText && (el as any)[breakpoint] === 12) {
            el.class.push('order-' + breakpoint + '-first')
          } else {
            el.class.push('order-' + breakpoint + '-' + (k + 1))
          }
        }
        i = j
      }
    }

    return {
      height: row.height,
      elements
    }
  })
})
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
      :sm="element.sm"
      :md="element.md"
      :lg="element.lg"
      :xl="element.xl"
      :class="element.class.join(' ')"
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
      />
    </v-col>
  </v-row>
</template>
