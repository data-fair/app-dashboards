<script setup>
const props = defineProps({
  element: { type: Object, required: true },
  paramFields: { type: Array, required: true },
  height: { type: Number, default: 400 }
})
const conceptParamKey = props.element.concept && `_c_${props.element.concept['x-concept'].id}_in`
</script>

<template>
  <v-iframe
    v-if="element.type === 'tablePreview'"
    :src="`/data-fair/embed/dataset/${element.dataset.id}/table?display=${element.display}`"
    :query-params-include="[conceptParamKey]"
    :query-params-exclude="paramFields.filter(f => f !== conceptParamKey)"
    :sync-state="true"
    :style="`height:${height}px`"
  />
  <v-iframe v-else-if="element.type === 'application'" :src="`/data-fair/app/${element.application.id}`" :query-params-include="[conceptParamKey]" :query-params-exclude="paramFields.filter(f => f !== conceptParamKey)" :sync-state="true" />
  <div v-else-if="element.type === 'text'">
    {{ element.content }}
  </div>
</template>
