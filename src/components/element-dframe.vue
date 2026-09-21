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
}>()

const { dFrameAdapter } = useConfig()

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
    :iframe-title="iframeTitle"
    :aspect-ratio="aspectRatio"
    :style="containerStyle"
  />
</template>
