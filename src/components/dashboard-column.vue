<script setup lang="ts">
import type { DashboardElement } from '@/config'
import dashboardElement from './dashboard-element.vue'

defineProps<{
  element: DashboardElement
  height?: number
  filtersValues: Record<string, any> | null
}>()
</script>

<template>
  <template v-if="element.type === 'column'">
    <dashboard-element
      v-for="(el, k) in element.elements"
      :key="k"
      :element="el"
      :height="height && element.elements ? height * (el.height || 100) / element.elements.reduce((acc, e) => acc + (e.height || 100), 0) : undefined"
      :filters-values="filtersValues"
    />
  </template>
  <dashboard-element
    v-else
    :element="element"
    :height="height"
    :filters-values="filtersValues"
  />
</template>
