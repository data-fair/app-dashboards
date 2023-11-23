<script setup>
import vIframe from '@koumoul/v-iframe'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params.js'

const props = defineProps({
  element: { type: Object, required: true },
  height: { type: Number, default: 400 }
})
const conceptParamKey = props.element.concept && `_c_${props.element.concept['x-concept'].id}_eq`
</script>

<template>
  <v-iframe
    v-if="element.type === 'tablePreview'"
    :src="`/data-fair/embed/dataset/${element.dataset.id}/table?display=${element.display}&interaction=${!element.noInteractions}${element.fields.length ? ('&cols=' + element.fields.join(',')) : ''}`"
    :query-params-extra="reactiveSearchParams[conceptParamKey] ? {[conceptParamKey]: reactiveSearchParams[conceptParamKey] } : {}"
    :style="`height:${height>0 ? height+'px' : '100%'}`"
  />
  <div
    v-else
    :style="`overflow-y:auto;height:${height>0 ? height+'px' : '100%'}`"
  >
    <v-iframe
      v-if="element.type === 'application'"
      :src="`/data-fair/app/${element.application.id}`"
      :query-params-extra="reactiveSearchParams[conceptParamKey] ? {[conceptParamKey]: reactiveSearchParams[conceptParamKey] } : {}"
      :style="element.application.baseApp.meta['df:overflow'] !== 'true' ? `height:${height>0 ? height+'px' : '100%'}` : ''"
    />
    <div v-else-if="element.type === 'text'">
      {{ element.content }}
    </div>
  </div>
</template>
