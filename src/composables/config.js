import { inject } from 'vue'

import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import createDFrameAdapter from '@data-fair/frame/lib/vue-reactive/state-change-adapter.js'

export function createConfig () {
  const application = window.APPLICATION
  const config = application.configuration
  if (!config) throw new Error('Il n\'y a pas de configuration définie')
  const dataset = config.datasets?.[0]
  if (!dataset) throw new Error('Veuillez choisir un source de données pour le filtre commun')
  const schema = dataset.schema
  if (!schema) throw new Error('La source de données n\'a pas de schéma')
  const fields = schema.reduce((a, b) => { a[b.key] = b; return a }, {})

  const last = application.exposedUrl.split('/').pop()
  const toks = last.split('%3A')
  const accessKey = (toks.length === 2) ? toks[0] : null

  const dFrameAdapter = createDFrameAdapter(reactiveSearchParams)

  return {
    install (app) {
      app.provide('data-fair-app-config', {
        application,
        config,
        dataset,
        fields,
        accessKey,
        dFrameAdapter
      })
    }
  }
}

export function useConfig () {
  const config = inject('data-fair-app-config')
  if (!config) throw new Error('useConfig requires using the plugin createConfig')
  return config
}

export default useConfig
