import type { DashboardConfig, DashboardFilter } from '@/config'
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import './helpers/dom'
import { test, expect } from '@playwright/test'
import { ref, nextTick, watch } from 'vue'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { useFiltersValues } from '@/composables/useFiltersValues'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { FetchStub } from './helpers/fetch-mock'
import { probe, unmountProbes } from './helpers/probe'
import { settle } from './helpers/spy'

const fetchStub = new FetchStub()

/** Query params of the /values/<field> requests, keyed by URL path. */
const valuesCalls = () => fetchStub.calls
  .filter(c => c.url.includes('/values/'))
  .map(c => {
    const url = new URL(c.url)
    return { path: url.origin + url.pathname, params: Object.fromEntries(url.searchParams) }
  })

const fieldWithConcept = (key: string, concept: string): Field =>
  ({ key, title: key, 'x-concept': { id: concept, title: concept } }) as Field
const plainField = (key: string): Field => ({ key, title: key }) as Field

const makeState = (overrides: Record<string, unknown> = {}) => ({
  config: ref<DashboardConfig>({}),
  filters: ref<DashboardFilter[] | undefined>(undefined),
  dataset: ref<{ id: string; href: string; finalizedAt?: string } | undefined>(undefined),
  fields: ref<Record<string, Field>>({}),
  ...overrides
})

const setup = (state: ReturnType<typeof makeState>, address?: { lon: number; lat: number }, prefix = '') => {
  return probe(() => useFiltersValues({ prefix, address: ref(address) }), (app) => {
    app.provide('data-fair-app-config', state)
    app.use(createUiNotif())
  })
}

test.describe('useFiltersValues', () => {
  test.beforeEach(() => {
    fetchStub.reset()
    fetchStub.install()
  })

  test.afterEach(() => {
    unmountProbes()
    fetchStub.restore()
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
  })

  test('emits { keys: [] } without dataset', async () => {
    const { values } = setup(makeState())
    await nextTick()
    await settle()
    expect(values.value).toEqual({ keys: [] })
  })

  test('serializes a simple active filter without /values call', async () => {
    reactiveSearchParams._d_ds1_an_in = '2020'
    const state = makeState({
      filters: ref([{ labelField: 'an' }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: ['an'],
      _d_ds1_an_in: '"2020"',
      finalizedAt: 'F'
    })
    expect(valuesCalls()).toHaveLength(0)
  })

  test('resolves the associated fields via /values and serializes them with the concept mirror', async () => {
    reactiveSearchParams._d_ds1_libelle_in = '"X"'
    fetchStub.on('/values/code', { json: ['c1', 'c2'] })
    const state = makeState({
      filters: ref([{ labelField: 'libelle', values: ['code'] }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' }),
      fields: ref({ code: fieldWithConcept('code', 'codeEPCI'), libelle: plainField('libelle') })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(valuesCalls()).toContainEqual({
      path: 'https://x/ds1/values/code',
      params: expect.objectContaining({ libelle_in: '"X"' })
    })
    expect(values.value).toEqual({
      keys: ['libelle'],
      _d_ds1_code_in: '"c1","c2"',
      _c_codeEPCI_in: '"c1","c2"',
      finalizedAt: ''
    })
  })

  test('forwards the staticFilters to the /values resolution', async () => {
    reactiveSearchParams._d_ds1_libelle_in = '"X"'
    fetchStub.on('/values/code', { json: ['c1'] })
    const state = makeState({
      config: ref({ staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] }),
      filters: ref([{ labelField: 'libelle', values: ['code'] }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' }),
      fields: ref({ code: plainField('code'), libelle: plainField('libelle') })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(valuesCalls()).toContainEqual({
      path: 'https://x/ds1/values/code',
      params: expect.objectContaining({ libelle_in: '"X"', dep_in: '75' })
    })
    expect(values.value).toEqual({
      keys: ['libelle'],
      _d_ds1_code_in: '"c1"',
      _d_ds1_dep_in: '75',
      finalizedAt: ''
    })
  })

  test('merges the staticFilters (dataset-scoped keys + concept mirror)', async () => {
    const state = makeState({
      config: ref({ staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] }),
      filters: ref([]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' }),
      fields: ref({ dep: fieldWithConcept('dep', 'codeDepartement') })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: [],
      _d_ds1_dep_in: '75',
      _c_codeDepartement_in: '75',
      finalizedAt: ''
    })
  })

  test('emits period and geo when enabled', async () => {
    reactiveSearchParams.period = '2020-01-01,2020-12-31'
    reactiveSearchParams.radius = '5'
    const state = makeState({
      config: ref({ periodFilter: true, addressFilter: true }),
      filters: ref([]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' })
    })
    const { values } = setup(state, { lon: 1.5, lat: 48.8 })
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: [],
      _c_date_match: '2020-01-01,2020-12-31',
      _c_geo_distance: '1.5,48.8,5000',
      finalizedAt: ''
    })
  })

  test('applicationValues is a copy of values', async () => {
    reactiveSearchParams._d_ds1_an_in = '2020'
    const state = makeState({
      filters: ref([{ labelField: 'an' }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' })
    })
    const { values, applicationValues } = setup(state)
    await nextTick()
    await settle()
    expect(applicationValues.value).toEqual({ ...values.value })
  })

  test('applicationValues strips the compare column prefix from the dataset keys', async () => {
    reactiveSearchParams.c_d_ds1_dep_in = '75'
    reactiveSearchParams.c_d_ds1_tx_gte = '10'
    const state = makeState({
      filters: ref([{ labelField: 'dep' }, { labelField: 'tx', slider: true }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' }),
      fields: ref({ dep: fieldWithConcept('dep', 'codeDepartement'), tx: plainField('tx') })
    })
    const { values, applicationValues } = setup(state, undefined, 'c')
    await nextTick()
    await settle()
    // The dashboard keeps the column prefix in its own values
    // (URL, dataset embeds)…
    expect(values.value).toEqual({
      keys: ['dep', 'tx'],
      c_d_ds1_dep_in: '"75"',
      _c_codeDepartement_in: '"75"',
      c_d_ds1_tx_gte: '10',
      finalizedAt: 'F'
    })
    // …but applications only know the unprefixed keys.
    expect(applicationValues.value).toEqual({
      keys: ['dep', 'tx'],
      _d_ds1_dep_in: '"75"',
      _c_codeDepartement_in: '"75"',
      _d_ds1_tx_gte: '10',
      finalizedAt: 'F'
    })
  })

  test('serializes a range slider filter as gte/lte without /values call', async () => {
    reactiveSearchParams._d_ds1_tx_gte = '10'
    reactiveSearchParams._d_ds1_tx_lte = '20'
    const state = makeState({
      filters: ref([{ labelField: 'tx', slider: true }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' }),
      fields: ref({ tx: fieldWithConcept('tx', 'tauxPauvrete') })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(valuesCalls()).toHaveLength(0)
    expect(values.value).toEqual({
      keys: ['tx'],
      _d_ds1_tx_gte: '10',
      _d_ds1_tx_lte: '20',
      _c_tauxPauvrete_gte: '10',
      _c_tauxPauvrete_lte: '20',
      finalizedAt: 'F'
    })
  })

  test('serializes a range slider with a single bound', async () => {
    reactiveSearchParams._d_ds1_tx_lte = '25'
    const state = makeState({
      filters: ref([{ labelField: 'tx', slider: true }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: ['tx'],
      _d_ds1_tx_lte: '25',
      finalizedAt: ''
    })
  })

  test('re-runs the recompute when the filter\'s slider flag changes (draft hot reload)', async () => {
    reactiveSearchParams._d_ds1_tx_gte = '10'
    reactiveSearchParams._d_ds1_tx_lte = '20'
    const filters = ref<DashboardFilter[]>([{ labelField: 'tx', slider: true }])
    const { values, loading } = setup(makeState({
      filters,
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' })
    }))
    // every execute() of the async action flips loading to true synchronously
    let executions = 0
    watch(loading, (l) => { if (l) executions++ }, { flush: 'sync' })
    executions = loading.value ? 1 : 0
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: ['tx'],
      _d_ds1_tx_gte: '10',
      _d_ds1_tx_lte: '20',
      finalizedAt: 'F'
    })

    // Slider toggle → the flag changes, the recompute must restart and the
    // gte/lte bounds must disappear from the broadcast.
    filters.value = [{ labelField: 'tx' }]
    await nextTick()
    await settle()
    expect(executions).toBe(2)
    expect(values.value).toEqual({ keys: [], finalizedAt: 'F' })
  })

  test('the dynamic selection wins over the static in on the same field', async () => {
    reactiveSearchParams._d_ds1_type_in = '"a"'
    fetchStub.on('/values/type', { json: ['a'] })
    const state = makeState({
      config: ref({ staticFilters: [{ type: 'in', field: 'type', values: ['a', 'b'] }] }),
      filters: ref([{ labelField: 'type', values: ['type'], multipleValues: true }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(valuesCalls()).toContainEqual({
      path: 'https://x/ds1/values/type',
      params: expect.objectContaining({ type_in: '"a"' })
    })
    expect(values.value).toEqual({
      keys: ['type'],
      _d_ds1_type_in: '"a"',
      finalizedAt: 'F'
    })
  })

  test('relays the filters received from the page without configured filter', async () => {
    reactiveSearchParams._c_codeCommune_in = '86222'
    const state = makeState({
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' })
    })
    const { values, applicationValues } = setup(state)
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: [],
      _c_codeCommune_in: '86222',
      finalizedAt: 'F'
    })
    expect(applicationValues.value).toEqual({
      keys: [],
      _c_codeCommune_in: '86222',
      finalizedAt: 'F'
    })
    expect(fetchStub.calls).toHaveLength(0)
  })

  test('the dynamic selection wins over a received filter of the same concept', async () => {
    reactiveSearchParams._c_codeCommune_in = '86222'
    reactiveSearchParams._d_ds1_type_in = '"a"'
    fetchStub.on('/values/type', { json: ['a'] })
    const state = makeState({
      filters: ref([{ labelField: 'type', values: ['type'], multipleValues: true }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' }),
      fields: ref({ type: fieldWithConcept('type', 'codeCommune') })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: ['type'],
      _d_ds1_type_in: '"a"',
      _c_codeCommune_in: '"a"',
      finalizedAt: 'F'
    })
  })

  test('re-runs the recompute when a received filter changes (sync without reload)', async () => {
    reactiveSearchParams._c_codeCommune_in = '86222'
    const { values, loading } = setup(makeState({
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' })
    }))
    let executions = 0
    watch(loading, (l) => { if (l) executions++ }, { flush: 'sync' })
    executions = loading.value ? 1 : 0
    await nextTick()
    await settle()
    expect(executions).toBe(1)
    expect(values.value._c_codeCommune_in).toBe('86222')

    reactiveSearchParams._c_codeCommune_in = '86194'
    await nextTick()
    await settle()
    expect(executions).toBe(2)
    expect(values.value._c_codeCommune_in).toBe('86194')
  })

  test('relays the received dataset-scoped and concept filters, ignores legacy markers', async () => {
    reactiveSearchParams._c_codeCommune_in = '86222'
    reactiveSearchParams._s_codeCommune = 'app_sankey'
    reactiveSearchParams._d_autre_dep_in = '75'
    const state = makeState({
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' })
    })
    const { values, applicationValues } = setup(state)
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: [],
      _c_codeCommune_in: '86222',
      _d_autre_dep_in: '75',
      finalizedAt: 'F'
    })
    expect(applicationValues.value).toEqual({ ...values.value })
  })

  test('a received dataset-scoped key of the root dataset counts in the active filters', async () => {
    reactiveSearchParams._d_ds1_type_in = '"a"'
    const state = makeState({
      config: ref({ datasets: [{ id: 'ds1' }] }),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' }),
      fields: ref({ type: plainField('type') })
    })
    const { values } = setup(state)
    await nextTick()
    await settle()
    expect(values.value).toEqual({
      keys: ['type'],
      _d_ds1_type_in: '"a"',
      finalizedAt: ''
    })
  })
})
