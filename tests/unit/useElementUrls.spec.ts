import type { DashboardElement } from '@/config'
import type { FiltersValues, ApplicationFiltersValues } from '@/utils/filters'
import './helpers/dom'
import { test, expect } from '@playwright/test'
import { ref, computed } from 'vue'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { useElementUrls } from '@/composables/useElementUrls'
import { FetchStub } from './helpers/fetch-mock'
import { probe, unmountProbes } from './helpers/probe'
import { settle } from './helpers/spy'

const fetchStub = new FetchStub()

const el = (element: Partial<DashboardElement> & { type: DashboardElement['type'] }): DashboardElement => element as DashboardElement

const useConfigValue = (overrides: Record<string, unknown> = {}) => ({
  application: {
    href: 'https://host/data-fair/app/dash',
    exposedUrl: 'https://host/app/dash',
    apiUrl: 'https://host/data-fair/api/v1',
    wsUrl: 'wss://host/data-fair/api/v1'
  },
  accessKey: ref<string | null>(null),
  config: ref({}),
  ...overrides
})

const setup = (element: DashboardElement, options: Record<string, unknown> = {}, config: ReturnType<typeof useConfigValue> = useConfigValue()) => {
  return probe(() => useElementUrls({ element: ref(element), ...options }), (app) => {
    app.provide('data-fair-app-config', config)
    app.use(createUiNotif())
  })
}

test.beforeEach(() => {
  fetchStub.reset()
  fetchStub.install()
})

test.afterEach(() => {
  unmountProbes()
  fetchStub.restore()
  delete reactiveSearchParams._t_primary
  delete reactiveSearchParams._t_secondary
})

test.describe('useElementUrls — dFrameSrc', () => {
  test('tablePreview: URL on the element\'s dataset', () => {
    const { dFrameSrc } = setup(el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }))
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/ds1\/table\?/)
  })

  test('tablePreview without dataset: falls back on the root dataset', () => {
    const fallback = computed(() => ({ id: 'root', title: 'Root', href: 'h' }))
    const { dFrameSrc } = setup(el({ type: 'tablePreview' }), { fallbackDataset: fallback })
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/root\/table\?/)
  })

  test('tablePreview without dataset nor fallback: undefined', () => {
    const fallback = computed(() => undefined)
    const { dFrameSrc } = setup(el({ type: 'tablePreview' }), { fallbackDataset: fallback })
    expect(dFrameSrc.value).toBeUndefined()
  })

  test('download: URL on the element\'s dataset', () => {
    const { dFrameSrc } = setup(el({ type: 'download', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }))
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/ds1\/download\?/)
  })

  test('download without dataset: falls back on the root dataset', () => {
    const fallback = computed(() => ({ id: 'root', title: 'Root', href: 'h' }))
    const { dFrameSrc } = setup(el({ type: 'download' }), { fallbackDataset: fallback })
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/root\/download\?/)
  })

  test('download without dataset nor fallback: undefined', () => {
    const fallback = computed(() => undefined)
    const { dFrameSrc } = setup(el({ type: 'download' }), { fallbackDataset: fallback })
    expect(dFrameSrc.value).toBeUndefined()
  })

  test('form: URL on the element\'s dataset', () => {
    const { dFrameSrc } = setup(el({ type: 'form', dataset: { id: 'form-ds', title: 'Form', href: 'h' } }))
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/form-ds\/form\?/)
  })

  test('form without dataset: undefined (invalid state)', () => {
    const { dFrameSrc } = setup(el({ type: 'form' }))
    expect(dFrameSrc.value).toBeUndefined()
  })

  test('application: /data-fair/app/ URL', () => {
    const { dFrameSrc } = setup(el({ type: 'application', application: { id: 'sankey', title: 'S', href: 'h', baseApp: { meta: {} } } }))
    expect(dFrameSrc.value).toBe('/data-fair/app/sankey?d-frame=true')
  })

  test('element without embed (text/column): undefined', () => {
    expect(setup(el({ type: 'text' })).dFrameSrc.value).toBeUndefined()
    expect(setup(el({ type: 'column' })).dFrameSrc.value).toBeUndefined()
  })

  test('prefixes the dataset id with the accessKey', () => {
    const config = useConfigValue({ accessKey: ref('abc') })
    const { dFrameSrc } = setup(el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }), {}, config)
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/abc%3Ads1\/table\?/)
  })

  test('propagates the _t_* theme override to every embed', () => {
    reactiveSearchParams._t_primary = 'FFEB3B'
    const elements = [
      el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }),
      el({ type: 'download', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }),
      el({ type: 'form', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }),
      el({ type: 'application', application: { id: 'sankey', title: 'S', href: 'h', baseApp: { meta: {} } } })
    ]
    for (const element of elements) {
      expect(setup(element).dFrameSrc.value).toContain('_t_primary=FFEB3B')
    }
  })
})

test.describe('useElementUrls — relayed filters', () => {
  const appEl = (id: string) => ({
    type: 'application',
    application: { id, title: id, href: 'h', baseApp: { meta: {} } }
  })

  test('an application receives the filters as-is', () => {
    const filters = { keys: [], _c_codeCommune_in: '86194' } as ApplicationFiltersValues
    const { dFrameSrc } = setup(appEl('sankey') as DashboardElement, { applicationFiltersValues: ref(filters) })
    expect(dFrameSrc.value).toContain('_c_codeCommune_in=86194')
  })

  test('a native embed receives the keys of its dataset (scope stripped), not those of another dataset', () => {
    const filters = {
      keys: [],
      _c_codeCommune_in: '86194',
      _d_ds1_dep_in: '75',
      _d_autre_x_in: '1'
    } as FiltersValues
    const { dFrameSrc } = setup(
      el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }),
      { datasetFiltersValues: ref(filters) }
    )
    expect(dFrameSrc.value).toContain('dep_in=75')
    expect(dFrameSrc.value).toContain('_c_codeCommune_in=86194')
    expect(dFrameSrc.value).not.toContain('_d_autre_x')
  })
})

test.describe('useElementUrls — capture, sources, description', () => {
  test('captureHref of an application with the df:capture metas', () => {
    const element = el({
      type: 'application',
      application: {
        id: 'sankey',
        title: 'S',
        href: 'https://demo/data-fair/app/sankey',
        baseApp: { meta: { 'df:capture-width': 1200, 'df:capture-height': 800 } }
      }
    })
    const filters = { keys: [], _d_ds1_int_in: '1' } as FiltersValues
    const { captureHref } = setup(element, { applicationFiltersValues: ref(filters) })
    expect(captureHref.value).toContain('https://demo/data-fair/app/sankey/capture?')
    expect(captureHref.value).toContain('app_embed=true')
    expect(captureHref.value).toContain('width=1200')
    expect(captureHref.value).toContain('app__d_ds1_int_in=1')
  })

  test('captureHref undefined for a non-application element', () => {
    expect(setup(el({ type: 'text' })).captureHref.value).toBeUndefined()
  })

  test('captureHref takes the application filters', () => {
    const element = el({
      type: 'application',
      application: {
        id: 'sankey',
        title: 'S',
        href: 'https://demo/data-fair/app/sankey',
        baseApp: { meta: {} }
      }
    })
    const filters = { keys: [], _d_ds1_int_in: '1' } as FiltersValues
    const { captureHref } = setup(element, { applicationFiltersValues: ref(filters) })
    expect(captureHref.value).toContain('app__d_ds1_int_in=1')
  })

  test('sourcesList of a tablePreview: its dataset', () => {
    const element = el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } })
    const { sourcesList } = setup(element)
    expect(sourcesList.value).toEqual([{ id: 'ds1', title: 'DS1', href: 'h' }])
  })

  test('sourcesList of a download: its dataset', () => {
    const element = el({ type: 'download', dataset: { id: 'ds1', title: 'DS1', href: 'h' } })
    const { sourcesList } = setup(element)
    expect(sourcesList.value).toEqual([{ id: 'ds1', title: 'DS1', href: 'h' }])
  })

  test('captureHref propagates the theme override', () => {
    reactiveSearchParams._t_primary = 'FFEB3B'
    const element = el({
      type: 'application',
      application: { id: 'sankey', title: 'S', href: 'https://demo/data-fair/app/sankey', baseApp: { meta: {} } }
    })
    const { captureHref } = setup(element)
    expect(captureHref.value).toContain('app__t_primary=FFEB3B')
  })

  test('sourcesList of an application: the app datasets (fetch)', async () => {
    fetchStub.on('/configuration', { json: { datasets: [{ id: 'a', title: 'A' }] } })
    const { sourcesList } = setup(
      el({ type: 'application', application: { id: 'sankey', title: 'S', href: 'h', baseApp: { meta: {} } } }),
      {},
      useConfigValue({ config: ref({ showSources: true }) })
    )
    await settle()
    expect(fetchStub.calls.map(c => c.url)).toEqual([expect.stringMatching(/\/configuration$/)])
    expect(sourcesList.value).toEqual([{ id: 'a', title: 'A' }])
  })

  test('descriptionHtml null for an element without description', () => {
    const { descriptionHtml } = setup(el({ type: 'text' }))
    expect(descriptionHtml.value).toBeNull()
  })
})
