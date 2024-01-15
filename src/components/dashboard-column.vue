<script setup>
import dashboardElement from './dashboard-element.vue'

const props = defineProps({
  element: { type: Object, required: true },
  height: { type: Number, default: 400 },
  conceptValues: { type: [Object, null], required: true }
})

</script>

<template>
  <dashboard-element
    v-if="element.type==='column'"
    v-for="(el, k) in element.elements"
    :key="k"
    :element="el"
    :height="height / element.elements.length"
    :concept-values="conceptValues"
  />
  <dashboard-element
    v-else
    :element="element"
    :height="height"
    :concept-values="conceptValues"
  />

</template>
