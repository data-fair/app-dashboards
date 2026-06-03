<script setup lang="ts">
/**
 * Renders the actions bar below an element: sources list, embed code button,
 * and capture download button. Visibility is controlled by config flags and
 * the element type.
 */
import { computed } from 'vue'
import { mdiCodeTags, mdiCamera } from '@mdi/js'
import { useConfig } from '@/composables/config'
import { useEmbedCode } from '@/composables/useEmbedCode'
import { isApplicationElement } from '@/config'
import type { DashboardElement } from '@/config'

const props = defineProps<{
  element: DashboardElement
  sources: { id: string; title: string; slug?: string; href?: string }[]
  height: number | undefined
}>()

const { config } = useConfig()
const { copyToClipboard } = useEmbedCode(computed(() => props.element))

const isApp = computed(() => isApplicationElement(props.element))
const showSources = computed(() => Boolean(config.value.showSources && props.sources.length))
const showEmbed = computed(() => Boolean(config.value.showEmbed && isApp.value))
const showCapture = computed(() => Boolean(config.value.showCapture && isApp.value))
</script>

<template>
  <v-card-actions
    v-if="showSources || showEmbed || showCapture"
    :style="`min-height:48px;height:${height}px`"
  >
    <template v-if="showEmbed">
      <v-spacer />
      <v-btn
        size="small"
        color="primary"
        @click="copyToClipboard"
      >
        <v-icon :icon="mdiCodeTags" />&nbsp;Intégrer
      </v-btn>
    </template>
    <template v-if="showCapture && element.type === 'application' && element.application">
      <v-spacer />
      <v-btn
        size="small"
        color="primary"
        :href="`${element.application.href}/capture?app_embed=true`"
        target="_blank"
      >
        <v-icon :icon="mdiCamera" />&nbsp;Télécharger
      </v-btn>
    </template>
    <v-spacer />
    <template v-if="showSources">
      <span>Source{{ sources.length > 1 ? 's' : '' }}&nbsp;:&nbsp;</span>
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
