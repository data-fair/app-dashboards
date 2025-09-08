<script setup>
import { watch } from 'vue'
import dashboard from './components/dashboard.vue'
import SnackBar from './components/snack-bar.vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useConfig } from '@/composables/config'
import { ofetch } from 'ofetch'

const { config, error } = useConfig()

if (reactiveSearchParams.draft === 'true' && window.parent) {
  watch(error, (message) => {
    if (message) ofetch(window.APPLICATION.href + '/error', { body: { message }, method: 'POST' })
  }, { immediate: true })

  watch(config, () => {
    const elements = [].concat(...(config.value.sections || []).map(s => [].concat(...s.rows.map(r => [].concat(...r.elements.map(e => e.elements || e))))))
    const applications = elements.filter(e => e.type === 'application' && e.application).map(e => ({ id: e.application.id, title: e.application.title })).filter((a1, i, s) => s.findIndex(a2 => a1.id === a2.id) === i)
    if ((config.value.applications || []).map(a => a.id).join('-') !== applications.map(a => a.id).join('-')) window.parent.postMessage({ type: 'set-config', content: { field: 'applications', value: applications } }, '*')
    if (config.value.datasets && config.value.datasets.length) {
      const filtersDataset = config.value.datasets[0]
      const datasets = elements.filter(e => ['tablePreview', 'form'].includes(e.type) && e.dataset).map(e => ({ id: e.dataset.id, title: e.dataset.title, href: e.dataset.href })).filter((d1, i, s) => d1.id !== filtersDataset.id && s.findIndex(d2 => d1.id === d2.id) === i)
      datasets.unshift(filtersDataset)
      if ((config.value.datasets || []).map(d => d.id).join('-') !== datasets.map(d => d.id).join('-')) window.parent.postMessage({ type: 'set-config', content: { field: 'datasets', value: datasets } }, '*')
    }
  })
}

</script>

<template>
  <v-app>
    <v-main>
      <Suspense>
        <dashboard />
      </Suspense>
      <snack-bar />
    </v-main>
  </v-app>
</template>
