import './helpers/dom'
import { test, expect } from '@playwright/test'
import { ref, computed } from 'vue'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { useElementUrls } from '@/composables/useElementUrls'
import type { DashboardElement } from '@/config'
import type { FiltersValues } from '@/utils/filters'
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
})

test.describe('useElementUrls — dFrameSrc', () => {
  test('tablePreview : URL sur le dataset de l\'élément', () => {
    const { dFrameSrc } = setup(el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }))
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/ds1\/table\?/)
  })

  test('tablePreview sans dataset : retombe sur le dataset racine', () => {
    const fallback = computed(() => ({ id: 'root', title: 'Root', href: 'h' }))
    const { dFrameSrc } = setup(el({ type: 'tablePreview' }), { fallbackDataset: fallback })
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/root\/table\?/)
  })

  test('tablePreview sans dataset ni fallback : undefined', () => {
    const fallback = computed(() => undefined)
    const { dFrameSrc } = setup(el({ type: 'tablePreview' }), { fallbackDataset: fallback })
    expect(dFrameSrc.value).toBeUndefined()
  })

  test('form : URL sur le dataset de l\'élément', () => {
    const { dFrameSrc } = setup(el({ type: 'form', dataset: { id: 'form-ds', title: 'Form', href: 'h' } }))
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/form-ds\/form\?/)
  })

  test('form sans dataset : undefined (état invalide)', () => {
    const { dFrameSrc } = setup(el({ type: 'form' }))
    expect(dFrameSrc.value).toBeUndefined()
  })

  test('application : URL /data-fair/app/', () => {
    const { dFrameSrc } = setup(el({ type: 'application', application: { id: 'sankey', title: 'S', href: 'h', baseApp: { meta: {} } } }))
    expect(dFrameSrc.value).toBe('/data-fair/app/sankey?d-frame=true')
  })

  test('élément sans embed (text/column) : undefined', () => {
    expect(setup(el({ type: 'text' })).dFrameSrc.value).toBeUndefined()
    expect(setup(el({ type: 'column' })).dFrameSrc.value).toBeUndefined()
  })

  test('préfixe le dataset id avec l\'accessKey', () => {
    const config = useConfigValue({ accessKey: ref('abc') })
    const { dFrameSrc } = setup(el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }), {}, config)
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/abc%3Ads1\/table\?/)
  })
})

test.describe('useElementUrls — capture, sources, description', () => {
  test('captureHref d\'une application avec les metas df:capture', () => {
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

  test('captureHref undefined pour un élément non-application', () => {
    expect(setup(el({ type: 'text' })).captureHref.value).toBeUndefined()
  })

  test('captureHref sans filtre quand ignoreFilters est vrai', () => {
    const element = el({
      type: 'application',
      ignoreFilters: true,
      application: {
        id: 'sankey',
        title: 'S',
        href: 'https://demo/data-fair/app/sankey',
        baseApp: { meta: { 'df:capture-width': 1200, 'df:capture-height': 800 } }
      }
    })
    const filters = { keys: [], _d_ds1_int_in: '1' } as FiltersValues
    const { captureHref } = setup(element, { applicationFiltersValues: ref(filters) })
    expect(captureHref.value).toContain('app_embed=true')
    expect(captureHref.value).toContain('width=1200')
    expect(captureHref.value).not.toContain('app__d_ds1_int_in')
  })

  test('sourcesList d\'un tablePreview : son dataset', () => {
    const element = el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } })
    const { sourcesList } = setup(element)
    expect(sourcesList.value).toEqual([{ id: 'ds1', title: 'DS1', href: 'h' }])
  })

  test('sourcesList d\'une application : les datasets de l\'app (fetch)', async () => {
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

  test('descriptionHtml null pour un élément sans description', () => {
    const { descriptionHtml } = setup(el({ type: 'text' }))
    expect(descriptionHtml.value).toBeNull()
  })
})
