<script setup lang="ts">
import { watch } from 'vue'
import { ofetch } from 'ofetch'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useConfig } from '@/composables/config'
import dashboard from './components/dashboard.vue'
import DfUiNotif from '@data-fair/lib-vuetify/ui-notif.vue'

const { config, error } = useConfig()

if (reactiveSearchParams.draft === 'true' && window.parent) {
  watch(error, (message) => {
    if (message) {
      ofetch(window.APPLICATION.href + '/error', { body: { message }, method: 'POST' }).catch((e: any) => {
        console.error('Failed to send error to backend', e)
      })
    }
  }, { immediate: true })

  watch(config, () => {
    const cfg = config.value
    const elements = ([] as any[]).concat(
      ...(cfg.sections || []).map((s: any) =>
        ([] as any[]).concat(...s.rows.map((r: any) =>
          ([] as any[]).concat(...r.elements.map((e: any) => Array.isArray(e.elements) ? e.elements : [e]))
        ))
      )
    )

    const applications = elements
      .filter((e: any) => e.type === 'application' && e.application)
      .map((e: any) => ({ id: e.application.id, title: e.application.title }))
      .filter((a1: any, i: number, s: any[]) => s.findIndex(a2 => a1.id === a2.id) === i)

    if ((cfg.applications || []).map((a: any) => a.id).join('-') !== applications.map((a: any) => a.id).join('-')) {
      window.parent.postMessage({ type: 'set-config', content: { field: 'applications', value: applications } }, '*')
    }

    if (cfg.datasets && cfg.datasets.length) {
      const filtersDataset = cfg.datasets[0]
      const datasets = elements
        .filter((e: any) => ['tablePreview', 'form'].includes(e.type) && e.dataset)
        .map((e: any) => ({ id: e.dataset.id, title: e.dataset.title, href: e.dataset.href }))
        .filter((d1: any, i: number, s: any[]) => d1.id !== filtersDataset.id && s.findIndex(d2 => d1.id === d2.id) === i)
      datasets.unshift(filtersDataset)
      if ((cfg.datasets || []).map((d: any) => d.id).join('-') !== datasets.map((d: any) => d.id).join('-')) {
        window.parent.postMessage({ type: 'set-config', content: { field: 'datasets', value: datasets } }, '*')
      }
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
      <df-ui-notif />
    </v-main>
  </v-app>
</template>
