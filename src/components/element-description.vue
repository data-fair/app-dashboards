<script setup lang="ts">
/**
 * Renders the HTML description of an application element.
 *
 * The description is fetched once by `dashboard-element.vue` (which owns the
 * single `useElementUrls` instance) and passed down as a prop, so the fetch
 * is not duplicated per element. Description position (left/right) is
 * controlled by the parent.
 */
defineProps<{
  html: string | null
}>()
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-html="html" />
</template>
