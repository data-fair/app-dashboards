import type { UseFilterStateOptions } from '@/composables/useFilterState'
import type { DashboardConfig, DashboardFilter } from '@/config'
import type { ValueLabel } from '@/utils/filters'
import './helpers/dom'
import { test, expect } from '@playwright/test'
import { ref } from 'vue'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { useFilterState } from '@/composables/useFilterState'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
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

  test('reads the simple value from the params', () => {
    reactiveSearchParams._d_ds1_an_in = '2020'
    const { value } = setup(filter())
    expect(value.value).toBe('2020')
  })

  test('reads a multiple value (JSON CSV) from the params', () => {
    reactiveSearchParams._d_ds1_an_in = '"2020","2021"'
    const { value } = setup(filter({ multipleValues: true }))
    expect(value.value).toEqual(['2020', '2021'])
  })

  test('returns the default value without param', () => {
    expect(setup(filter()).value.value).toBeUndefined()
    expect(setup(filter({ multipleValues: true })).value.value).toEqual([])
  })

  test('writes the simple value and removes the param when it is cleared', () => {
    const { value } = setup(filter())
    value.value = '2019'
    expect(reactiveSearchParams._d_ds1_an_in).toBe('2019')
    value.value = undefined
    expect(reactiveSearchParams._d_ds1_an_in).toBeUndefined()
  })

  test('serializes a multiple value as quoted CSV', () => {
    const { value } = setup(filter({ multipleValues: true }))
    value.value = ['2020', '2021']
    expect(reactiveSearchParams._d_ds1_an_in).toBe('"2020","2021"')
    value.value = []
    expect(reactiveSearchParams._d_ds1_an_in).toBeUndefined()
  })

  test('prefixes the key with the compare column prefix', () => {
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    const { value } = mountFilterState({ filter: filter(), prefix: 'c', datasetId, datasetHref, config })
    value.value = '2020'
    expect(reactiveSearchParams.c_d_ds1_an_in).toBe('2020')
  })
})

test.describe('useFilterState — items and search', () => {
  test.afterEach(() => {
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
  })

  test('merges the selected values with the remote data and sorts', async () => {
    reactiveSearchParams._d_ds1_an_in = '"c"'
    const { items } = setup(
      filter({ multipleValues: true }),
      [{ value: 'b', label: 'B' }, { value: 'a', label: 'A' }]
    )
    await settle()
    expect(items.value.map(i => i.value)).toEqual(['a', 'b', 'c'])
  })

  test('refetches on mount (immediate watch)', async () => {
    setup(filter())
    await settle()
    // values-labels fetched once; the metrics refresh is a no-op (metrics URL is null for a select filter)
    expect(valuesLabelsCalls()).toHaveLength(1)
    expect(metricsCalls()).toHaveLength(0)
  })

  test('searchItems refetches after the debounce', async () => {
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

  test('reads the bounds from simple_metrics_agg and computes a clean step', async () => {
    const { min, max, step } = setupSlider({ min: 10, max: 40 })
    await settle()
    expect(min.value).toBe(10)
    expect(max.value).toBe(40)
    // rawStep = (40-10)/100 = 0.3 → largest nice step ≤ 0.3 is 0.2
    expect(step.value).toBe(0.2)
  })

  test('includes the staticFilters in the bounds metrics URL', async () => {
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

  test('clean step for a narrow range', async () => {
    const { step } = setupSlider({ min: 10.5, max: 32.7 })
    await settle()
    // rawStep = 22.2/100 = 0.222 → 0.2
    expect(step.value).toBe(0.2)
  })

  test('clean integer step for a large range', async () => {
    const { step } = setupSlider({ min: 0, max: 1000 })
    await settle()
    // rawStep = 10 → largest nice step ≤ 10 is 10
    expect(step.value).toBe(10)
  })

  test('decimals and formatValue follow the step', async () => {
    const { step, decimals, formatValue } = setupSlider({ min: 10, max: 40 })
    await settle()
    expect(step.value).toBe(0.2)
    expect(decimals.value).toBe(1)
    expect(formatValue(12.34)).toBe('12.3')

    const { decimals: d0 } = setupSlider({ min: 0, max: 1000 })
    await settle()
    expect(d0.value).toBe(0)
  })

  test('step falls back to 1 when min === max', async () => {
    const { step } = setupSlider({ min: 10, max: 10 })
    await settle()
    expect(step.value).toBe(1)
  })

  test('no bounds until the metrics are loaded', () => {
    const { min, max } = setupSlider(null)
    expect(min.value).toBeUndefined()
    expect(max.value).toBeUndefined()
  })

  test('value: writes the bounds as gte/lte keys and reads a tuple', () => {
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

  test('value: reads the bounds from the params without values fetch', () => {
    reactiveSearchParams._d_ds1_tx_gte = '5'
    reactiveSearchParams._d_ds1_tx_lte = '15'
    const { value } = setupSlider()
    expect(value.value).toEqual([5, 15])
  })

  test('honors the prefix on the gte/lte keys', () => {
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    const { value } = mountFilterState({ filter: slider(), prefix: 'c', datasetId, datasetHref, config })
    value.value = [1, 2]
    expect(reactiveSearchParams.c_d_ds1_tx_gte).toBe('1')
    expect(reactiveSearchParams.c_d_ds1_tx_lte).toBe('2')
  })

  test('recomputes the bounds on the step grid (thumb aligned on clean values)', async () => {
    const { sliderMin, sliderMax, step } = setupSlider({ min: 0.2, max: 73 })
    await settle()
    // step = 72.8/100 = 0.728 → 0.5; grid anchored on 0 → displayed bounds 0 and 73
    expect(step.value).toBe(0.5)
    expect(sliderMin.value).toBe(0)
    expect(sliderMax.value).toBe(73)
  })

  test('sliderMin/sliderMax stay undefined until the bounds are loaded', () => {
    const { sliderMin, sliderMax } = setupSlider(null)
    expect(sliderMin.value).toBeUndefined()
    expect(sliderMax.value).toBeUndefined()
  })

  test('formatValue strips the useless trailing zero (5.0 → 5)', async () => {
    const { formatValue } = setupSlider({ min: 0.2, max: 73 })
    await settle()
    expect(formatValue(5)).toBe('5')
    expect(formatValue(60)).toBe('60')
    expect(formatValue(36.5)).toBe('36.5')
  })

  test('clears the gte/lte keys when the slider is disabled in draft (hot reload)', async () => {
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

  test('clears the _in key when the slider is enabled in draft (hot reload)', async () => {
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
