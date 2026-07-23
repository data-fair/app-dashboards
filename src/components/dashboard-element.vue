<script setup lang="ts">
/**
 * Renders a single dashboard element (table preview, form, application, text)
 * as a `<d-frame>` embed or as plain text. The element's URL is computed by
 * `useElementUrls` which encapsulates the d-frame src, capture URL, sources
 * URL and description URL.
 */
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useConfig } from '@/composables/config'
import { useElementUrls } from '@/composables/useElementUrls'
import {
  isApplicationElement,
  isTablePreviewElement as _isTablePreview,
  isFormElement as _isForm,
  isTextElement,
  type DashboardDescriptionPosition
  , DashboardElement, DashboardDataset, ApplicationElement
} from '@/config'
import ElementDFrame from './element-dframe.vue'
import ElementActions from './element-actions.vue'
import ElementDescription from './element-description.vue'

const props = defineProps<{
  element: DashboardElement
  height?: number
  filtersValues: Record<string, any> | null
  applicationFiltersValues: Record<string, any> | null
  prefix?: string
  instanceKey?: string
}>()

const { fields, dataset } = useConfig()

const fallbackDataset = computed<DashboardDataset | undefined>(() => dataset.value as DashboardDataset | undefined)

const { dFrameSrc, sourcesList, captureHref } = useElementUrls({
  element: computed(() => props.element),
  datasetFiltersValues: computed(() => props.filtersValues),
  applicationFiltersValues: computed(() => props.applicationFiltersValues),
  fallbackDataset,
  prefix: props.prefix || ''
})

const actionsRef = ref<HTMLElement | null>(null)
const { height: actionsHeight } = useElementSize(actionsRef)

const isTable = computed(() => _isTablePreview(props.element))
const isForm = computed(() => _isForm(props.element))
const isApp = computed(() => isApplicationElement(props.element))
const appElement = computed<ApplicationElement | null>(() => isApplicationElement(props.element) ? props.element : null)

const descriptionPos = computed<DashboardDescriptionPosition>(() => appElement.value?.description ?? 'none')
const isHorizontal = computed(() => descriptionPos.value === 'left' || descriptionPos.value === 'right')
const isVertical = computed(() => descriptionPos.value === 'top' || descriptionPos.value === 'bottom')

const requiredFilter = computed(() => {
  if (!isTable.value && !isApp.value) return []
  const el = props.element as { valueMandatory?: boolean; mandatoryFilters?: string[] }
  return ((el.valueMandatory && el.mandatoryFilters) || [])
    .filter((f: string) => !props.filtersValues?.keys?.includes(f))
})

const iframeTitle = computed(() => {
  const el = props.element
  if (el.type === 'application') return el.application?.title || ''
  const ds = el.type === 'tablePreview'
    ? (el.dataset || fallbackDataset.value)
    : el.type === 'form' ? el.dataset : null
  return ds?.title || ''
})

const missingFilterLabels = computed(() => requiredFilter.value
  .map((f: string) => {
    const field = fields.value[f]
    return field?.label || field?.title || (field as { 'x-originalName'?: string })?.['x-originalName'] || f
  })
  .join(', '))

const hasFilterIssue = computed(() => requiredFilter.value.length > 0)
</script>

<template>
  <div
    v-if="hasFilterIssue"
    class="d-flex flex-column align-center justify-center text-center pa-6 my-4 mx-auto"
    style="max-width:480px;background-color:#FAFAFA;border:1px solid #E0E0E0;border-radius:8px;"
  >
    <v-icon
      icon="mdi-filter-variant"
      size="40"
      class="mb-3 text-medium-emphasis"
    />
    <div class="text-subtitle-1 font-weight-medium mb-1">
      Filtre requis
    </div>
    <div class="text-body-2 text-medium-emphasis">
      Veuillez sélectionner une valeur{{ requiredFilter.length > 1 ? 's' : '' }}
      de <strong>{{ missingFilterLabels }}</strong> pour afficher cet élément.
    </div>
  </div>

  <template v-else-if="isTable">
    <element-d-frame
      v-if="dFrameSrc"
      :key="`table-${instanceKey}`"
      :element="element"
      :src="dFrameSrc"
      :iframe-title="iframeTitle"
      :height="height"
      :actions-height="actionsHeight"
    />
  </template>

  <template v-else-if="isForm">
    <element-d-frame
      v-if="dFrameSrc"
      :key="`form-${instanceKey}`"
      :element="element"
      :src="dFrameSrc"
      :iframe-title="iframeTitle"
      :height="height"
      :actions-height="actionsHeight"
    />
  </template>

  <div
    v-else
    :style="`overflow-y:auto;height:${height && height > 0 ? height + 'px' : '100%'}`"
  >
    <v-row
      v-if="isApp && isHorizontal"
      align="center"
      class="ma-0"
    >
      <v-col
        v-if="descriptionPos === 'left' && appElement"
        :cols="6"
      >
        <element-description
          :element="appElement"
          :filters-values="applicationFiltersValues"
          :application-filters-values="applicationFiltersValues"
        />
      </v-col>
      <v-col
        class="pa-0"
        :cols="6"
      >
        <element-d-frame
          v-if="dFrameSrc"
          :key="`app-${instanceKey}`"
          :element="element"
          :src="dFrameSrc"
          :iframe-title="iframeTitle"
          :height="height"
          :actions-height="actionsHeight"
        />
      </v-col>
      <v-col
        v-if="descriptionPos === 'right' && appElement"
        :cols="6"
      >
        <element-description
          :element="appElement"
          :filters-values="applicationFiltersValues"
          :application-filters-values="applicationFiltersValues"
        />
      </v-col>
    </v-row>
    <div
      v-else-if="isApp && isVertical"
      class="d-flex flex-column"
      style="width:100%;height:100%"
    >
      <element-description
        v-if="descriptionPos === 'top' && appElement"
        :element="appElement"
        :filters-values="applicationFiltersValues"
        :application-filters-values="applicationFiltersValues"
        class="mb-2"
        style="flex:0 0 auto;max-height:50%;overflow-y:auto"
      />
      <element-d-frame
        v-if="dFrameSrc"
        :key="`app-${instanceKey}`"
        :element="element"
        :src="dFrameSrc"
        :iframe-title="iframeTitle"
        :height="height"
        :actions-height="actionsHeight"
        style="flex:1 1 0;min-height:0"
      />
      <element-description
        v-if="descriptionPos === 'bottom' && appElement"
        :element="appElement"
        :filters-values="applicationFiltersValues"
        :application-filters-values="applicationFiltersValues"
        class="mt-2"
        style="flex:0 0 auto;max-height:50%;overflow-y:auto"
      />
    </div>
    <element-d-frame
      v-else-if="isApp && dFrameSrc"
      :key="`app-${instanceKey}`"
      :element="element"
      :src="dFrameSrc"
      :iframe-title="iframeTitle"
      :height="height"
      :actions-height="actionsHeight"
    />
    <div
      v-else-if="isTextElement(element)"
      style="white-space: pre-wrap"
      class="mt-4"
    >
      {{ element.content }}
    </div>
  </div>

  <div
    v-if="!hasFilterIssue"
    ref="actionsRef"
  >
    <element-actions
      :element="element"
      :sources="sourcesList"
      :capture-href="captureHref"
    />
  </div>
</template>
