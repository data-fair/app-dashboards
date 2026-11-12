<script setup lang="ts">
/**
 * Wraps the `<d-frame>` tag with the sizing policy used by dashboard elements.
 * The iframe adapts to the available height (row height minus actions bar)
 * in fixed rows; in auto rows it is sized by the embedded application itself
 * (df:overflow height report) or falls back on the d-frame aspect ratio.
 */
import type { DashboardElement } from '@/config'
import { computed } from 'vue'
import { useConfig } from '@/composables/config'

const props = defineProps<{
  element: DashboardElement
  src: string
  iframeTitle: string
  height: number | undefined
  actionsHeight: number | undefined
  /**
   * Private channel of the element: everything the visu writes in its URL goes
   * up namespaced into the dashboard URL (`<scope>_<key>`), and is sent back to
   * it de-namespaced. The dashboard then projects the `_c*`/`_d*` keys of the
   * elements in `shared-filters` mode into the clean namespace
   * (see useEmissionsProjection).
   */
  scope?: string
}>()

const { dFrameAdapter } = useConfig()

// `*:<scope>_` is the only safe pattern here: it injects into the child only its
// own keys and only removes its own from the dashboard URL. Shared
// patterns (`_c*`…) would break the column separation of the compare
// view (see @data-fair/frame utils/sync-params). An element in `none` mode
// has no channel: its state is not kept.
const syncParams = computed(() => {
  if (!props.scope) return undefined
  if ('syncParams' in props.element && props.element.syncParams === 'none') return undefined
  return `*:${props.scope}_`
})

// Note: the watcher leak in @data-fair/frame was fixed in 0.18.7
// (onStateChange unregistered in disconnectedCallback). Stable keys
// (utils/layout.ts → elementKey) also avoid needless re-creations.

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

// With automatic height, the iframe sizes itself if it reports its height
// (df:overflow / data-iframe-height), otherwise falls back on the default aspect
// ratio of the <d-frame> (1, 4/3, 16/9 or 21/9 depending on the width).
// With fixed height, the aspect ratio is disabled so the explicit height applies.
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
