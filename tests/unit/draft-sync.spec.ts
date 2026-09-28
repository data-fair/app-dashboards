import { test, expect } from '@playwright/test'
import { fn, stubGlobal, unstubAllGlobals } from './helpers/spy'
import {
  flattenElements,
  extractReferencedApplications,
  extractReferencedDatasets,
  buildSyncDeltas,
  postConfigField
} from '@/utils/draft-sync'
import type { DashboardConfig, DashboardElement, DashboardSection } from '@/config'

const el = (element: { type: DashboardElement['type'] } & Record<string, unknown>): DashboardElement => element as unknown as DashboardElement

test.describe('flattenElements', () => {
  const section = (rows: DashboardSection['rows']): DashboardSection => ({ rows })

  test('renvoie [] sans sections', () => {
    expect(flattenElements(undefined)).toEqual([])
  })

  test('renvoie [] pour une section sans rows', () => {
    expect(flattenElements([{ rows: undefined } as unknown as DashboardSection])).toEqual([])
  })

  test('renvoie [] pour une row sans elements', () => {
    expect(flattenElements([{ rows: [{ height: 0, elements: undefined }] } as unknown as DashboardSection])).toEqual([])
  })

  test('aplatit les éléments simples', () => {
    const elements = flattenElements([
      section([{ height: 0, elements: [el({ type: 'text', content: 'a' }), el({ type: 'application' })] }])
    ])
    expect(elements).toHaveLength(2)
    expect(elements.map(e => e.type)).toEqual(['text', 'application'])
  })

  test('aplatit les colonnes imbriquées (les éléments internes remplacent la colonne)', () => {
    const inner1 = el({ type: 'tablePreview' })
    const inner2 = el({ type: 'form' })
    const elements = flattenElements([
      section([{ height: 0, elements: [el({ type: 'column', elements: [inner1, inner2] })] }])
    ])
    expect(elements).toEqual([inner1, inner2])
  })

  test('aplatit récursivement les colonnes de colonnes', () => {
    const leaf = el({ type: 'application' })
    const nested = el({ type: 'column', elements: [leaf] })
    const deep = el({ type: 'column', elements: [nested, el({ type: 'text', content: 't' })] })
    const elements = flattenElements([
      section([{ height: 0, elements: [deep] }])
    ])
    expect(elements).toEqual([leaf, el({ type: 'text', content: 't' })])
  })
})

test.describe('extractReferencedApplications', () => {
  test('collecte les applications avec id + title, déduplique', () => {
    const app = (id: string, title = id) => ({ type: 'application', application: { id, title } })
    const refs = extractReferencedApplications([
      app('a', 'A'), app('a', 'A'), app('b', 'B'), el({ type: 'text' })
    ] as DashboardElement[])
    expect(refs).toEqual([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }])
  })

  test('ignore les applications sans id ou sans title', () => {
    expect(extractReferencedApplications([
      { type: 'application', application: { id: 'a' } },
      { type: 'application', application: { title: 'B' } }
    ] as unknown as DashboardElement[])).toEqual([])
  })
})

test.describe('extractReferencedDatasets', () => {
  const filtersDataset = { id: 'root', title: 'Root', href: '/root' }
  const ds = (id: string, title = id) => el({ type: 'tablePreview', dataset: { id, title, href: `/${id}` } })

  test('renvoie [] sans filtersDataset', () => {
    expect(extractReferencedDatasets([ds('a')] as DashboardElement[], undefined)).toEqual([])
  })

  test('collecte les datasets des tablePreview/form, hors dataset racine, racine en tête', () => {
    const refs = extractReferencedDatasets(
      [ds('a'), ds('root'), el({ type: 'form', dataset: { id: 'b', title: 'B', href: '/b' } }), el({ type: 'text' })] as DashboardElement[],
      filtersDataset
    )
    expect(refs).toEqual([
      { id: 'root', title: 'Root', href: '/root' },
      { id: 'a', title: 'a', href: '/a' },
      { id: 'b', title: 'B', href: '/b' }
    ])
  })

  test('déduplique par id et ignore les datasets incomplets', () => {
    const refs = extractReferencedDatasets(
      [ds('a'), ds('a'), el({ type: 'tablePreview', dataset: { id: 'x' } })],
      filtersDataset
    )
    expect(refs).toEqual([
      { id: 'root', title: 'Root', href: '/root' },
      { id: 'a', title: 'a', href: '/a' }
    ])
  })
})

test.describe('buildSyncDeltas', () => {
  const base: DashboardConfig = {
    applications: [{ id: 'a', title: 'A' }],
    datasets: [{ id: 'root', title: 'Root', href: '/root' }],
    sections: [{ rows: [{ height: 0, elements: [el({ type: 'application', application: { id: 'a', title: 'A' } })] }] }]
  } as any

  test('renvoie {} sans changement', () => {
    expect(buildSyncDeltas(base, JSON.parse(JSON.stringify(base)))).toEqual({})
  })

  test('signale un delta applications quand une application est ajoutée', () => {
    const next: DashboardConfig = JSON.parse(JSON.stringify(base))
    next.sections![0].rows[0].elements.push(el({ type: 'application', application: { id: 'b', title: 'B' } }))
    expect(buildSyncDeltas(base, next)).toEqual({
      applications: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]
    })
  })

  test('signale un delta datasets quand un dataset d\'élément est ajouté', () => {
    const next: DashboardConfig = JSON.parse(JSON.stringify(base))
    next.sections![0].rows[0].elements.push(el({ type: 'tablePreview', dataset: { id: 'ext', title: 'Ext', href: '/ext' } }))
    expect(buildSyncDeltas(base, next)).toEqual({
      datasets: [
        { id: 'root', title: 'Root', href: '/root' },
        { id: 'ext', title: 'Ext', href: '/ext' }
      ]
    })
  })

  test('ne signale pas de delta datasets si la config n\'a pas de dataset racine', () => {
    const prev = { applications: [{ id: 'a', title: 'A' }] }
    const next: DashboardConfig = JSON.parse(JSON.stringify(prev))
    next.sections = [{ rows: [{ height: 0, elements: [el({ type: 'application', application: { id: 'a', title: 'A' } })] }] }]
    expect(buildSyncDeltas(prev as DashboardConfig, next)).toEqual({})
  })

  test('signale un delta applications quand next déclare des applications absentes de prev', () => {
    const prev: DashboardConfig = { sections: base.sections }
    const next: DashboardConfig = JSON.parse(JSON.stringify(prev))
    next.applications = [{ id: 'a', title: 'A' }]
    expect(buildSyncDeltas(prev, next)).toEqual({
      applications: [{ id: 'a', title: 'A' }]
    })
  })

  test('ne signale pas de delta applications quand prev et next déclarent les mêmes ids', () => {
    const prev: DashboardConfig = { applications: [{ id: 'a', title: 'A' }], sections: base.sections }
    const next: DashboardConfig = JSON.parse(JSON.stringify(prev))
    // Seuls les ids sont comparés : un changement de titre n'est pas détecté.
    next.applications = [{ id: 'a', title: 'A renommé' }]
    expect(buildSyncDeltas(prev, next)).toEqual({})
  })
})

test.describe('postConfigField', () => {
  test.afterEach(() => unstubAllGlobals())

  test('ne poste rien quand l\'app est la page racine', () => {
    const postMessage = fn()
    const windowObj: any = { postMessage }
    windowObj.parent = windowObj
    stubGlobal('window', windowObj)
    postConfigField('applications', [])
    expect(postMessage.calls).toHaveLength(0)
  })

  test('poste set-config à window.parent sinon', () => {
    const postMessage = fn()
    stubGlobal('window', { parent: { postMessage }, postMessage } as any)
    postConfigField('applications', [{ id: 'a', title: 'A' }])
    expect(postMessage.calls).toContainEqual([
      { type: 'set-config', content: { field: 'applications', value: [{ id: 'a', title: 'A' }] } },
      '*'
    ])
  })
})
