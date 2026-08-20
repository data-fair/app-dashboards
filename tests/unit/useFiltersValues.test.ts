import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useFiltersValues } from '@/composables/useFiltersValues'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardConfig, DashboardFilter } from '@/config'
import type { Field } from '@data-fair/lib-common-types/application/index.js'

const { useConfigMock, useAsyncActionMock, ofetchMock } = vi.hoisted(() => ({
  useConfigMock: vi.fn(),
  useAsyncActionMock: vi.fn(),
  ofetchMock: vi.fn()
}))
vi.mock('@/composables/config', () => ({ useConfig: () => useConfigMock() }))
vi.mock('@data-fair/lib-vue/async-action.js', () => ({ useAsyncAction: useAsyncActionMock }))
vi.mock('ofetch', () => ({ ofetch: ofetchMock }))

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

const setup = (state: ReturnType<typeof makeState>, address?: { lon: number; lat: number }) => {
  useConfigMock.mockReturnValue(state)
  useAsyncActionMock.mockImplementation((fn: () => Promise<void>) => ({
    execute: vi.fn(() => fn()),
    loading: ref(false),
    error: ref(null)
  }))
  return useFiltersValues({ prefix: '', address: ref(address) })
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('useFiltersValues', () => {
  beforeEach(() => {
    ofetchMock.mockReset()
  })

  afterEach(() => {
    for (const key of Object.keys(reactiveSearchParams)) delete reactiveSearchParams[key]
  })

  it('émet { keys: [] } sans dataset', async () => {
    const { values } = setup(makeState())
    await nextTick()
    await flush()
    expect(values.value).toEqual({ keys: [] })
  })

  it('sérialise un filtre actif simple sans appel /values', async () => {
    reactiveSearchParams._d_ds1_an_in = '2020'
    const state = makeState({
      filters: ref([{ labelField: 'an' }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' })
    })
    const { values } = setup(state)
    await nextTick()
    await flush()
    expect(values.value).toEqual({
      keys: ['an'],
      _d_ds1_an_in: '"2020"',
      finalizedAt: 'F'
    })
    expect(ofetchMock).not.toHaveBeenCalled()
  })

  it('résout les champs associés via /values et les sérialise avec le mirror concept', async () => {
    reactiveSearchParams._d_ds1_libelle_in = '"X"'
    ofetchMock.mockResolvedValue(['c1', 'c2'])
    const state = makeState({
      filters: ref([{ labelField: 'libelle', values: ['code'] }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' }),
      fields: ref({ code: fieldWithConcept('code', 'codeEPCI'), libelle: plainField('libelle') })
    })
    const { values } = setup(state)
    await nextTick()
    await flush()
    expect(ofetchMock).toHaveBeenCalledWith('https://x/ds1/values/code', expect.objectContaining({
      params: expect.objectContaining({ libelle_in: '"X"' })
    }))
    expect(values.value).toEqual({
      keys: ['libelle'],
      _d_ds1_code_in: '"c1","c2"',
      _c_codeEPCI_in: '"c1","c2"',
      finalizedAt: ''
    })
  })

  it('fusionne les staticFilters (clés dataset-scopées + mirror concept)', async () => {
    const state = makeState({
      config: ref({ staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] }),
      filters: ref([]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' }),
      fields: ref({ dep: fieldWithConcept('dep', 'codeDepartement') })
    })
    const { values } = setup(state)
    await nextTick()
    await flush()
    expect(values.value).toEqual({
      keys: [],
      _d_ds1_dep_in: '75',
      _c_codeDepartement_in: '75',
      finalizedAt: ''
    })
  })

  it('émet période et géo quand activées', async () => {
    reactiveSearchParams.period = '2020-01-01,2020-12-31'
    reactiveSearchParams.radius = '5'
    const state = makeState({
      config: ref({ periodFilter: true, addressFilter: true }),
      filters: ref([]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' })
    })
    const { values } = setup(state, { lon: 1.5, lat: 48.8 })
    await nextTick()
    await flush()
    expect(values.value).toEqual({
      keys: [],
      _c_date_match: '2020-01-01,2020-12-31',
      _c_geo_distance: '1.5,48.8,5000',
      finalizedAt: ''
    })
  })

  it('applicationValues est une copie de values', async () => {
    reactiveSearchParams._d_ds1_an_in = '2020'
    const state = makeState({
      filters: ref([{ labelField: 'an' }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' })
    })
    const { values, applicationValues } = setup(state)
    await nextTick()
    await flush()
    expect(applicationValues.value).toEqual({ ...values.value })
  })

  it('sérialise un filtre range slider en gte/lte sans appel /values', async () => {
    reactiveSearchParams._d_ds1_tx_gte = '10'
    reactiveSearchParams._d_ds1_tx_lte = '20'
    const state = makeState({
      filters: ref([{ labelField: 'tx', slider: true }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' }),
      fields: ref({ tx: fieldWithConcept('tx', 'tauxPauvrete') })
    })
    const { values } = setup(state)
    await nextTick()
    await flush()
    expect(ofetchMock).not.toHaveBeenCalled()
    expect(values.value).toEqual({
      keys: ['tx'],
      _d_ds1_tx_gte: '10',
      _d_ds1_tx_lte: '20',
      _c_tauxPauvrete_gte: '10',
      _c_tauxPauvrete_lte: '20',
      finalizedAt: 'F'
    })
  })

  it('sérialise un range slider avec une seule borne', async () => {
    reactiveSearchParams._d_ds1_tx_lte = '25'
    const state = makeState({
      filters: ref([{ labelField: 'tx', slider: true }]),
      dataset: ref({ id: 'ds1', href: 'https://x/ds1' })
    })
    const { values } = setup(state)
    await nextTick()
    await flush()
    expect(values.value).toEqual({
      keys: ['tx'],
      _d_ds1_tx_lte: '25',
      finalizedAt: ''
    })
  })

  it('relance la recompute quand le flag slider du filtre change (draft hot reload)', async () => {
    reactiveSearchParams._d_ds1_tx_gte = '10'
    reactiveSearchParams._d_ds1_tx_lte = '20'
    const filters = ref<DashboardFilter[]>([{ labelField: 'tx', slider: true }])
    let execute = vi.fn()
    useConfigMock.mockReturnValue(makeState({
      filters,
      dataset: ref({ id: 'ds1', href: 'https://x/ds1', finalizedAt: 'F' })
    }))
    useAsyncActionMock.mockImplementation((fn: () => Promise<void>) => {
      execute = vi.fn(() => fn())
      return { execute, loading: ref(false), error: ref(null) }
    })
    const { values } = useFiltersValues({ prefix: '', address: ref(undefined) })
    await nextTick()
    await flush()
    expect(values.value).toEqual({
      keys: ['tx'],
      _d_ds1_tx_gte: '10',
      _d_ds1_tx_lte: '20',
      finalizedAt: 'F'
    })

    // Bascule du slider → le flag change, la recompute doit repartir et les
    // bornes gte/lte doivent disparaître du broadcast.
    filters.value = [{ labelField: 'tx' }]
    await nextTick()
    await flush()
    expect(execute).toHaveBeenCalledTimes(2)
    expect(values.value).toEqual({ keys: [], finalizedAt: 'F' })
  })
})
