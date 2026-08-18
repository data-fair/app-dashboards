<script setup lang="ts">
/**
 * Wraps the `<d-frame>` tag with the sizing policy used by dashboard elements.
 * The iframe adapts to the available height (row height minus actions bar)
 * unless the embedded application declares `df:overflow=true` in its meta.
 */
import { computed } from 'vue'
import { useConfig } from '@/composables/config'
import { isApplicationElement } from '@/config'
import type { DashboardElement } from '@/config'

const props = defineProps<{
  element: DashboardElement
  src: string
  iframeTitle: string
  height: number | undefined
  actionsHeight: number | undefined
}>()

const { dFrameAdapter } = useConfig()

// ⚠️ Fuite de watchers connue (côté lib @data-fair/frame) :
// `connectedCallback` de DFrameElement crée un `watch(reactiveParams, ...)`
// via l'adapter partagé, et `disconnectedCallback` ne le stoppe jamais. Chaque
// destruction/re-création d'un <d-frame> (édition config draft, toggle du mode
// compare) accumule donc un watcher permanent sur reactiveSearchParams.
// Impact : perf mineure (updateSrc sur des éléments détachés), pas de bug de
// correction. Le correctif est à faire en amont dans @data-fair/frame
// (retourner le stop handle de `watch`/`afterEach`/`popstate` et l'appeler
// dans disconnectedCallback). Côté app, les clés stables des éléments
// (utils/layout.ts → elementKey) limitent les recréations inutiles.

const allowOverflow = computed(() => {
  if (!isApplicationElement(props.element)) return false
  const meta = props.element.application?.baseApp?.meta as Record<string, unknown> | undefined
  return meta?.['df:overflow'] === 'true'
})

const containerStyle = computed(() => {
  if (allowOverflow.value) return ''
  const available = (props.height && props.height > 0) ? props.height - (props.actionsHeight || 0) : 0
  return `height:${available > 0 ? available + 'px' : '100%'}`
})
</script>

<template>
  <d-frame
    :adapter="dFrameAdapter"
    :src="src"
    :iframe-title="iframeTitle"
    :style="containerStyle"
  />
</template>
