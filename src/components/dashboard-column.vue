<script setup>
import dashboardElement from './dashboard-element.vue'

const props = defineProps({
  element: { type: Object, required: true },
  height: { type: Number, default: 400 },
  filtersValues: { type: [Object, null], required: true }
})

</script>

<template>
  <dashboard-element
    v-for="(el, k) in element.elements"
    v-if="element.type==='column'"
    :key="k"
    :element="el"
    :height="height / element.elements.length"
    :filters-values="filtersValues"
  />
  <dashboard-element
    v-else
    :element="element"
    :height="height"
    :filters-values="filtersValues"
  />
</template>
