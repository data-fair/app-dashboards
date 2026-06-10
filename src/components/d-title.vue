<script setup lang="ts">
/**
 * Reusable heading component that mirrors data-fair-portals'
 * layout-title.vue: configurable tag, size, color, alignment, boldness
 * and decorative line (none / left / bottom-small / bottom-medium /
 * bottom-large). All visual properties come from a `style` prop shaped
 * like `TitleStyle`; missing fields fall back to `defaults`.
 */
import { computed } from 'vue'
import type { TitleColor, TitleLinePosition, TitleSize, TitleStyle, TitleTag } from '@/config'

const props = withDefaults(defineProps<{
  text?: string
  style?: TitleStyle
  icon?: { svgPath: string } | null
  defaults?: Partial<{
    tag: TitleTag
    size: TitleSize
    center: boolean
    bold: boolean
    color: TitleColor
    linePosition: TitleLinePosition
    lineColor: TitleColor
  }>
}>(), {
  text: '',
  style: () => ({}),
  icon: null,
  defaults: () => ({})
})

const resolvedTag = computed<TitleTag>(() => props.style?.tag ?? props.defaults.tag ?? 'h2')
const resolvedSize = computed<TitleSize>(() => props.style?.size ?? props.defaults.size ?? 'h4')
const resolvedCenter = computed<boolean>(() => props.style?.center ?? props.defaults.center ?? false)
const resolvedBold = computed<boolean>(() => props.style?.bold ?? props.defaults.bold ?? false)
const resolvedColor = computed<TitleColor | undefined>(() => props.style?.color ?? props.defaults.color)
const resolvedLinePosition = computed(() => props.style?.line?.position ?? props.defaults.linePosition ?? 'none')
const resolvedLineColor = computed<TitleColor>(() => props.style?.line?.color ?? props.defaults.lineColor ?? 'primary')
</script>

<template>
  <component
    :is="resolvedTag"
    :class="[
      'd-title d-flex align-center',
      resolvedCenter ? 'justify-center' : undefined,
      resolvedBold ? 'font-weight-bold' : undefined,
      `text-${resolvedSize}`
    ]"
  >
    <span
      v-if="resolvedLinePosition === 'left'"
      class="d-block align-self-stretch mr-4"
      :style="{ borderLeft: `4px solid rgb(var(--v-theme-${resolvedLineColor}))` }"
      aria-hidden="true"
    />
    <v-icon
      v-if="icon?.svgPath"
      :icon="icon.svgPath"
      size="small"
      class="mr-2"
    />
    <span
      :class="[
        'd-block d-title__text',
        resolvedColor ? `text-${resolvedColor}` : undefined,
        resolvedCenter ? 'text-center' : undefined
      ]"
    >
      {{ text }}
      <span
        v-if="resolvedLinePosition === 'bottom-small' || resolvedLinePosition === 'bottom-medium'"
        :class="['d-block mt-2 d-title__line', resolvedCenter ? 'mx-auto' : undefined]"
        :style="{
          borderBottom: `4px solid rgb(var(--v-theme-${resolvedLineColor}))`,
          width: resolvedLinePosition === 'bottom-small' ? '80px' : '100%'
        }"
        aria-hidden="true"
      />
    </span>
  </component>
  <v-divider
    v-if="resolvedLinePosition === 'bottom-large'"
    :style="{ borderColor: `rgb(var(--v-theme-${resolvedLineColor}))` }"
    class="border-opacity-100 mt-2"
    thickness="4"
    :length="'100%'"
  />
</template>

<style scoped>
/* Vuetify 3 MD2 text-h1 to text-h6 compatibility classes
   cf https://vuetifyjs.com/en/getting-started/typography-migration/#restoring-md2-typography
   Restored here so titles keep their declared size/weight even when the
   global MD3 cascade trims the class. */
.d-title.text-h1 { font-size: 6rem !important;       font-weight: 300; line-height: 1;     letter-spacing: -.015625em !important;     font-family: var(--d-heading-font-family, 'Nunito'); text-transform: none; }
.d-title.text-h2 { font-size: 3.75rem !important;    font-weight: 300; line-height: 1;     letter-spacing: -.0083333333em !important; font-family: var(--d-heading-font-family, 'Nunito'); text-transform: none; }
.d-title.text-h3 { font-size: 3rem !important;       font-weight: 400; line-height: 1.05;  letter-spacing: normal !important;          font-family: var(--d-heading-font-family, 'Nunito'); text-transform: none; }
.d-title.text-h4 { font-size: 2.125rem !important;   font-weight: 400; line-height: 1.175; letter-spacing: .0073529412em !important;   font-family: var(--d-heading-font-family, 'Nunito'); text-transform: none; }
.d-title.text-h5 { font-size: 1.5rem !important;     font-weight: 400; line-height: 1.333; letter-spacing: normal !important;          font-family: var(--d-heading-font-family, 'Nunito'); text-transform: none; }
.d-title.text-h6 { font-size: 1.25rem !important;    font-weight: 500; line-height: 1.6;   letter-spacing: .0125em !important;         font-family: var(--d-heading-font-family, 'Nunito'); text-transform: none; }
/* Vuetify 4 moved .font-weight-bold into the `vuetify-utilities` cascade @layer and dropped its !important. */
.font-weight-bold { font-weight: 700 !important; }
</style>
