<script setup lang="ts">
import { computed, ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useFetch } from '@data-fair/lib-vue/fetch.js'
import { useElementSize } from '@vueuse/core'
import { mdiCodeTags, mdiCamera } from '@mdi/js'
import { useConfig } from '@/composables/config'
import { useUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import type { DashboardElement } from '@/config'

const props = defineProps<{
  element: DashboardElement
  height?: number
  filtersValues: Record<string, any> | null
}>()

const { application, config, fields, accessKey, dFrameAdapter } = useConfig()
const { sendUiNotif } = useUiNotif()

const requiredFilter = computed(() => {
  return ((props.element.valueMandatory && props.element.mandatoryFilters) || [])
    .filter((f: string) => !props.filtersValues?.keys?.includes(f))
})

const actionsRef = ref<HTMLElement | null>(null)
const actionsHeight = useElementSize(actionsRef).height

const searchParams = computed(() => {
  const params: Record<string, any> = {
    ...(props.element.ignoreFilters ? {} : props.filtersValues),
    'd-frame': true
  }
  if (reactiveSearchParams.primary) params.primary = reactiveSearchParams.primary
  if (reactiveSearchParams.secondary) params.secondary = reactiveSearchParams.secondary
  if (props.element.type === 'tablePreview') {
    if (props.element.display !== 'auto') params.display = props.element.display
    params.interaction = !props.element.noInteractions
    if (props.element.fields?.length) params.cols = props.element.fields.join(',')
  }
  if (reactiveSearchParams.print === 'true') {
    params.interaction = false
  }
  return new URLSearchParams(params)
})

const applicationUrl = computed(() => {
  if (props.element.type !== 'application' || !props.element.application) return undefined
  return `${application.href.split('/data-fair/')[0]}/data-fair/${props.element.application.href.split('/data-fair/').pop()}`
})

const descriptionUrl = computed(() => {
  if (props.element.type !== 'application' || !props.element.description || props.element.description === 'none') return undefined
  return applicationUrl.value
})

const { data: appData } = useFetch(() => descriptionUrl.value ? `${descriptionUrl.value}?html=true` : null, { immediate: true })
const description = computed(() => (appData.value as any)?.description || null)

const sourcesUrl = computed(() => {
  if (!config.value.showSources) return undefined
  if (props.element.type === 'tablePreview') return undefined
  if (props.element.type !== 'application') return undefined
  return `${applicationUrl.value}/configuration`
})

const { data: sourcesData } = useFetch(() => sourcesUrl.value, { immediate: true })
const sources = computed(() => {
  if (props.element.type === 'tablePreview') return [props.element.dataset || config.value.datasets?.[0]]
  return (sourcesData.value as any)?.datasets || []
})

const captureUrl = computed(() => {
  if (props.element.type !== 'application' || !props.element.application) return undefined
  const meta = props.element.application.baseApp.meta as Record<string, any>
  const params: Record<string, any> = {
    width: meta?.['df:capture-width'] || 1280,
    height: meta?.['df:capture-height'] || 720,
    app_embed: true
  }
  for (const [key, value] of Object.entries(props.filtersValues || {})) {
    params['app_' + key] = value
  }
  return `${applicationUrl.value}/capture?${new URLSearchParams(params).toString()}`
})

const embedCode = async () => {
  try {
    const key = accessKey.value ? (accessKey.value + '%3A') : ''
    const url = `${application.exposedUrl.split('data-fair')[0]}data-fair/app/${key}${props.element.application?.id}?embed=true`
    await navigator.clipboard.writeText(`<iframe src="${url}" width="100%" height="500px" style="background-color: transparent; border: none;"></iframe>`)
    sendUiNotif({ msg: 'Le code d\'intégration a été mis dans votre presse-papier', type: 'info' })
  } catch (err: any) {
    sendUiNotif({ msg: err.message || err, type: 'error' })
  }
}
</script>

<template>
  <v-alert
    v-if="requiredFilter.length"
    type="info"
    variant="outlined"
  >
    <h4>Veuillez sélectionner une valeur de {{ requiredFilter.map((f: string) => fields[f]?.label || fields[f]?.title || fields[f]?.['x-originalName'] || f).join(', ') }}</h4>
  </v-alert>
  <d-frame
    v-else-if="element.type === 'tablePreview'"
    :adapter="dFrameAdapter"
    :src="`/data-fair/embed/dataset/${accessKey ? (accessKey + '%3A') : ''}${(element.dataset || (config.datasets || [])[0]).id}/table?${searchParams.toString()}`"
    :iframe-title="(element.dataset || (config.datasets || [])[0]).title"
    :style="`height:${height && height > 0 ? (height - (actionsHeight || 0)) + 'px' : '100%'}`"
  />
  <d-frame
    v-else-if="element.type === 'form'"
    :adapter="dFrameAdapter"
    :src="`/data-fair/embed/dataset/${accessKey ? (accessKey + '%3A') : ''}${element.dataset?.id}/form?${searchParams.toString()}`"
    :iframe-title="(element.dataset || (config.datasets || [])[0])?.title"
    :style="`height:${height && height > 0 ? (height - (actionsHeight || 0)) + 'px' : '100%'}`"
  />
  <div
    v-else
    :style="`overflow-y:auto;height:${height && height > 0 ? height + 'px' : '100%'}`"
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
          :src="`/data-fair/app/${accessKey ? (accessKey + '%3A') : ''}${element.application?.id}?${searchParams.toString()}`"
          :iframe-title="element.application?.title"
          :style="element.application?.baseApp.meta && element.application.baseApp.meta['df:overflow'] !== 'true' ? `height:${height && height > 0 ? (height - (actionsHeight || 0)) + 'px' : '100%'}` : ''"
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
    ref="actionsRef"
  >
    <template v-if="config.showEmbed && element.type === 'application'">
      <v-spacer />
      <v-btn
        size="small"
        color="primary"
        @click="embedCode"
      >
        <v-icon :icon="mdiCodeTags" />&nbsp;Intégrer
      </v-btn>
    </template>
    <template v-if="config.showCapture && element.type === 'application'">
      <v-spacer />
      <v-btn
        size="small"
        color="primary"
        :href="captureUrl"
      >
        <v-icon :icon="mdiCamera" />&nbsp;Télécharger
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
