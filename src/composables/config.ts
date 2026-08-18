import { computed, inject, ref, toRaw, type App, type Ref } from 'vue'
import type { Application, Field } from '@data-fair/lib-common-types/application/index.js'
import createDFrameAdapter from '@data-fair/frame/lib/vue-reactive/state-change-adapter.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { parseAccessKey, setByPath, computeConfigError } from '@/utils/config'
import type {
  DashboardConfig,
  DashboardDataset,
  DashboardFilter,
  DashboardSection
} from '@/config'

export interface ConfigState {
  application: Application & { href: string; exposedUrl: string; apiUrl: string; wsUrl: string }
  config: Ref<DashboardConfig>
  setConfig: (newConfig: DashboardConfig) => void
  dataset: Ref<DashboardDataset | undefined>
  datasets: Ref<DashboardDataset[]>
  fields: Ref<Record<string, Field>>
  filters: Ref<DashboardFilter[] | undefined>
  sections: Ref<DashboardSection[] | undefined>
  accessKey: Ref<string | null>
  dFrameAdapter: ReturnType<typeof createDFrameAdapter>
  error: Ref<string | null>
}

export function createConfig () {
  const application = window.APPLICATION as ConfigState['application']
  // The runtime configuration is supplied by DataFair with extra fields
  // (timePeriod, etc.) that aren't modeled in the VJSF schema. We accept the
  // shape as-is and narrow to the dashboard types where it matters.
  const config = ref<DashboardConfig>((application?.configuration || {}) as DashboardConfig)

  // Dataset principal
  const dataset = computed<DashboardDataset | undefined>(() => config.value?.datasets?.[0] as DashboardDataset | undefined)
  const datasets = computed<DashboardDataset[]>(() => (config.value?.datasets || []) as DashboardDataset[])

  const fields = computed<Record<string, Field>>(() => {
    const schema = (dataset.value?.schema || []) as Field[]
    return schema.reduce((acc: Record<string, Field>, field: Field) => {
      if (field.key) acc[field.key] = field
      return acc
    }, {})
  })

  const filters = computed<DashboardFilter[] | undefined>(() => config.value?.filters)
  const sections = computed<DashboardSection[] | undefined>(() => config.value?.sections)

  // AccessKey pour les liens partagés
  const accessKey = ref<string | null>(parseAccessKey(window.APPLICATION?.exposedUrl))

  const dFrameAdapter = createDFrameAdapter(reactiveSearchParams)

  const error = computed<string | null>(() => computeConfigError(config.value))

  function setConfig (newConfig: DashboardConfig) {
    config.value = newConfig
  }

  return {
    install (app: App) {
      const state: ConfigState = {
        application,
        config,
        setConfig,
        dataset,
        datasets,
        fields,
        filters,
        sections,
        accessKey,
        dFrameAdapter,
        error
      }
      app.provide('data-fair-app-config', state)

      // Singleton listener: remove any previous one before adding so a
      // re-install (HMR) does not stack multiple handlers.
      if (messageHandler) window.removeEventListener('message', messageHandler)
      messageHandler = onSetConfigMessage(config)
      window.addEventListener('message', messageHandler)
    }
  }
}

// Top-level config keys recognized as a partial `set-config` payload. The
// merge branch below relies on this to distinguish a config sub-tree from a
// single field update (`{ field, value }`).
const CONFIG_KEYS = [
  'datasets', 'filters', 'staticFilters', 'sections', 'periodFilter',
  'addressFilter', 'title', 'titleStyle', 'sectionsTitleStyle', 'description',
  'allowDuplicate', 'showSources', 'showEmbed', 'showCapture', 'sectionsGroup',
  'applications'
]

let messageHandler: ((event: MessageEvent) => void) | null = null

/**
 * Handle `set-config` postMessage updates from the DataFair preview (draft
 * hot reload). Only messages from the direct parent window are accepted.
 */
const onSetConfigMessage = (
  config: Ref<DashboardConfig>
): ((event: MessageEvent) => void) => {
  return (event) => {
    if (event.source !== window.parent) return
    if (event.data?.type !== 'set-config' || !event.data?.content) return
    const { content } = event.data
    if (content.configuration) {
      // Tolérance défensive : format enveloppé, jamais émis par l'UI actuelle.
      config.value = content.configuration
    } else if (content.field && 'value' in content) {
      // Update par path : { field: 'sections.0.title', value: '...' }
      const newConfig = JSON.parse(JSON.stringify(config.value))
      setByPath(newConfig, content.field, content.value)
      config.value = newConfig
    } else if (CONFIG_KEYS.some(key => key in content)) {
      // L'UI DataFair envoie le modèle de configuration complet
      // (`editConfig` dans application-config.vue) ; VJSF omet simplement les
      // clés vidées (ex. `filters` après suppression du dernier filtre,
      // `title`/`description` vidés). Fusionner puis retirer les clés absentes
      // pour que les suppressions en draft s'appliquent au lieu de rester
      // figées dans l'aperçu.
      const newConfig = { ...toRaw(config.value), ...content }
      for (const key of CONFIG_KEYS) {
        if (!(key in content)) delete newConfig[key]
      }
      config.value = newConfig
    }
  }
}

export function useConfig (): ConfigState {
  const config = inject<ConfigState>('data-fair-app-config')
  if (!config) throw new Error('useConfig requires using the plugin createConfig')
  return config
}

export default useConfig
