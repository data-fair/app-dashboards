<script setup>
import dashboardElement from './dashboard-element.vue'

defineProps({
  element: { type: Object, required: true },
  height: { type: Number, default: 400 },
  filtersValues: { type: [Object, null], required: true }
})

</script>

<template>
  <template v-if="element.type==='column'">
    <dashboard-element
      v-for="(el, k) in element.elements"
      :key="k"
      :element="el"
      :height="height*(el.height || 100) / element.elements.reduce((acc, el) => acc+(el.height||100), 0)"
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
