<script setup>
import vIframe from '@koumoul/v-iframe'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params.js'
import { computed } from 'vue'

const props = defineProps({
  element: { type: Object, required: true },
  height: { type: Number, default: 400 },
  conceptValues: { type: [Object, null], required: true }
})

const queryParamsExtra = computed(() => {
  const qpe = {}
  props.element.concepts.forEach(concept => {
    const conceptParamKey = `_c_${concept['x-concept'].id}_eq`
    if (reactiveSearchParams[conceptParamKey]) qpe[conceptParamKey] = reactiveSearchParams[conceptParamKey]
  })
  if (reactiveSearchParams.primary) qpe.primary = reactiveSearchParams.primary
  if (reactiveSearchParams.secondary) qpe.secondary = reactiveSearchParams.secondary
  return qpe
})

</script>

<template>
  <v-alert
    v-if="element.valueMandatory && (!conceptValues || !element.concepts.find(c => conceptValues[c.key] ))"
    type="info"
    variant="outlined"
  >
    <h4>Veuillez sélectionner une valeur dans la liste</h4>
  </v-alert>
  <v-iframe
    v-else-if="element.type === 'tablePreview'"
    :src="`/data-fair/embed/dataset/${element.dataset.id}/table?display=${element.display}&interaction=${!element.noInteractions}${element.fields.length ? ('&cols=' + element.fields.join(',')) : ''}`"
    :query-params-extra="queryParamsExtra"
    :style="`height:${height>0 ? height+'px' : '100%'}`"
  />
  <div
    v-else
    :style="`overflow-y:auto;height:${height>0 ? height+'px' : '100%'}`"
  >
    <v-iframe
      v-if="element.type === 'application'"
      :src="`/data-fair/app/${element.application.id}`"
      :query-params-extra="queryParamsExtra"
      :style="element.application.baseApp.meta['df:overflow'] !== 'true' ? `height:${height>0 ? height+'px' : '100%'}` : ''"
    />
    <div
      v-else-if="element.type === 'text'"
      class="mt-4"
    >
      {{ element.content }}
    </div>
  </div>
</template>
