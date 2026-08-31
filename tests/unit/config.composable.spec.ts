import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createConfig, type ConfigState } from '@/composables/config'

const makeApplication = (overrides: Record<string, unknown> = {}) => ({
  id: 'dash',
  title: 'Dashboard',
  href: 'https://host/data-fair/app/dash',
  exposedUrl: 'https://host/app/abc%3Adash',
  apiUrl: 'https://host/data-fair/api/v1',
  wsUrl: 'wss://host/data-fair/api/v1',
  configuration: {
    datasets: [
      {
        id: 'ds1',
        title: 'DS1',
        href: 'https://host/ds1',
        finalizedAt: '2020-01-01',
        schema: [
          { key: 'dep', title: 'Département', 'x-concept': { id: 'codeDepartement', title: 'Code' } },
          { key: 'an', title: 'Année' }
        ]
      }
    ],
    filters: [{ labelField: 'dep' }],
    sections: [{ rows: [] }],
    ...overrides
  }
})

const send = (data: unknown, source: Window | null = window) => {
  window.dispatchEvent(new MessageEvent('message', { data, source }))
}

const createState = (application = makeApplication()): ConfigState => {
  (window as any).APPLICATION = application
  const cfg = createConfig()
  let state: ConfigState | undefined
  const app = { provide: (_key: string, s: unknown) => { state = s as ConfigState } }
  cfg.install(app as any)
  return state!
}

describe('createConfig', () => {
  beforeEach(() => {
    delete (window as any).APPLICATION
  })

  it('expose les computed config, dataset, datasets, fields, filters, sections', () => {
    const state = createState()
    expect(state.dataset.value?.id).toBe('ds1')
    expect(state.datasets.value.map(d => d.id)).toEqual(['ds1'])
    expect(Object.keys(state.fields.value)).toEqual(['dep', 'an'])
    expect(state.filters.value).toEqual([{ labelField: 'dep' }])
    expect(state.sections.value).toEqual([{ rows: [] }])
    expect(state.error.value).toBeNull()
  })

  it('compute l\'erreur de configuration', () => {
    const state = createState(makeApplication({ datasets: [{ id: 'ds1', title: 'DS1', href: 'h' }] }))
    expect(state.error.value).toBe('La source de données n\'a pas de schéma')
  })

  it('extrait l\'accessKey de l\'exposedUrl', () => {
    const state = createState()
    expect(state.accessKey.value).toBe('abc')
  })

  it('setConfig remplace la configuration', () => {
    const state = createState()
    state.setConfig({ datasets: [{ id: 'other', title: 'Other', href: 'h', schema: [] }] } as any)
    expect(state.dataset.value?.id).toBe('other')
  })

  it('install fournit l\'état et branche le listener de message', () => {
    const app = { provide: vi.fn() }
    const cfg = createConfig()
    const addEventListener = vi.spyOn(window, 'addEventListener')
    cfg.install(app as any)
    expect(app.provide).toHaveBeenCalledWith('data-fair-app-config', expect.objectContaining({
      dataset: expect.any(Object),
      config: expect.any(Object),
      accessKey: expect.any(Object)
    }))
    expect(addEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })
})

describe('createConfig — messages set-config', () => {
  it('fusionne un payload de configuration complet et retire les clés absentes', async () => {
    const state = createState()
    send({ type: 'set-config', content: { filters: [{ labelField: 'an' }], title: 'Nouveau' } })
    await nextTick()
    expect(state.config.value.filters).toEqual([{ labelField: 'an' }])
    expect(state.config.value.title).toBe('Nouveau')
    expect(state.config.value.sections).toBeUndefined()
  })

  it('met à jour un champ par path', async () => {
    const state = createState()
    send({ type: 'set-config', content: { field: 'datasets.0.title', value: 'Renommé' } })
    await nextTick()
    expect(state.config.value.datasets?.[0].title).toBe('Renommé')
  })

  it('accepte le format enveloppé { configuration }', async () => {
    const state = createState()
    send({ type: 'set-config', content: { configuration: { title: 'Enveloppé' } } })
    await nextTick()
    expect(state.config.value.title).toBe('Enveloppé')
  })

  it('ignore les messages dont la source n\'est pas le parent', async () => {
    const state = createState()
    send({ type: 'set-config', content: { title: 'X' } }, null)
    send({ type: 'other', content: { title: 'Y' } })
    send({ type: 'set-config' })
    await nextTick()
    expect(state.config.value.title).toBeUndefined()
  })
})
