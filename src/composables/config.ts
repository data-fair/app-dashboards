import { computed, inject, ref, type App, type Ref } from 'vue'
import type { Application, Field } from '@data-fair/lib-common-types/application/index.js'
import createDFrameAdapter from '@data-fair/frame/lib/vue-reactive/state-change-adapter.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
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
  const last = window.APPLICATION?.exposedUrl?.split('/').pop()
  const toks = last?.split('%3A')
  const accessKey = ref<string | null>((toks?.length === 2) ? toks[0] : null)

  const dFrameAdapter = createDFrameAdapter(reactiveSearchParams)

  const error = computed<string | null>(() => {
    if (!config.value) return 'Il n\'y a pas de configuration définie'
    if (!config.value.datasets?.length) return 'Veuillez choisir une source de données pour le filtre commun'
    if (!config.value.datasets?.[0]?.schema) return 'La source de données n\'a pas de schéma'
    return null
  })

  function setConfig (newConfig: DashboardConfig) {
    config.value = newConfig
  }

  function setByPath (obj: Record<string, unknown>, path: string, value: unknown) {
    const keys = path.split('.')
    let current: Record<string, unknown> = obj
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {}
      } else {
        current[key] = Array.isArray(current[key]) ? [...current[key]] : { ...current[key] }
      }
      current = current[key] as Record<string, unknown>
    }
    current[keys[keys.length - 1]] = value
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

      window.addEventListener('message', (event) => {
        if (event.data?.type === 'set-config' && event.data?.content) {
          const { content } = event.data
          if (content.configuration) {
            config.value = content.configuration
          } else if (content.chart || content.datasets || content.layers || content.metrics) {
            config.value = content
          } else if (content.field && 'value' in content) {
            const newConfig = JSON.parse(JSON.stringify(config.value))
            setByPath(newConfig, content.field, content.value)
            config.value = newConfig
          }
        }
      })
    }
  }
}

export function useConfig (): ConfigState {
  const config = inject<ConfigState>('data-fair-app-config')
  if (!config) throw new Error('useConfig requires using the plugin createConfig')
  return config
}

export default useConfig
