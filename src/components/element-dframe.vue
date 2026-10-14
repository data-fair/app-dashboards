<script setup lang="ts">
/**
 * Wraps the `<d-frame>` tag with the sizing policy used by dashboard elements.
 * The iframe adapts to the available height (row height minus actions bar)
 * in fixed rows; in auto rows it is sized by the embedded application itself
 * (df:overflow height report) or falls back on the d-frame aspect ratio.
 */
import { computed } from 'vue'
import { useConfig } from '@/composables/config'
import type { DashboardElement } from '@/config'

const props = defineProps<{
  element: DashboardElement
  src: string
  iframeTitle: string
  height: number | undefined
  actionsHeight: number | undefined
  /**
   * Canal privé de l'élément : tout ce que le visu écrit dans son URL remonte
   * namespacé dans l'URL du dashboard (`<scope>_<clé>`), et lui est renvoyé
   * dé-namespacé. Le dashboard reprojette ensuite les clés utiles vers le
   * namespace propre `_c_*` / `_s_*` / `_d_*` (cf. useEmissionsProjection).
   */
  scope?: string
}>()

const { dFrameAdapter } = useConfig()

// `*:<scope>_` est le seul pattern sûr ici : il n'injecte dans l'enfant que ses
// propres clés et ne supprime, dans l'URL du dashboard, que les siennes. Les
// patterns partagés (`_c*`…) casseraient ignoreFilters et la purge des clés
// absentes de l'enfant (cf. @data-fair/frame utils/sync-params).
const syncParams = computed(() => props.scope ? `*:${props.scope}_` : undefined)

// Note : La fuite de watchers côté @data-fair/frame a été corrigée dans 0.18.7
// (unregister de onStateChange lors du disconnectedCallback). Les clés stables
// (utils/layout.ts → elementKey) évitent également les recréations inutiles.

const availableHeight = computed(() => {
  if (props.height && props.height > 0) {
    const available = props.height - (props.actionsHeight || 0)
    return available > 0 ? available : props.height
  }
  return undefined
})

const containerStyle = computed(() => {
  if (availableHeight.value) {
    return `height:${availableHeight.value}px`
  }
  return ''
})

// En hauteur automatique, l'iframe se dimensionne par elle-même si elle remonte
// sa hauteur (df:overflow / data-iframe-height), sinon repli sur le ratio d'aspect
// par défaut du <d-frame> (1, 4/3, 16/9 ou 21/9 selon la largeur).
// En hauteur fixe, l'aspect ratio est désactivé pour laisser la hauteur explicite s'appliquer.
const aspectRatio = computed(() => {
  if (availableHeight.value) return undefined
  return ''
})
</script>

<template>
  <d-frame
    :adapter="dFrameAdapter"
    :src="src"
    :sync-params="syncParams"
    :iframe-title="iframeTitle"
    :aspect-ratio="aspectRatio"
    :style="containerStyle"
  />
</template>
