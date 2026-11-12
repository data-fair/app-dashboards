import type { EchoState, ElementSyncParams } from '@/utils/emissions'
import type { ApplicationElement, DashboardElement, DashboardSection, FormElement, SyncParams, TablePreviewElement } from '@/config'
import { test, expect } from '@playwright/test'
import {
  collectElementEmissions,
  collectEmissionsTargets,
  collectSelectionEmissions,
  computeProjections,
  computeSelectionSync,
  elementSyncParams,
  emissionScope,
  emissionsSignature,
  isFilterKey,
  isSelectionKey,
  keyWithoutOp,
  nextEchoState,
  projectEmissions,
  publishedEmissions,
  seedProjected,
  selectionEmissionsState
} from '@/utils/emissions'

const app = (id: string, syncParams?: SyncParams): ApplicationElement =>
  ({ type: 'application', application: { id, title: id, href: 'h', baseApp: { meta: {} } }, syncParams })
const table = (syncParams?: SyncParams): TablePreviewElement => ({ type: 'tablePreview', syncParams })
const form = (syncParams?: SyncParams): FormElement => ({ type: 'form', syncParams })

const sections = (rows: DashboardElement[][]): DashboardSection[] =>
  [{ rows: rows.map(elements => ({ elements })) }] as DashboardSection[]

test.describe('filter keys', () => {
  test('isFilterKey', () => {
    expect(isFilterKey('_c_codeDepartement_in')).toBe(true)
    expect(isFilterKey('_d_ds1_dep_in')).toBe(true)
    expect(isFilterKey('_s_codeDepartement')).toBe(false)
    expect(isFilterKey('page')).toBe(false)
  })

  test('keyWithoutOp strips the REST operator, from longest to shortest', () => {
    expect(keyWithoutOp('_c_codeDepartement_nin')).toBe('codeDepartement')
    expect(keyWithoutOp('_d_ds1_an_nexists')).toBe('ds1_an')
    expect(keyWithoutOp('_c_codeCommune')).toBe('codeCommune')
  })
})

test.describe('emissionScope', () => {
  test('prefixes the instance key in compare view', () => {
    expect(emissionScope('', 'application-sankey')).toBe('application-sankey')
    expect(emissionScope('c', 'application-sankey')).toBe('c_application-sankey')
  })
})

test.describe('elementSyncParams', () => {
  test('applies the default: filter sharing', () => {
    expect(elementSyncParams(app('sankey'))).toBe('shared-filters')
    expect(elementSyncParams(table())).toBe('shared-filters')
    expect(elementSyncParams(form())).toBe('shared-filters')
  })

  test('honors the explicit configuration', () => {
    expect(elementSyncParams(app('sankey', 'sandboxed'))).toBe('sandboxed')
    expect(elementSyncParams(app('sankey', 'none'))).toBe('none')
  })
})

test.describe('collectEmissionsTargets', () => {
  test('collects applications, tables and forms, with both column prefixes', () => {
    const targets = collectEmissionsTargets(sections([[app('a'), table(), form()]]), ['', 'c'])
    expect(targets.map(t => t.scope)).toEqual([
      'application-a',
      'c_application-a',
      'tablePreview-root',
      'c_tablePreview-root',
      'form-root',
      'c_form-root'
    ])
    expect(targets.every(t => t.syncParams === 'shared-filters')).toBe(true)
    expect(targets.map(t => t.prefix)).toEqual(['', 'c', '', 'c', '', 'c'])
  })

  test('takes the configured mode of the element', () => {
    const targets = collectEmissionsTargets(sections([[app('a', 'sandboxed')]]), [''])
    expect(targets).toEqual([{ scope: 'application-a', prefix: '', syncParams: 'sandboxed' }])
  })

  test('follows the column path and the per-row deduplication', () => {
    const column = { type: 'column', elements: [app('a')] } as DashboardElement
    const targets = collectEmissionsTargets(sections([[column], [app('b'), app('b')]]), [''])
    expect(targets.map(t => t.scope)).toEqual(['column-0-application-a', 'application-b', 'application-b#1'])
  })

  test('ignores non-embeddable types and missing sections', () => {
    expect(collectEmissionsTargets(sections([[{ type: 'text', content: 'x' } as DashboardElement]]), [''])).toEqual([])
    expect(collectEmissionsTargets(undefined, [''])).toEqual([])
  })
})

test.describe('collectElementEmissions', () => {
  test('de-namespaces the scope keys, ignores the others and empty values', () => {
    const params = {
      'application-a__c_codeCommune_in': '86194',
      'application-a_page': '2',
      'application-a_vide': '',
      'application-b_page': '3',
      page: '1'
    }
    expect(collectElementEmissions(params, 'application-a')).toEqual({
      _c_codeCommune_in: '86194',
      page: '2'
    })
  })
})

test.describe('projectEmissions', () => {
  const emissions = { _c_codeCommune_in: '86194', _d_ds1_an_in: '2020', page: '2' }

  test('shared-filters: publishes the filter keys, ignores the internal state', () => {
    expect(projectEmissions(emissions, 'shared-filters')).toEqual({
      _c_codeCommune_in: '86194',
      _d_ds1_an_in: '2020'
    })
  })

  test('sandboxed / none: nothing', () => {
    expect(projectEmissions(emissions, 'sandboxed')).toEqual({})
    expect(projectEmissions(emissions, 'none')).toEqual({})
  })
})

test.describe('computeProjections', () => {
  const targets = [{ scope: 'application-a', syncParams: 'shared-filters' as const }]

  test('projects each element\'s emissions into the clean namespace', () => {
    const params = { 'application-a__c_codeCommune_in': '86194' }
    expect(computeProjections(params, targets, new Set(), {})).toEqual({
      values: { _c_codeCommune_in: '86194' },
      remove: []
    })
  })

  test('never projects a dashboard key (its filters win)', () => {
    const params = { 'application-a__c_codeCommune_in': '86194' }
    expect(computeProjections(params, targets, new Set(['_c_codeCommune_in']), {})).toEqual({ values: {}, remove: [] })
  })

  test('removes a projected key whose emission is gone, keeping another writer\'s value', () => {
    const previous = { _c_codeCommune_in: '86194' }
    expect(computeProjections({}, targets, new Set(), previous)).toEqual({ values: {}, remove: ['_c_codeCommune_in'] })
    expect(computeProjections({ _c_codeCommune_in: '44109' }, targets, new Set(), previous)).toEqual({ values: {}, remove: [] })
  })

  test('the last emitter wins on a shared key', () => {
    const both = [
      { scope: 'application-a', syncParams: 'shared-filters' as const },
      { scope: 'application-b', syncParams: 'shared-filters' as const }
    ]
    const params = { 'application-a__c_q': 'a', 'application-b__c_q': 'b' }
    expect(computeProjections(params, both, new Set(), {}).values).toEqual({ _c_q: 'b' })
  })

  test('a sandboxed element publishes nothing but keeps its namespaced keys', () => {
    const sandbox = [{ scope: 'application-a', syncParams: 'sandboxed' as const }]
    const params = { 'application-a__c_codeCommune_in': '86194' }
    expect(computeProjections(params, sandbox, new Set(), {})).toEqual({ values: {}, remove: [] })
  })

  test('a none element gets its residual namespaced keys purged', () => {
    const none = [{ scope: 'application-a', syncParams: 'none' as const }]
    const params = { 'application-a__c_codeCommune_in': '86194', 'application-b__c_q': 'b' }
    expect(computeProjections(params, none, new Set(), {})).toEqual({
      values: {},
      remove: ['application-a__c_codeCommune_in']
    })
  })
})

test.describe('echo of a withdrawn filter', () => {
  // A emits, B receives it through its src; B sends back the old value late
  // after the removal (d-frame stateChange race), sometimes flickering.
  const shared = [
    { scope: 'application-a', syncParams: 'shared-filters' as const },
    { scope: 'application-b', syncParams: 'shared-filters' as const }
  ]
  const sandboxedA = [{ ...shared[0], syncParams: 'sandboxed' as const }, shared[1]]
  const empty = { sources: {}, withdrawn: {} }
  const run = (params: Record<string, string>, targets: ElementSyncParams[], state: EchoState, previous: Record<string, string>) => {
    const result = computeProjections(params, targets, new Set(), previous, state.withdrawn)
    return { result, state: nextEchoState(params, targets, state, previous, result) }
  }

  test('the removal remembers the value and the element that had published it', () => {
    const published = run({ 'application-a__c_q': 'x' }, shared, empty, {})
    expect(published.result.values).toEqual({ _c_q: 'x' })
    const withdrawn = run({ 'application-a__c_q': 'x' }, sandboxedA, published.state, published.result.values)
    expect(withdrawn.result.remove).toEqual(['_c_q'])
    expect(withdrawn.state.withdrawn).toEqual({ _c_q: { value: 'x', origins: ['application-a'] } })
  })

  test('the echo of another element is never republished, even when it flickers', () => {
    let state: EchoState = { sources: {}, withdrawn: { _c_q: { value: 'x', origins: ['application-a'] } } }
    const steps: Record<string, string>[] = [
      { 'application-a__c_q': 'x', 'application-b__c_q': 'x' },
      { 'application-a__c_q': 'x' },
      { 'application-a__c_q': 'x', 'application-b__c_q': 'x' }
    ]
    for (const params of steps) {
      const step = run(params, sandboxedA, state, {})
      expect(step.result).toEqual({ values: {}, remove: [] })
      state = step.state
    }
  })

  test('the emitter that clears then reselects the same value republishes it', () => {
    const published = run({ 'application-a__c_q': 'x' }, shared, empty, {})
    const cleared = run({}, shared, published.state, published.result.values)
    expect(cleared.result.remove).toEqual(['_c_q'])
    const reselected = run({ 'application-a__c_q': 'x' }, shared, cleared.state, {})
    expect(reselected.result.values).toEqual({ _c_q: 'x' })
    expect(reselected.state.withdrawn).toEqual({})
  })

  test('another value emitted by another element goes through', () => {
    const state: EchoState = { sources: {}, withdrawn: { _c_q: { value: 'x', origins: ['application-a'] } } }
    expect(run({ 'application-b__c_q': 'y' }, shared, state, {}).result.values).toEqual({ _c_q: 'y' })
  })
})

test.describe('compare view columns', () => {
  const left = { scope: 'application-a', prefix: '', syncParams: 'shared-filters' as const }
  const right = { scope: 'c_application-a', prefix: 'c', syncParams: 'shared-filters' as const }
  const empty = { sources: {}, withdrawn: {} }

  test('the right column\'s emission is published under the column prefix', () => {
    const params = { 'c_application-a__d_ds1__id_eq': 'x', 'c_application-a__c_codeCommune_in': '86194' }
    expect(computeProjections(params, [left, right], new Set(), {})).toEqual({
      values: { c_d_ds1__id_eq: 'x', c_c_codeCommune_in: '86194' },
      remove: []
    })
  })

  test('the left column\'s emission stays in the clean namespace', () => {
    const params = { 'application-a__d_ds1__id_eq': 'x' }
    expect(computeProjections(params, [left, right], new Set(), {}).values).toEqual({ _d_ds1__id_eq: 'x' })
  })

  test('two columns each keep their own selection', () => {
    const params = { 'application-a__d_ds1__id_eq': 'x', 'c_application-a__d_ds1__id_eq': 'y' }
    expect(computeProjections(params, [left, right], new Set(), {}).values).toEqual({
      _d_ds1__id_eq: 'x',
      c_d_ds1__id_eq: 'y'
    })
  })

  test('a dashboard filter also wins on the right column', () => {
    const params = { 'c_application-a__c_codeCommune_in': '86194', 'c_application-a__d_ds1_an_in': '2022' }
    const owned = new Set(['_c_codeCommune_in', 'c_d_ds1_an_in'])
    expect(computeProjections(params, [left, right], owned, {}).values).toEqual({})
  })

  test('a selection cleared on the right is removed under its prefix and its echo recognized', () => {
    const published = computeProjections({ 'c_application-a__d_ds1__id_eq': 'x' }, [right], new Set(), {})
    const state = nextEchoState({ 'c_application-a__d_ds1__id_eq': 'x' }, [right], empty, {}, published)
    const cleared = computeProjections({}, [right], new Set(), published.values, state.withdrawn)
    expect(cleared.remove).toEqual(['c_d_ds1__id_eq'])
    const next = nextEchoState({}, [right], state, published.values, cleared)
    expect(next.withdrawn).toEqual({ c_d_ds1__id_eq: { value: 'x', origins: ['c_application-a'] } })
  })

  test('seedProjected adopts the prefixed key of a right column emission', () => {
    const params = { 'c_application-a__d_ds1__id_eq': 'x', c_d_ds1__id_eq: 'x' }
    expect(seedProjected(params, [right])).toEqual({ c_d_ds1__id_eq: 'x' })
  })

  test('publishedEmissions lists what a set of elements publishes', () => {
    const sandboxed = { scope: 'application-b', prefix: '', syncParams: 'sandboxed' as const }
    const params = { 'application-a__d_ds1__id_eq': 'x', 'application-a_page': '2', 'application-b__c_q': 'z' }
    expect(publishedEmissions(params, [left, sandboxed])).toEqual({ _d_ds1__id_eq: 'x' })
  })
})

test.describe('selection mirror between columns', () => {
  const left = { scope: 'application-map', prefix: '', syncParams: 'shared-filters' as const }
  const right = { scope: 'c_application-map', prefix: 'c', syncParams: 'shared-filters' as const }
  const state = (leftValue?: string, rightValue?: string): Record<string, Record<string, string>> => ({
    'application-map': leftValue === undefined ? {} : { _d_ds1__id_eq: leftValue },
    'c_application-map': rightValue === undefined ? {} : { _d_ds1__id_eq: rightValue }
  })

  test('isSelectionKey tells selection apart from camera/search state', () => {
    expect(isSelectionKey('_d_ds1__id_eq')).toBe(true)
    expect(isSelectionKey('_d_ds1__id_in')).toBe(true)
    expect(isSelectionKey('_c_codeCommune_in')).toBe(true)
    expect(isSelectionKey('_d_ds1_annee_in')).toBe(true)
    expect(isSelectionKey('_c_map_center')).toBe(false)
    expect(isSelectionKey('_c_q')).toBe(false)
    expect(isSelectionKey('_d_ds1_prix_gte')).toBe(false)
  })

  test('collects only the selection keys', () => {
    expect(collectSelectionEmissions({
      'application-map__d_ds1__id_eq': 'x',
      'application-map__d_ds1_annee_in': '2024',
      'application-map__c_map_center': '1,47',
      'application-map_page': '2'
    }, 'application-map')).toEqual({ _d_ds1__id_eq: 'x', _d_ds1_annee_in: '2024' })
  })

  test('only syncs the changes, last change wins', () => {
    const params = {
      view: 'compare',
      'application-map__d_ds1__id_eq': 'B',
      'c_application-map__d_ds1__id_eq': 'A'
    }
    expect(computeSelectionSync(params, [left, right], state('A', 'A'), new Set())).toEqual({
      set: { 'c_application-map__d_ds1__id_eq': 'B' },
      remove: []
    })
  })

  test('also syncs a change coming from the right column', () => {
    const params = {
      view: 'compare',
      'application-map__d_ds1__id_eq': 'A',
      'c_application-map__d_ds1__id_eq': 'C'
    }
    expect(computeSelectionSync(params, [left, right], state('A', 'A'), new Set())).toEqual({
      set: { 'application-map__d_ds1__id_eq': 'C' },
      remove: []
    })
  })

  test('propagates a clear both ways', () => {
    expect(computeSelectionSync({ view: 'compare', 'c_application-map__d_ds1__id_eq': 'A' }, [left, right], state('A', 'A'), new Set())).toEqual({
      set: {},
      remove: ['c_application-map__d_ds1__id_eq']
    })
    expect(computeSelectionSync({ view: 'compare', 'application-map__d_ds1__id_eq': 'A' }, [left, right], state('A', 'A'), new Set())).toEqual({
      set: {},
      remove: ['application-map__d_ds1__id_eq']
    })
  })

  test('never touches a key owned by the dashboard (year, static, period)', () => {
    const params = {
      view: 'compare',
      'application-map__d_ds1_annee_in': '2025',
      'c_application-map__d_ds1_annee_in': '2024'
    }
    expect(computeSelectionSync(params, [left, right], {
      'application-map': { _d_ds1_annee_in: '2024' },
      'c_application-map': { _d_ds1_annee_in: '2024' }
    }, new Set(['_d_ds1_annee_in']))).toEqual({ set: {}, remove: [] })
  })

  test('leaves the camera and the search in their column', () => {
    const params = {
      view: 'compare',
      'application-map__c_map_center': '2,48',
      'c_application-map__c_map_center': '1,47',
      'application-map__c_q': 'a',
      'c_application-map__c_q': 'b'
    }
    expect(computeSelectionSync(params, [left, right], {
      'application-map': { _c_map_center: '1,47', _c_q: 'x' },
      'c_application-map': { _c_map_center: '1,47', _c_q: 'y' }
    }, new Set())).toEqual({ set: {}, remove: [] })
  })

  test('ignores a non-shared element', () => {
    const sandboxed = { scope: 'application-map', prefix: '', syncParams: 'sandboxed' as const }
    const params = { view: 'compare', 'application-map__d_ds1__id_eq': 'B', 'c_application-map__d_ds1__id_eq': 'A' }
    expect(computeSelectionSync(params, [sandboxed, right], state('A', 'A'), new Set())).toEqual({ set: {}, remove: [] })
  })

  test('selectionEmissionsState keeps only the shared elements', () => {
    const sandboxed = { scope: 'application-sandbox', prefix: '', syncParams: 'sandboxed' as const }
    const params = {
      'application-map__d_ds1__id_eq': 'x',
      'c_application-map__d_ds1__id_eq': 'x',
      'application-sandbox__d_ds1__id_eq': 'y'
    }
    expect(selectionEmissionsState(params, [left, right, sandboxed])).toEqual({
      'application-map': { _d_ds1__id_eq: 'x' },
      'c_application-map': { _d_ds1__id_eq: 'x' }
    })
  })
})

test.describe('seedProjected', () => {
  test('adopts the clean keys that duplicate a shared element emission', () => {
    const targets = [{ scope: 'application-a', syncParams: 'shared-filters' as const }]
    const params = { 'application-a__c_q': 'a', _c_q: 'a', _c_codeCommune_in: '86194' }
    expect(seedProjected(params, targets)).toEqual({ _c_q: 'a' })
  })

  test('adopts nothing for a non-shared element', () => {
    const targets = [{ scope: 'application-a', syncParams: 'sandboxed' as const }]
    expect(seedProjected({ 'application-a__c_q': 'a', _c_q: 'a' }, targets)).toEqual({})
  })
})

test.describe('emissionsSignature', () => {
  const targets = [
    { scope: 'application-a', syncParams: 'shared-filters' as const },
    { scope: 'application-b', syncParams: 'shared-filters' as const }
  ]

  test('follows the targets\' emissions, not the rest of the URL', () => {
    const params: Record<string, string> = { 'application-a_page': '2', period: '2020-01-01,2020-12-31' }
    const before = emissionsSignature(params, targets)
    params['application-b_page'] = '3'
    const after = emissionsSignature(params, targets)
    expect(after).not.toBe(before)
    params.period = '2021-01-01,2021-12-31'
    expect(emissionsSignature(params, targets)).toBe(after)
  })

  test('changes when a sync mode is reconfigured or a target appears', () => {
    const params = { 'application-a_page': '2' }
    const before = emissionsSignature(params, targets)
    expect(emissionsSignature(params, [
      { ...targets[0], syncParams: 'sandboxed' },
      targets[1]
    ])).not.toBe(before)
    expect(emissionsSignature(params, [
      { scope: 'application-b', syncParams: 'shared-filters' },
      targets[1]
    ])).not.toBe(before)
  })
})
