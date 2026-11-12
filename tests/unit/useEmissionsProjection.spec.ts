import type { DashboardConfig, DashboardSection, SyncParams } from '@/config'
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import './helpers/dom'
import { test, expect } from '@playwright/test'
import { nextTick, ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useEmissionsProjection } from '@/composables/useEmissionsProjection'
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

test('projects a visu\'s filters into the clean namespace (filter sharing)', async () => {
  setup({ sections: section([app('sankey')]) })
  reactiveSearchParams['application-sankey__c_codeCommune_in'] = '86194'
  reactiveSearchParams['application-sankey_page'] = '2'
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBe('86194')
  expect(reactiveSearchParams['application-sankey_page']).toBe('2')
  expect(reactiveSearchParams.page).toBeUndefined()
})

test('a sandboxed mode publishes nothing in the clean namespace', async () => {
  setup({ sections: section([app('sankey', 'sandboxed')]) })
  reactiveSearchParams['application-sankey__d_src__id_eq'] = '12'
  await nextTick()
  expect(reactiveSearchParams._d_src__id_eq).toBeUndefined()
  expect(reactiveSearchParams['application-sankey__d_src__id_eq']).toBe('12')
})

test('a none mode purges the namespaced keys and publishes nothing', async () => {
  const { configRef } = setup({ sections: section([app('sankey')]) })
  reactiveSearchParams['application-sankey__c_codeCommune_in'] = '86194'
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBe('86194')

  configRef.value = { sections: section([app('sankey', 'none')]) }
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBeUndefined()
  expect(reactiveSearchParams['application-sankey__c_codeCommune_in']).toBeUndefined()
})

test('never projects a key the dashboard manages itself', async () => {
  setup({
    datasets: [{ id: 'ds1' }] as DashboardConfig['datasets'],
    filters: [{ labelField: 'dep' }],
    sections: section([app('sankey')])
  })
  reactiveSearchParams['application-sankey__d_ds1_dep_in'] = '75'
  await nextTick()
  expect(reactiveSearchParams._d_ds1_dep_in).toBeUndefined()
})

test('after a reload, adopts a clean key duplicating an emission, so it can remove it', async () => {
  // Reload: the URL carries both channels of the same filter.
  reactiveSearchParams['application-sankey__c_codeCommune_in'] = '86194'
  reactiveSearchParams._c_codeCommune_in = '86194'
  setup({ sections: section([app('sankey'), { type: 'text' }]) })

  // The visu clears its filter: the published key must disappear too.
  delete reactiveSearchParams['application-sankey__c_codeCommune_in']
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBeUndefined()
})

test('does not remove a clean key taken over by another writer', async () => {
  setup({ sections: section([app('sankey')]) })
  reactiveSearchParams['application-sankey__c_codeCommune_in'] = '86194'
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBe('86194')

  // The key is updated elsewhere (host page) then the emission disappears.
  reactiveSearchParams._c_codeCommune_in = '44109'
  delete reactiveSearchParams['application-sankey__c_codeCommune_in']
  await nextTick()
  expect(reactiveSearchParams._c_codeCommune_in).toBe('44109')
})

test('copies a selection into the private key of the other column', async () => {
  reactiveSearchParams.view = 'compare'
  setup({ sections: section([app('map')]) })

  reactiveSearchParams['application-map__d_ds1__id_eq'] = '2024-row'
  await nextTick()
  expect(reactiveSearchParams['c_application-map__d_ds1__id_eq']).toBe('2024-row')

  // The last click wins, the other way too.
  reactiveSearchParams['c_application-map__d_ds1__id_eq'] = '2025-row'
  await nextTick()
  expect(reactiveSearchParams['application-map__d_ds1__id_eq']).toBe('2025-row')

  // A clear propagates to both columns.
  delete reactiveSearchParams['c_application-map__d_ds1__id_eq']
  await nextTick()
  expect(reactiveSearchParams['application-map__d_ds1__id_eq']).toBeUndefined()
})

test('does not copy a key owned by the dashboard', async () => {
  reactiveSearchParams.view = 'compare'
  setup({
    datasets: [{ id: 'ds1' }] as DashboardConfig['datasets'],
    filters: [{ labelField: 'annee' }],
    sections: section([app('map')])
  })

  reactiveSearchParams['application-map__d_ds1_annee_in'] = '2024'
  await nextTick()
  expect(reactiveSearchParams['c_application-map__d_ds1_annee_in']).toBeUndefined()
})
