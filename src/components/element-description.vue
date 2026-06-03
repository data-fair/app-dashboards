<script setup lang="ts">
/**
 * Loads and renders the HTML description of an application element.
 * Description position (left/right) is controlled by the parent.
 */
import { computed } from 'vue'
import { useElementUrls } from '@/composables/useElementUrls'
import type { DashboardElement } from '@/config'

const props = defineProps<{
  element: DashboardElement
  filtersValues: Record<string, any> | null
}>()

const { descriptionHtml } = useElementUrls({
  element: computed(() => props.element),
  filtersValues: computed(() => props.filtersValues)
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-html="descriptionHtml" />
</template>
