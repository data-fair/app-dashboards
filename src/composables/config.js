import { inject, ref, computed } from 'vue'
import createDFrameAdapter from '@data-fair/frame/lib/vue-reactive/state-change-adapter.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'

const dFrameAdapter = createDFrameAdapter(reactiveSearchParams)

export function createConfig () {
  const config = ref(window.APPLICATION?.configuration)
  if (reactiveSearchParams.draft === 'true') {
    window.addEventListener('message', msg => {
      if (msg.data.type === 'set-config') {
        config.value = msg.data.content
      }
    })
  }

  const last = window.APPLICATION?.exposedUrl?.split('/').pop()
  const toks = last?.split('%3A')
  const accessKey = (toks?.length === 2) ? toks[0] : null

  const error = computed(() => {
    if (!config.value) return 'Il n\'y a pas de configuration définie'
    if (!config.value.datasets?.length) return 'Veuillez choisir une source de données pour le filtre commun'
    if (!config.value.datasets?.[0]?.schema) return 'La source de données n\'a pas de schéma'
    return null
  })
  return {
    install (app) {
      const rConfig = {
        application: window.APPLICATION,
        config,
        filters: computed(() => config.value?.filters),
        dataset: computed(() => config.value?.datasets?.[0]),
        sections: computed(() => config.value?.sections),
        fields: computed(() => config.value?.datasets?.[0]?.schema.reduce((a, b) => { a[b.key] = b; return a }, {})),
        accessKey,
        dFrameAdapter,
        error
      }
      app.provide('data-fair-app-config', rConfig)
    }
  }
}

export function useConfig () {
  const config = inject('data-fair-app-config')
  if (!config) throw new Error('useConfig requires using the plugin createConfig')
  return config
}

export default useConfig
