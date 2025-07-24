<script setup>
import dashboardColumn from './dashboard-column.vue'
import { watch } from 'vue'

const props = defineProps({
  section: { type: Object, required: true },
  filtersValues: { type: [Object, null], required: true },
  hideTitle: { type: Boolean, default: false }
})

const widths = {
  sm: [6, 12, 12],
  md: [4, 6, 8],
  lg: [3, 4, 6],
  xl: [2, 3, 6]
}

watch(() => props.section.rows, () => {
  for (const row of props.section.rows) {
    for (const breakpoint of ['sm', 'md', 'lg', 'xl']) {
      let i = 0
      while (i < row.elements.length) {
        let j = i; let cpt = 0
        while (j < row.elements.length && cpt + widths[breakpoint][row.elements[j].width - 1] <= 12) {
          cpt += widths[breakpoint][row.elements[j].width - 1]
          j += 1
        }
        for (let k = i; k < j; k++) {
          row.elements[k][breakpoint] = Math.floor(0.3 + 12 * widths[breakpoint][row.elements[k].width - 1] / cpt)
          row.elements[k].class = row.elements[k].class || (row.elements[k].type === 'text' ? ['order-first'] : [])
          if (row.elements[k].type === 'text' && row.elements[k][breakpoint] === 12) {
            row.elements[k].class.push('order-' + breakpoint + '-first')
          } else {
            row.elements[k].class.push('order-' + breakpoint + '-' + (k + 1))
          }
        }
        i = j
      }
    }
  }
}, { immediate: true })
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
    v-for="(row,j) of (section.rows || [])"
    :key="j"
    justify="center"
  >
    <v-col
      v-for="(element,i) of (row.elements || [])"
      :key="i"
      :cols="12"
      :sm="element.sm"
      :md="element.md"
      :lg="element.lg"
      :xl="element.xl"
      :class="element.class ? element.class.join(' ') : ''"
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
