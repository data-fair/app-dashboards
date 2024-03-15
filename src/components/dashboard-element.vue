<script setup>
import vIframe from '@koumoul/v-iframe'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params-global.js'
import { computed } from 'vue'

const props = defineProps({
  element: { type: Object, required: true },
  height: { type: Number, default: 400 },
  conceptValues: { type: [Object, null], required: true }
})

const queryParamsExtra = computed(() => {
  const qpe = { ...props.conceptValues }
  if (props.element.type === 'tablePreview') {
    for (const key of Object.keys(props.conceptValues)) {
      if (!(props.element.dataset.schema || []).find(f => f['x-concept'] && f['x-concept'].id === key.split('_')[2])) delete qpe[key]
    }
  }
  console.log(props.element)

  // props.element.concepts.forEach(concept => {
  //   if (props.conceptValues[concept.key]) qpe[`_c_${concept['x-concept'].id}_eq`] = props.conceptValues[concept.key]
  //   if (props.conceptValues._c_date_match) qpe._c_date_match = props.conceptValues._c_date_match
  //   if (props.conceptValues._c_geo_distance) qpe._c_geo_distance = props.conceptValues._c_geo_distance
  // })
  if (reactiveSearchParams.primary) qpe.primary = reactiveSearchParams.primary
  if (reactiveSearchParams.secondary) qpe.secondary = reactiveSearchParams.secondary
  console.log('qpe', qpe)
  return qpe
})

</script>

<template>
  <v-alert
    v-if="element.valueMandatory && (!conceptValues || !Object.keys(conceptValues).length)"
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
