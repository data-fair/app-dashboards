import type { DashboardConfig, DashboardElement, DashboardSection } from '@/config'
import { test, expect } from '@playwright/test'
import { fn, stubGlobal, unstubAllGlobals } from './helpers/spy'
import {
  flattenElements,
  extractReferencedApplications,
  extractReferencedDatasets,
  buildSyncDeltas,
  postConfigField
} from '@/utils/draft-sync'

const el = (element: { type: DashboardElement['type'] } & Record<string, unknown>): DashboardElement => element as unknown as DashboardElement

test.describe('flattenElements', () => {
  const section = (rows: DashboardSection['rows']): DashboardSection => ({ rows })

  test('returns [] without sections', () => {
    expect(flattenElements(undefined)).toEqual([])
  })

  test('returns [] for a section without rows', () => {
    expect(flattenElements([{ rows: undefined } as unknown as DashboardSection])).toEqual([])
  })

  test('returns [] for a row without elements', () => {
    expect(flattenElements([{ rows: [{ height: 0, elements: undefined }] } as unknown as DashboardSection])).toEqual([])
  })

  test('flattens simple elements', () => {
    const elements = flattenElements([
      section([{ height: 0, elements: [el({ type: 'text', content: 'a' }), el({ type: 'application' })] }])
    ])
    expect(elements).toHaveLength(2)
    expect(elements.map(e => e.type)).toEqual(['text', 'application'])
  })

  test('flattens nested columns (the inner elements replace the column)', () => {
    const inner1 = el({ type: 'tablePreview' })
    const inner2 = el({ type: 'form' })
    const elements = flattenElements([
      section([{ height: 0, elements: [el({ type: 'column', elements: [inner1, inner2] })] }])
    ])
    expect(elements).toEqual([inner1, inner2])
  })

  test('recursively flattens columns of columns', () => {
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
  test('collects the applications with id + title, deduplicates', () => {
    const app = (id: string, title = id) => ({ type: 'application', application: { id, title } })
    const refs = extractReferencedApplications([
      app('a', 'A'), app('a', 'A'), app('b', 'B'), el({ type: 'text' })
    ] as DashboardElement[])
    expect(refs).toEqual([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }])
  })

  test('ignores applications without id or without title', () => {
    expect(extractReferencedApplications([
      { type: 'application', application: { id: 'a' } },
      { type: 'application', application: { title: 'B' } }
    ] as unknown as DashboardElement[])).toEqual([])
  })
})

test.describe('extractReferencedDatasets', () => {
  const filtersDataset = { id: 'root', title: 'Root', href: '/root' }
  const ds = (id: string, title = id) => el({ type: 'tablePreview', dataset: { id, title, href: `/${id}` } })

  test('returns [] without filtersDataset', () => {
    expect(extractReferencedDatasets([ds('a')] as DashboardElement[], undefined)).toEqual([])
  })

  test('collects the datasets of tablePreview/download/form, excluding the root dataset, root first', () => {
    const refs = extractReferencedDatasets(
      [
        ds('a'),
        ds('root'),
        el({ type: 'download', dataset: { id: 'c', title: 'C', href: '/c' } }),
        el({ type: 'form', dataset: { id: 'b', title: 'B', href: '/b' } }),
        el({ type: 'text' })
      ] as DashboardElement[],
      filtersDataset
    )
    expect(refs).toEqual([
      { id: 'root', title: 'Root', href: '/root' },
      { id: 'a', title: 'a', href: '/a' },
      { id: 'c', title: 'C', href: '/c' },
      { id: 'b', title: 'B', href: '/b' }
    ])
  })

  test('deduplicates by id and ignores incomplete datasets', () => {
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

  test('returns {} without change', () => {
    expect(buildSyncDeltas(base, JSON.parse(JSON.stringify(base)))).toEqual({})
  })

  test('reports an applications delta when an application is added', () => {
    const next: DashboardConfig = JSON.parse(JSON.stringify(base))
    next.sections![0].rows[0].elements.push(el({ type: 'application', application: { id: 'b', title: 'B' } }))
    expect(buildSyncDeltas(base, next)).toEqual({
      applications: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]
    })
  })

  test('reports a datasets delta when an element dataset is added', () => {
    const next: DashboardConfig = JSON.parse(JSON.stringify(base))
    next.sections![0].rows[0].elements.push(el({ type: 'tablePreview', dataset: { id: 'ext', title: 'Ext', href: '/ext' } }))
    expect(buildSyncDeltas(base, next)).toEqual({
      datasets: [
        { id: 'root', title: 'Root', href: '/root' },
        { id: 'ext', title: 'Ext', href: '/ext' }
      ]
    })
  })

  test('reports no datasets delta if the config has no root dataset', () => {
    const prev = { applications: [{ id: 'a', title: 'A' }] }
    const next: DashboardConfig = JSON.parse(JSON.stringify(prev))
    next.sections = [{ rows: [{ height: 0, elements: [el({ type: 'application', application: { id: 'a', title: 'A' } })] }] }]
    expect(buildSyncDeltas(prev as DashboardConfig, next)).toEqual({})
  })

  test('reports an applications delta when next declares applications missing from prev', () => {
    const prev: DashboardConfig = { sections: base.sections }
    const next: DashboardConfig = JSON.parse(JSON.stringify(prev))
    next.applications = [{ id: 'a', title: 'A' }]
    expect(buildSyncDeltas(prev, next)).toEqual({
      applications: [{ id: 'a', title: 'A' }]
    })
  })

  test('reports no applications delta when prev and next declare the same ids', () => {
    const prev: DashboardConfig = { applications: [{ id: 'a', title: 'A' }], sections: base.sections }
    const next: DashboardConfig = JSON.parse(JSON.stringify(prev))
    // Only the ids are compared: a title change is not detected.
    next.applications = [{ id: 'a', title: 'A renommé' }]
    expect(buildSyncDeltas(prev, next)).toEqual({})
  })
})

test.describe('postConfigField', () => {
  test.afterEach(() => unstubAllGlobals())

  test('posts nothing when the app is the root page', () => {
    const postMessage = fn()
    const windowObj: any = { postMessage }
    windowObj.parent = windowObj
    stubGlobal('window', windowObj)
    postConfigField('applications', [])
    expect(postMessage.calls).toHaveLength(0)
  })

  test('posts set-config to window.parent otherwise', () => {
    const postMessage = fn()
    stubGlobal('window', { parent: { postMessage }, postMessage } as any)
    postConfigField('applications', [{ id: 'a', title: 'A' }])
    expect(postMessage.calls).toContainEqual([
      { type: 'set-config', content: { field: 'applications', value: [{ id: 'a', title: 'A' }] } },
      '*'
    ])
  })
})
