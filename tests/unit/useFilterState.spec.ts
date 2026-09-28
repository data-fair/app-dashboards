import './helpers/dom'
import { test, expect } from '@playwright/test'
import { ref } from 'vue'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { useFilterState, type UseFilterStateOptions } from '@/composables/useFilterState'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardConfig, DashboardFilter } from '@/config'
import type { ValueLabel } from '@/utils/filters'
import { FetchStub } from './helpers/fetch-mock'
import { probe, unmountProbes } from './helpers/probe'
import { settle } from './helpers/spy'

const fetchStub = new FetchStub()

// Mount useFilterState in a probe app (lib-vue's useFetch needs useUiNotif).
const mountFilterState = (opts: UseFilterStateOptions) =>
  probe(() => useFilterState(opts), app => app.use(createUiNotif()))

const valuesLabelsCalls = () => fetchStub.calls.filter(c => c.url.includes('/values-labels/'))
const metricsCalls = () => fetchStub.calls.filter(c => c.url.includes('/simple_metrics_agg'))

test.beforeEach(() => {
  fetchStub.reset()
  fetchStub.on('/values-labels/', { json: [] })
  fetchStub.install()
})

test.afterEach(() => {
  unmountProbes()
  fetchStub.restore()
})

const filter = (overrides: Partial<DashboardFilter> = {}): DashboardFilter => ({
  labelField: 'an',
  ...overrides
}) as DashboardFilter

const setup = (f: DashboardFilter, data: ValueLabel[] | null = null) => {
  if (data) fetchStub.on('/values-labels/', { json: data })
  const datasetId = ref<string | undefined>('ds1')
  const datasetHref = ref<string | undefined>('https://x/href')
  const config = ref<DashboardConfig>({})
  const api = mountFilterState({ filter: f, prefix: '', datasetId, datasetHref, config })
  return { ...api, datasetId, datasetHref }
}

test.describe('useFilterState — value', () => {
  test.beforeEach(() => {
    delete (window as any).APPLICATION
  })

  test.afterEach(() => {
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
  })

  test('lit la valeur simple depuis les params', () => {
    reactiveSearchParams._d_ds1_an_in = '2020'
    const { value } = setup(filter())
    expect(value.value).toBe('2020')
  })

  test('lit une valeur multiple (CSV JSON) depuis les params', () => {
    reactiveSearchParams._d_ds1_an_in = '"2020","2021"'
    const { value } = setup(filter({ multipleValues: true }))
    expect(value.value).toEqual(['2020', '2021'])
  })

  test('retourne la valeur par défaut sans param', () => {
    expect(setup(filter()).value.value).toBeUndefined()
    expect(setup(filter({ multipleValues: true })).value.value).toEqual([])
  })

  test('écrit la valeur simple et supprime le param quand elle est vidée', () => {
    const { value } = setup(filter())
    value.value = '2019'
    expect(reactiveSearchParams._d_ds1_an_in).toBe('2019')
    value.value = undefined
    expect(reactiveSearchParams._d_ds1_an_in).toBeUndefined()
  })

  test('sérialise une valeur multiple en CSV entre guillemets', () => {
    const { value } = setup(filter({ multipleValues: true }))
    value.value = ['2020', '2021']
    expect(reactiveSearchParams._d_ds1_an_in).toBe('"2020","2021"')
    value.value = []
    expect(reactiveSearchParams._d_ds1_an_in).toBeUndefined()
  })

  test('préfixe la clé avec le prefix de colonne compare', () => {
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    const { value } = mountFilterState({ filter: filter(), prefix: 'c', datasetId, datasetHref, config })
    value.value = '2020'
    expect(reactiveSearchParams.c_d_ds1_an_in).toBe('2020')
  })
})

test.describe('useFilterState — items et recherche', () => {
  test.afterEach(() => {
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
  })

  test('fusionne les valeurs sélectionnées avec les données distantes et trie', async () => {
    reactiveSearchParams._d_ds1_an_in = '"c"'
    const { items } = setup(
      filter({ multipleValues: true }),
      [{ value: 'b', label: 'B' }, { value: 'a', label: 'A' }]
    )
    await settle()
    expect(items.value.map(i => i.value)).toEqual(['a', 'b', 'c'])
  })

  test('refetch au montage (watch immédiat)', async () => {
    setup(filter())
    await settle()
    // values-labels fetched once; the metrics refresh is a no-op (metrics URL is null for a select filter)
    expect(valuesLabelsCalls()).toHaveLength(1)
    expect(metricsCalls()).toHaveLength(0)
  })

  test('searchItems relance le fetch après le debounce', async () => {
    const { searchItems } = setup(filter())
    await settle()
    expect(valuesLabelsCalls()).toHaveLength(1)

    searchItems('vel')
    await settle(100)
    // still inside the 300ms debounce window
    expect(valuesLabelsCalls()).toHaveLength(1)
    await settle(300)
    expect(valuesLabelsCalls()).toHaveLength(2)
    expect(valuesLabelsCalls()[1].url).toContain('q=vel')
  })
})

test.describe('useFilterState — range slider', () => {
  const slider = (overrides: Partial<DashboardFilter> = {}): DashboardFilter =>
    filter({ labelField: 'tx', slider: true, ...overrides })

  const setupSlider = (metrics: { min?: number; max?: number } | null = null) => {
    fetchStub.on('/simple_metrics_agg', { json: metrics ? { metrics: { tx: metrics } } : {} })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    const api = mountFilterState({ filter: slider(), prefix: '', datasetId, datasetHref, config })
    return { ...api, datasetId, datasetHref }
  }

  test.afterEach(() => {
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
  })

  test('lit les bornes depuis simple_metrics_agg et calcule un step propre', async () => {
    const { min, max, step } = setupSlider({ min: 10, max: 40 })
    await settle()
    expect(min.value).toBe(10)
    expect(max.value).toBe(40)
    // rawStep = (40-10)/100 = 0.3 → largest nice step ≤ 0.3 is 0.2
    expect(step.value).toBe(0.2)
  })

  test('inclut les staticFilters dans l\'URL metrics des bornes', async () => {
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({ staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] })
    mountFilterState({ filter: slider(), prefix: '', datasetId, datasetHref, config })
    await settle()
    // no values-labels fetch in slider mode
    expect(valuesLabelsCalls()).toHaveLength(0)
    expect(metricsCalls()).toHaveLength(1)
    const url = metricsCalls()[0].url
    expect(url).toContain('simple_metrics_agg')
    expect(url).toContain('fields=tx')
    expect(url).toContain('dep_in=75')
  })

  test('step propre pour une plage étroite', async () => {
    const { step } = setupSlider({ min: 10.5, max: 32.7 })
    await settle()
    // rawStep = 22.2/100 = 0.222 → 0.2
    expect(step.value).toBe(0.2)
  })

  test('step propre entier pour une grande plage', async () => {
    const { step } = setupSlider({ min: 0, max: 1000 })
    await settle()
    // rawStep = 10 → largest nice step ≤ 10 is 10
    expect(step.value).toBe(10)
  })

  test('decimals et formatValue suivent le step', async () => {
    const { step, decimals, formatValue } = setupSlider({ min: 10, max: 40 })
    await settle()
    expect(step.value).toBe(0.2)
    expect(decimals.value).toBe(1)
    expect(formatValue(12.34)).toBe('12.3')

    const { decimals: d0 } = setupSlider({ min: 0, max: 1000 })
    await settle()
    expect(d0.value).toBe(0)
  })

  test('step fallback 1 quand min === max', async () => {
    const { step } = setupSlider({ min: 10, max: 10 })
    await settle()
    expect(step.value).toBe(1)
  })

  test('pas de bornes tant que les metrics ne sont pas chargées', () => {
    const { min, max } = setupSlider(null)
    expect(min.value).toBeUndefined()
    expect(max.value).toBeUndefined()
  })

  test('value: écrit les bornes en clés gte/lte et lit un tuple', () => {
    const { value } = setupSlider()
    value.value = [10, 20]
    expect(reactiveSearchParams._d_ds1_tx_gte).toBe('10')
    expect(reactiveSearchParams._d_ds1_tx_lte).toBe('20')
    expect(value.value).toEqual([10, 20])
    value.value = undefined
    expect(reactiveSearchParams._d_ds1_tx_gte).toBeUndefined()
    expect(reactiveSearchParams._d_ds1_tx_lte).toBeUndefined()
    expect(value.value).toBeUndefined()
  })

  test('value: lit les bornes depuis les params sans fetch de valeurs', () => {
    reactiveSearchParams._d_ds1_tx_gte = '5'
    reactiveSearchParams._d_ds1_tx_lte = '15'
    const { value } = setupSlider()
    expect(value.value).toEqual([5, 15])
  })

  test('respecte le prefix sur les clés gte/lte', () => {
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    const { value } = mountFilterState({ filter: slider(), prefix: 'c', datasetId, datasetHref, config })
    value.value = [1, 2]
    expect(reactiveSearchParams.c_d_ds1_tx_gte).toBe('1')
    expect(reactiveSearchParams.c_d_ds1_tx_lte).toBe('2')
  })

  test('recalcule les bornes sur la grille du pas (thumb aligné sur des valeurs propres)', async () => {
    const { sliderMin, sliderMax, step } = setupSlider({ min: 0.2, max: 73 })
    await settle()
    // step = 72.8/100 = 0.728 → 0.5 ; grille ancrée sur 0 → bornes affichées 0 et 73
    expect(step.value).toBe(0.5)
    expect(sliderMin.value).toBe(0)
    expect(sliderMax.value).toBe(73)
  })

  test('sliderMin/sliderMax restent undefined tant que les bornes ne sont pas chargées', () => {
    const { sliderMin, sliderMax } = setupSlider(null)
    expect(sliderMin.value).toBeUndefined()
    expect(sliderMax.value).toBeUndefined()
  })

  test('formatValue supprime le zéro de fin inutile (5.0 → 5)', async () => {
    const { formatValue } = setupSlider({ min: 0.2, max: 73 })
    await settle()
    expect(formatValue(5)).toBe('5')
    expect(formatValue(60)).toBe('60')
    expect(formatValue(36.5)).toBe('36.5')
  })

  test('nettoye les clés gte/lte quand le slider est désactivé en draft (hot reload)', async () => {
    reactiveSearchParams._d_ds1_tx_gte = '5'
    reactiveSearchParams._d_ds1_tx_lte = '60'
    const filterRef = ref(slider())
    fetchStub.on('/simple_metrics_agg', { json: { metrics: { tx: { min: 0.2, max: 73 } } } })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    mountFilterState({ filter: filterRef, prefix: '', datasetId, datasetHref, config })
    await settle()

    filterRef.value = { ...slider(), slider: false }
    await settle()
    expect(reactiveSearchParams._d_ds1_tx_gte).toBeUndefined()
    expect(reactiveSearchParams._d_ds1_tx_lte).toBeUndefined()
  })

  test('nettoye la clé _in quand le slider est activé en draft (hot reload)', async () => {
    reactiveSearchParams._d_ds1_tx_in = '"a","b"'
    const filterRef = ref(slider())
    fetchStub.on('/simple_metrics_agg', { json: { metrics: { tx: { min: 0, max: 100 } } } })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    mountFilterState({ filter: filterRef, prefix: '', datasetId, datasetHref, config })
    // start from select mode
    filterRef.value = { labelField: 'tx' }
    await settle()
    expect(reactiveSearchParams._d_ds1_tx_in).toBe('"a","b"')
    // toggle to slider
    filterRef.value = slider()
    await settle()
    expect(reactiveSearchParams._d_ds1_tx_in).toBeUndefined()
  })
})
