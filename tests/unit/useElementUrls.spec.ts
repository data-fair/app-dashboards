import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useElementUrls } from '@/composables/useElementUrls'
import type { DashboardElement } from '@/config'
import type { FiltersValues } from '@/utils/filters'

const { useConfigMock, useFetchMock } = vi.hoisted(() => ({
  useConfigMock: vi.fn(),
  useFetchMock: vi.fn()
}))
vi.mock('@/composables/config', () => ({ useConfig: () => useConfigMock() }))
vi.mock('@data-fair/lib-vue/fetch.js', () => ({ useFetch: (...args: unknown[]) => useFetchMock(...args) }))

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
  useConfigMock.mockReturnValue(config)
  useFetchMock.mockImplementation((_url: unknown) => ({ data: ref(null) }))
  return useElementUrls({ element: ref(element), ...options })
}

describe('useElementUrls — dFrameSrc', () => {
  it('tablePreview : URL sur le dataset de l\'élément', () => {
    const { dFrameSrc } = setup(el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }))
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/ds1\/table\?/)
  })

  it('tablePreview sans dataset : retombe sur le dataset racine', () => {
    const fallback = computed(() => ({ id: 'root', title: 'Root', href: 'h' }))
    const { dFrameSrc } = setup(el({ type: 'tablePreview' }), { fallbackDataset: fallback })
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/root\/table\?/)
  })

  it('tablePreview sans dataset ni fallback : undefined', () => {
    const fallback = computed(() => undefined)
    const { dFrameSrc } = setup(el({ type: 'tablePreview' }), { fallbackDataset: fallback })
    expect(dFrameSrc.value).toBeUndefined()
  })

  it('form : URL sur le dataset de l\'élément', () => {
    const { dFrameSrc } = setup(el({ type: 'form', dataset: { id: 'form-ds', title: 'Form', href: 'h' } }))
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/form-ds\/form\?/)
  })

  it('form sans dataset : undefined (état invalide)', () => {
    const { dFrameSrc } = setup(el({ type: 'form' }))
    expect(dFrameSrc.value).toBeUndefined()
  })

  it('application : URL /data-fair/app/', () => {
    const { dFrameSrc } = setup(el({ type: 'application', application: { id: 'sankey', title: 'S', href: 'h', baseApp: { meta: {} } } }))
    expect(dFrameSrc.value).toBe('/data-fair/app/sankey?d-frame=true')
  })

  it('élément sans embed (text/column) : undefined', () => {
    expect(setup(el({ type: 'text' })).dFrameSrc.value).toBeUndefined()
    expect(setup(el({ type: 'column' })).dFrameSrc.value).toBeUndefined()
  })

  it('préfixe le dataset id avec l\'accessKey', () => {
    const config = useConfigValue({ accessKey: ref('abc') })
    const { dFrameSrc } = setup(el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } }), {}, config)
    expect(dFrameSrc.value).toMatch(/^\/data-fair\/embed\/dataset\/abc%3Ads1\/table\?/)
  })
})

describe('useElementUrls — capture, sources, description', () => {
  it('captureHref d\'une application avec les metas df:capture', () => {
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

  it('captureHref undefined pour un élément non-application', () => {
    expect(setup(el({ type: 'text' })).captureHref.value).toBeUndefined()
  })

  it('captureHref sans filtre quand ignoreFilters est vrai', () => {
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

  it('sourcesList d\'un tablePreview : son dataset', () => {
    const element = el({ type: 'tablePreview', dataset: { id: 'ds1', title: 'DS1', href: 'h' } })
    const { sourcesList } = setup(element)
    expect(sourcesList.value).toEqual([{ id: 'ds1', title: 'DS1', href: 'h' }])
  })

  it('sourcesList d\'une application : les datasets de l\'app (fetch)', () => {
    useConfigMock.mockReturnValue(useConfigValue())
    useFetchMock.mockImplementation((_url: unknown) => ({ data: ref({ datasets: [{ id: 'a', title: 'A' }] }) }))
    const { sourcesList } = useElementUrls({
      element: ref(el({ type: 'application', application: { id: 'sankey', title: 'S', href: 'h', baseApp: { meta: {} } } }))
    })
    expect(sourcesList.value).toEqual([{ id: 'a', title: 'A' }])
  })

  it('descriptionHtml null pour un élément sans description', () => {
    const { descriptionHtml } = setup(el({ type: 'text' }))
    expect(descriptionHtml.value).toBeNull()
  })
})
