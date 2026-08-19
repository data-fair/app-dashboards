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
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('searchItems relance le fetch après le debounce', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const { searchItems } = setup(filter(), null, refresh)
    await nextTick()
    expect(refresh).toHaveBeenCalledTimes(1)

    searchItems('vel')
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
