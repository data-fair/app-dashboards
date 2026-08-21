<script setup lang="ts">
/**
 * Wraps the `<d-frame>` tag with the sizing policy used by dashboard elements.
 * The iframe adapts to the available height (row height minus actions bar)
 * in fixed rows; in auto rows it is sized by the embedded application itself
 * (df:overflow height report) or falls back on the d-frame aspect ratio.
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
  if (props.height && props.height > 0) {
    const available = props.height - (props.actionsHeight || 0)
    return `height:${available > 0 ? available + 'px' : '100%'}`
  }
  return ''
})

// En hauteur automatique, l'iframe se dimensionne par elle-même : hauteur
// remontée par l'application embarquée (df:overflow / data-iframe-height),
// sinon repli sur le ratio d'aspect par défaut du <d-frame> (1, 4/3, 16/9
// ou 21/9 selon la largeur). Le `height:100%` y est interdit : il se résout
// contre une ligne flex sans hauteur définie et casse la mise en page.
const aspectRatio = computed(() => {
  if (allowOverflow.value) return undefined
  if (props.height && props.height > 0) return undefined
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
