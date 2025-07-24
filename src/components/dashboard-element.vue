<script setup>
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { computed, ref } from 'vue'
import { computedAsync, useElementSize } from '@vueuse/core'
import { ofetch } from 'ofetch'
import { mdiCodeTags, mdiCamera } from '@mdi/js'
import { useConfig } from '@/composables/config'
import { messageDisplay, messageType, messageContent } from '@/messages'

const props = defineProps({
  element: { type: Object, required: true },
  height: { type: Number, default: 400 },
  filtersValues: { type: [Object, null], required: true }
})

const { application, config, fields, accessKey, dFrameAdapter } = useConfig()

const requiredFilter = computed(() => {
  return ((props.element.valueMandatory && props.element.mandatoryFilters) || []).filter(f => !props.filtersValues?.keys?.includes(f))
})

const actions = ref(null)
const actionsHeight = useElementSize(actions).height

const searchParams = computed(() => {
  const searchParams = {
    ...(props.element.ignoreFilters ? {} : props.filtersValues),
    'd-frame': true
  }
  if (reactiveSearchParams.primary) searchParams.primary = reactiveSearchParams.primary
  if (reactiveSearchParams.secondary) searchParams.secondary = reactiveSearchParams.secondary
  if (props.element.type === 'tablePreview') {
    if (props.element.display !== 'auto') searchParams.display = props.element.display
    searchParams.interaction = !props.element.noInteractions
    if (props.element.fields?.length) searchParams.cols = props.element.fields.join(',')
  }
  if (reactiveSearchParams.print === 'true') {
    searchParams.interaction = false
  }
  return new URLSearchParams(searchParams)
})

const description = computedAsync(async () => {
  if (props.element.type !== 'application' || !props.element.description || props.element.description === 'none') return null
  const app = await ofetch(props.element.application.href, { params: { html: true } })
  return app.description
}, null, {
  onError: function (e) {
    messageType.value = 'error'
    messageContent.value = e.status + ' - ' + e.data
    messageDisplay.value = true
  }
})

const sources = computedAsync(async () => {
  if (!config.showSources) return []
  if (props.element.type === 'tablePreview') return [props.element.dataset || config.datasets[0]]
  else if (props.element.type !== 'application') return []
  const app = await ofetch(props.element.application.href + '/configuration')
  return app.datasets
}, null, {
  onError: function (e) {
    messageType.value = 'error'
    messageContent.value = e.status + ' - ' + e.data
    messageDisplay.value = true
  }
})

const captureUrl = computed(() => {
  if (props.element.type !== 'application') return null
  const meta = props.element.application.baseApp.meta
  const params = {
    width: meta['df:capture-width'] || 1280,
    height: meta['df:capture-height'] || 720,
    app_embed: true
  }
  for (const [key, value] of Object.entries(props.filtersValues)) {
    params['app_' + key] = value
  }
  return `${props.element.application.href}/capture?${new URLSearchParams(params).toString()}`
})

const embedCode = () => {
  try {
    navigator.clipboard.writeText(`<iframe src="${`${application.exposedUrl.split('data-fair')[0]}data-fair/app/${accessKey.value ? (accessKey.value + '%3A') : ''}${props.element.application.id}`}?embed=true" width="100%" height="500px" style="background-color: transparent; border: none;"></iframe>`)
    messageType.value = 'info'
    messageContent.value = 'Le code d\'intégration a été mis dans votre presse-papier'
  } catch (err) {
    messageType.value = 'success'
    messageContent.value = err
  }
  messageDisplay.value = true
}

</script>

<template>
  <v-alert
    v-if="requiredFilter.length"
    type="info"
    variant="outlined"
  >
    <h4>Veuillez sélectionner une valeur de {{ requiredFilter.map(f => fields[f].label || fields[f].title || fields[f]['x-originalName'] || f).join(', ') }}</h4>
  </v-alert>
  <d-frame
    v-else-if="element.type === 'tablePreview'"
    :adapter="dFrameAdapter"
    :src="`/data-fair/embed/dataset/${accessKey ? (accessKey + '%3A') : ''}${(element.dataset || config.datasets[0]).id}/table?${searchParams.toString()}`"
    :iframe-title="(element.dataset || config.datasets[0]).title"
    :style="`height:${height>0 ? (height - (actionsHeight || 0))+'px' : '100%'}`"
  />
  <d-frame
    v-else-if="element.type === 'form'"
    :adapter="dFrameAdapter"
    :src="`/data-fair/embed/dataset/${accessKey ? (accessKey + '%3A') : ''}${element.dataset.id}/form?${searchParams.toString()}`"
    :iframe-title="(element.dataset || config.datasets[0]).title"
    :style="`height:${height>0 ? (height - (actionsHeight || 0))+'px' : '100%'}`"
  />
  <div
    v-else
    :style="`overflow-y:auto;height:${height>0 ? height+'px' : '100%'}`"
  >
    <v-row
      v-if="element.type === 'application'"
      align="center"
      class="ma-0"
    >
      <v-col
        v-if="element.description === 'left'"
        :cols="6"
      >
        <div v-html="description" />
      </v-col>
      <v-col
        class="pa-0"
        :cols="!element.description || element.description === 'none' ? 12 : 6"
      >
        <d-frame
          :adapter="dFrameAdapter"
          :src="`/data-fair/app/${accessKey ? (accessKey + '%3A') : ''}${element.application.id}?${searchParams.toString()}`"
          :iframe-title="element.application.title"
          :style="element.application.baseApp.meta['df:overflow'] !== 'true' ? `height:${height>0 ? (height - (actionsHeight || 0))+'px' : '100%'}` : ''"
        />
      </v-col>
      <v-col
        v-if="element.description === 'right'"
        :cols="6"
      >
        <div v-html="description" />
      </v-col>
    </v-row>
    <div
      v-else-if="element.type === 'text'"
      style="white-space: pre-wrap"
      class="mt-4"
    >
      {{ element.content }}
    </div>
  </div>
  <v-card-actions
    v-if="(config.showSources && sources?.length) || (element.type === 'application' && (config.showEmbed || config.showCapture))"
    ref="actions"
  >
    <template v-if="config.showEmbed && element.type === 'application'">
      <v-spacer />
      <v-btn
        size="small"
        color="primary"
        @click="embedCode"
      >
        <v-icon
          :icon="mdiCodeTags"
        />&nbsp;Intégrer
      </v-btn>
    </template>
    <template v-if="config.showCapture && element.type === 'application'">
      <v-spacer />
      <v-btn
        size="small"
        color="primary"
        :href="captureUrl"
      >
        <v-icon
          :icon="mdiCamera"
        />&nbsp;Télécharger
      </v-btn>
    </template>
    <v-spacer />
    <template v-if="config.showSources && sources?.length">
      Source{{ sources.length > 1 ? 's' : '' }}&nbsp;:&nbsp;

      <template
        v-for="source in sources"
        :key="source.id"
      >
        <a
          :href="`/datasets/${source.slug || source.id}`"
          target="_blank"
        >{{ source.title }}</a>&nbsp;
      </template>
      <v-spacer />
    </template>
  </v-card-actions>
</template>
