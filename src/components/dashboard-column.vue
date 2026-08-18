<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardElement } from '@/config'
import type { FiltersValues, ApplicationFiltersValues } from '@/utils/filters'
import { dedupeKeys, elementKey } from '@/utils/layout'
import dashboardElement from './dashboard-element.vue'

const props = defineProps<{
  element: DashboardElement
  height?: number
  filtersValues: FiltersValues | null
  applicationFiltersValues: ApplicationFiltersValues | null
  prefix?: string
  instanceKey?: string
}>()

const children = computed(() =>
  props.element.type === 'column' ? (props.element.elements || []) : []
)
const childKeys = computed(() => dedupeKeys(children.value.map((el, k) => elementKey(el, k))))
</script>

<template>
  <template v-if="element.type === 'column'">
    <dashboard-element
      v-for="(el, k) in children"
      :key="childKeys[k]"
      :element="el"
      :height="height && children.length ? height * (el.height || 100) / children.reduce((acc, e) => acc + (e.height || 100), 0) : undefined"
      :filters-values="filtersValues"
      :application-filters-values="applicationFiltersValues"
      :prefix="prefix"
      :instance-key="`${instanceKey ?? ''}-${childKeys[k]}`"
    />
  </template>
  <dashboard-element
    v-else
    :element="element"
    :height="height"
    :filters-values="filtersValues"
    :application-filters-values="applicationFiltersValues"
    :prefix="prefix"
    :instance-key="instanceKey"
  />
</template>
