import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useFilterState } from '@/composables/useFilterState'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardConfig, DashboardFilter } from '@/config'
import type { ValueLabel } from '@/utils/filters'

const { useFetchMock } = vi.hoisted(() => ({
  useFetchMock: vi.fn()
}))
vi.mock('@data-fair/lib-vue/fetch.js', () => ({
  useFetch: (...args: unknown[]) => useFetchMock(...args)
}))

const filter = (overrides: Partial<DashboardFilter> = {}): DashboardFilter => ({
  labelField: 'an',
  ...overrides
}) as DashboardFilter

const setup = (f: DashboardFilter, data: ValueLabel[] | null = null, refresh = vi.fn()) => {
  useFetchMock.mockReturnValue({ data: ref(data), loading: ref(false), refresh, error: ref(null) })
  const datasetId = ref<string | undefined>('ds1')
  const datasetHref = ref<string | undefined>('https://x/href')
  const config = ref<DashboardConfig>({})
  const api = useFilterState({ filter: f, prefix: '', datasetId, datasetHref, config })
  return { ...api, refresh, datasetId, datasetHref }
}

describe('useFilterState — value', () => {
  beforeEach(() => {
    delete (window as any).APPLICATION
  })

  afterEach(() => {
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
  })

  it('lit la valeur simple depuis les params', () => {
    reactiveSearchParams._d_ds1_an_in = '2020'
    const { value } = setup(filter())
    expect(value.value).toBe('2020')
  })

  it('lit une valeur multiple (CSV JSON) depuis les params', () => {
    reactiveSearchParams._d_ds1_an_in = '"2020","2021"'
    const { value } = setup(filter({ multipleValues: true }))
    expect(value.value).toEqual(['2020', '2021'])
  })

  it('retourne la valeur par défaut sans param', () => {
    expect(setup(filter()).value.value).toBeUndefined()
    expect(setup(filter({ multipleValues: true })).value.value).toEqual([])
  })

  it('écrit la valeur simple et supprime le param quand elle est vidée', () => {
    const { value } = setup(filter())
    value.value = '2019'
    expect(reactiveSearchParams._d_ds1_an_in).toBe('2019')
    value.value = undefined
    expect(reactiveSearchParams._d_ds1_an_in).toBeUndefined()
  })

  it('sérialise une valeur multiple en CSV entre guillemets', () => {
    const { value } = setup(filter({ multipleValues: true }))
    value.value = ['2020', '2021']
    expect(reactiveSearchParams._d_ds1_an_in).toBe('"2020","2021"')
    value.value = []
    expect(reactiveSearchParams._d_ds1_an_in).toBeUndefined()
  })

  it('préfixe la clé avec le prefix de colonne compare', () => {
    useFetchMock.mockReturnValue({ data: ref(null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    const { value } = useFilterState({ filter: filter(), prefix: 'c', datasetId, datasetHref, config })
    value.value = '2020'
    expect(reactiveSearchParams.c_d_ds1_an_in).toBe('2020')
  })
})

describe('useFilterState — items et recherche', () => {
  afterEach(() => {
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
    vi.useRealTimers()
  })

  it('fusionne les valeurs sélectionnées avec les données distantes et trie', () => {
    reactiveSearchParams._d_ds1_an_in = '"c"'
    const { items } = setup(
      filter({ multipleValues: true }),
      [{ value: 'b', label: 'B' }, { value: 'a', label: 'A' }]
    )
    expect(items.value.map(i => i.value)).toEqual(['a', 'b', 'c'])
  })

  it('refetch au montage (watch immédiat)', async () => {
    const refresh = vi.fn()
    setup(filter(), null, refresh)
    await nextTick()
    // values-labels refresh + metrics refresh (metrics URL is null for a select filter)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('searchItems relance le fetch après le debounce', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const { searchItems } = setup(filter(), null, refresh)
    await nextTick()
    expect(refresh).toHaveBeenCalledTimes(2)

    searchItems('vel')
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()
    expect(refresh).toHaveBeenCalledTimes(3)
  })
})

describe('useFilterState — range slider', () => {
  const slider = (overrides: Partial<DashboardFilter> = {}): DashboardFilter =>
    filter({ labelField: 'tx', slider: true, ...overrides })

  const setupSlider = (metrics: { min?: number; max?: number } | null = null) => {
    // First useFetch call = metrics (bounds), second = values-labels (null in slider mode)
    useFetchMock
      .mockReturnValueOnce({ data: ref(metrics ? { metrics: { tx: metrics } } : null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
      .mockReturnValue({ data: ref(null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    const api = useFilterState({ filter: slider(), prefix: '', datasetId, datasetHref, config })
    return { ...api, datasetId, datasetHref }
  }

  afterEach(() => {
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
  })

  it('lit les bornes depuis simple_metrics_agg et calcule un step propre', async () => {
    const { min, max, step } = setupSlider({ min: 10, max: 40 })
    await nextTick()
    expect(min.value).toBe(10)
    expect(max.value).toBe(40)
    // rawStep = (40-10)/100 = 0.3 → largest nice step ≤ 0.3 is 0.2
    expect(step.value).toBe(0.2)
  })

  it('inclut les staticFilters dans l\'URL metrics des bornes', async () => {
    useFetchMock
      .mockReturnValueOnce({ data: ref(null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
      .mockReturnValue({ data: ref(null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({ staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] })
    useFilterState({ filter: slider(), prefix: '', datasetId, datasetHref, config })
    await nextTick()
    // useFetchMock is shared across the file: this test's calls are the last
    // two (metrics first, then values-labels).
    const metricsUrlGetter = useFetchMock.mock.calls.at(-2)![0] as () => string | null
    const url = metricsUrlGetter()
    expect(url).toContain('simple_metrics_agg')
    expect(url).toContain('fields=tx')
    expect(url).toContain('dep_in=75')
  })

  it('step propre pour une plage étroite', async () => {
    const { step } = setupSlider({ min: 10.5, max: 32.7 })
    await nextTick()
    // rawStep = 22.2/100 = 0.222 → 0.2
    expect(step.value).toBe(0.2)
  })

  it('step propre entier pour une grande plage', async () => {
    const { step } = setupSlider({ min: 0, max: 1000 })
    await nextTick()
    // rawStep = 10 → largest nice step ≤ 10 is 10
    expect(step.value).toBe(10)
  })

  it('decimals et formatValue suivent le step', async () => {
    const { step, decimals, formatValue } = setupSlider({ min: 10, max: 40 })
    await nextTick()
    expect(step.value).toBe(0.2)
    expect(decimals.value).toBe(1)
    expect(formatValue(12.34)).toBe('12.3')

    const { decimals: d0 } = setupSlider({ min: 0, max: 1000 })
    await nextTick()
    expect(d0.value).toBe(0)
  })

  it('step fallback 1 quand min === max', async () => {
    const { step } = setupSlider({ min: 10, max: 10 })
    await nextTick()
    expect(step.value).toBe(1)
  })

  it('pas de bornes tant que les metrics ne sont pas chargées', () => {
    const { min, max } = setupSlider(null)
    expect(min.value).toBeUndefined()
    expect(max.value).toBeUndefined()
  })

  it('value: écrit les bornes en clés gte/lte et lit un tuple', () => {
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

  it('value: lit les bornes depuis les params sans fetch de valeurs', () => {
    reactiveSearchParams._d_ds1_tx_gte = '5'
    reactiveSearchParams._d_ds1_tx_lte = '15'
    const { value } = setupSlider()
    expect(value.value).toEqual([5, 15])
  })

  it('respecte le prefix sur les clés gte/lte', () => {
    useFetchMock
      .mockReturnValueOnce({ data: ref(null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
      .mockReturnValue({ data: ref(null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    const { value } = useFilterState({ filter: slider(), prefix: 'c', datasetId, datasetHref, config })
    value.value = [1, 2]
    expect(reactiveSearchParams.c_d_ds1_tx_gte).toBe('1')
    expect(reactiveSearchParams.c_d_ds1_tx_lte).toBe('2')
  })

  it('recalcule les bornes sur la grille du pas (thumb aligné sur des valeurs propres)', async () => {
    const { sliderMin, sliderMax, step } = setupSlider({ min: 0.2, max: 73 })
    await nextTick()
    // step = 72.8/100 = 0.728 → 0.5 ; grille ancrée sur 0 → bornes affichées 0 et 73
    expect(step.value).toBe(0.5)
    expect(sliderMin.value).toBe(0)
    expect(sliderMax.value).toBe(73)
  })

  it('sliderMin/sliderMax restent undefined tant que les bornes ne sont pas chargées', () => {
    const { sliderMin, sliderMax } = setupSlider(null)
    expect(sliderMin.value).toBeUndefined()
    expect(sliderMax.value).toBeUndefined()
  })

  it('formatValue supprime le zéro de fin inutile (5.0 → 5)', async () => {
    const { formatValue } = setupSlider({ min: 0.2, max: 73 })
    await nextTick()
    expect(formatValue(5)).toBe('5')
    expect(formatValue(60)).toBe('60')
    expect(formatValue(36.5)).toBe('36.5')
  })

  it('nettoye les clés gte/lte quand le slider est désactivé en draft (hot reload)', async () => {
    reactiveSearchParams._d_ds1_tx_gte = '5'
    reactiveSearchParams._d_ds1_tx_lte = '60'
    const filterRef = ref(slider())
    useFetchMock
      .mockReturnValueOnce({ data: ref({ metrics: { tx: { min: 0.2, max: 73 } } }), loading: ref(false), refresh: vi.fn(), error: ref(null) })
      .mockReturnValue({ data: ref(null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    useFilterState({ filter: filterRef, prefix: '', datasetId, datasetHref, config })
    await nextTick()

    filterRef.value = { ...slider(), slider: false }
    await nextTick()
    expect(reactiveSearchParams._d_ds1_tx_gte).toBeUndefined()
    expect(reactiveSearchParams._d_ds1_tx_lte).toBeUndefined()
  })

  it('nettoye la clé _in quand le slider est activé en draft (hot reload)', async () => {
    reactiveSearchParams._d_ds1_tx_in = '"a","b"'
    const filterRef = ref(slider())
    useFetchMock
      .mockReturnValueOnce({ data: ref({ metrics: { tx: { min: 0, max: 100 } } }), loading: ref(false), refresh: vi.fn(), error: ref(null) })
      .mockReturnValue({ data: ref(null), loading: ref(false), refresh: vi.fn(), error: ref(null) })
    const datasetId = ref<string | undefined>('ds1')
    const datasetHref = ref<string | undefined>('https://x/href')
    const config = ref<DashboardConfig>({})
    useFilterState({ filter: filterRef, prefix: '', datasetId, datasetHref, config })
    // start from select mode
    filterRef.value = { labelField: 'tx' }
    await nextTick()
    expect(reactiveSearchParams._d_ds1_tx_in).toBe('"a","b"')
    // toggle to slider
    filterRef.value = slider()
    await nextTick()
    expect(reactiveSearchParams._d_ds1_tx_in).toBeUndefined()
  })
})
