import './helpers/dom'
import { test, expect } from '@playwright/test'
import { nextTick, ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useEmissionsProjection } from '@/composables/useEmissionsProjection'
import type { DashboardConfig, DashboardSection, SyncParams } from '@/config'
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import { probe, unmountProbes } from './helpers/probe'

const section = (elements: unknown[]): DashboardSection[] => ([{ rows: [{ elements }] } as unknown as DashboardSection])
const app = (id: string, syncParams?: SyncParams) => ({ type: 'application', application: { id }, syncParams })

const setup = (config: DashboardConfig, fields: Record<string, Field> = {}) => {
  const configRef = ref(config)
  const fieldsRef = ref(fields)
  probe(() => useEmissionsProjection(), (app) => {
    app.provide('data-fair-app-config', { config: configRef, fields: fieldsRef, dataset: ref(undefined) })
  })
  return { configRef }
}

test.afterEach(() => {
  unmountProbes()
  for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
})

test('projette les filtres d\'un visu vers le namespace propre (partage des filtres)', async () => {
  setup({ sections: section([app('sankey')]) })
  reactiveSearchParams['application-sankey__c_codeCommune_in'] = '86194'
  reactiveSearchParams['application-sankey_page'] = '2'
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBe('86194')
  expect(reactiveSearchParams['application-sankey_page']).toBe('2')
  expect(reactiveSearchParams.page).toBeUndefined()
})

test('un mode sandboxed ne publie rien dans le namespace propre', async () => {
  setup({ sections: section([app('sankey', 'sandboxed')]) })
  reactiveSearchParams['application-sankey__d_src__id_eq'] = '12'
  await nextTick()
  expect(reactiveSearchParams._d_src__id_eq).toBeUndefined()
  expect(reactiveSearchParams['application-sankey__d_src__id_eq']).toBe('12')
})

test('un mode none purge les clés namespacées et ne publie rien', async () => {
  const { configRef } = setup({ sections: section([app('sankey')]) })
  reactiveSearchParams['application-sankey__c_codeCommune_in'] = '86194'
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBe('86194')

  configRef.value = { sections: section([app('sankey', 'none')]) }
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBeUndefined()
  expect(reactiveSearchParams['application-sankey__c_codeCommune_in']).toBeUndefined()
})

test('ne projette jamais une clé que le dashboard gère lui-même', async () => {
  setup({
    datasets: [{ id: 'ds1' }] as DashboardConfig['datasets'],
    filters: [{ labelField: 'dep' }],
    sections: section([app('sankey')])
  })
  reactiveSearchParams['application-sankey__d_ds1_dep_in'] = '75'
  await nextTick()
  expect(reactiveSearchParams._d_ds1_dep_in).toBeUndefined()
})

test('adopte après rechargement une clé propre qui double une émission, pour pouvoir la retirer', async () => {
  // Rechargement : l'URL porte les deux canaux du même filtre.
  reactiveSearchParams['application-sankey__c_codeCommune_in'] = '86194'
  reactiveSearchParams._c_codeCommune_in = '86194'
  setup({ sections: section([app('sankey'), { type: 'text' }]) })

  // Le visu efface son filtre : la clé publiée doit disparaître aussi.
  delete reactiveSearchParams['application-sankey__c_codeCommune_in']
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBeUndefined()
})

test('ne supprime pas une clé propre reprise par un autre écrivain', async () => {
  setup({ sections: section([app('sankey')]) })
  reactiveSearchParams['application-sankey__c_codeCommune_in'] = '86194'
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBe('86194')

  // La clé est mise à jour ailleurs (page porteuse) puis l'émission disparaît.
  reactiveSearchParams._c_codeCommune_in = '44109'
  delete reactiveSearchParams['application-sankey__c_codeCommune_in']
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBe('44109')
})
