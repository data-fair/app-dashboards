<script setup>
import vIframe from '@koumoul/v-iframe'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { computed } from 'vue'

const props = defineProps({
  element: { type: Object, required: true },
  height: { type: Number, default: 400 },
  filtersValues: { type: [Object, null], required: true }
})

const config = window.APPLICATION.configuration
const fields = Object.assign({}, ...config.datasets[0].schema.map(f => ({ [f.key]: f })))

const queryParamsExtra = computed(() => {
  const qpe = { ...props.filtersValues }
  if (reactiveSearchParams.primary) qpe.primary = reactiveSearchParams.primary
  if (reactiveSearchParams.secondary) qpe.secondary = reactiveSearchParams.secondary
  return qpe
})

const application = window.APPLICATION
const last = application.exposedUrl.split('/').pop()
const toks = last.split('%3A')
const accessKey = (toks.length === 2) ? toks[0] : null
const requiredFilter = computed(() => {
  return ((props.element.valueMandatory && props.element.mandatoryFilters) || []).filter(f => !props.filtersValues?.keys?.includes(f))
})
</script>

<template>
  <v-alert
    v-if="requiredFilter.length"
    type="info"
    variant="outlined"
  >
    <h4>Veuillez sélectionner une valeur de {{ requiredFilter.map(f => fields[f].label || fields[f].title || fields[f]['x-originalName'] || f).join(', ') }}</h4>
  </v-alert>
  <v-iframe
    v-else-if="element.type === 'tablePreview'"
    :src="`/data-fair/embed/dataset/${accessKey ? (accessKey + '%3A') : ''}${(element.dataset || config.datasets[0]).id}/table?display=${element.display}&interaction=${!element.noInteractions}${element.fields.length ? ('&cols=' + element.fields.join(',')) : ''}`"
    :query-params-extra="queryParamsExtra"
    :style="`height:${height>0 ? height+'px' : '100%'}`"
  />
  <v-iframe
    v-else-if="element.type === 'form'"
    :src="`/data-fair/embed/dataset/${accessKey ? (accessKey + '%3A') : ''}${element.dataset.id}/form`"
    :query-params-extra="queryParamsExtra"
    :style="`height:${height>0 ? height+'px' : '100%'}`"
  />
  <div
    v-else
    :style="`overflow-y:auto;height:${height>0 ? height+'px' : '100%'}`"
  >
    <v-iframe
      v-if="element.type === 'application'"
      :src="`/data-fair/app/${accessKey ? (accessKey + '%3A') : ''}${element.application.id}`"
      :query-params-extra="queryParamsExtra"
      :style="element.application.baseApp.meta['df:overflow'] !== 'true' ? `height:${height>0 ? height+'px' : '100%'}` : ''"
    />
    <div
      v-else-if="element.type === 'text'"
      style="white-space: pre-wrap"
      class="mt-4"
    >
      {{ element.content }}
    </div>
  </div>
</template>
