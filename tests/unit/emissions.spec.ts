import { test, expect } from '@playwright/test'
import {
  collectElementEmissions,
  collectEmissionsTargets,
  computeProjections,
  elementSyncParams,
  emissionScope,
  emissionsSignature,
  isFilterKey,
  keyWithoutOp,
  nextEchoState,
  projectEmissions,
  seedProjected
} from '@/utils/emissions'
import type { EchoState, ElementSyncParams } from '@/utils/emissions'
import type { ApplicationElement, DashboardElement, DashboardSection, FormElement, SyncParams, TablePreviewElement } from '@/config'

const app = (id: string, syncParams?: SyncParams): ApplicationElement =>
  ({ type: 'application', application: { id, title: id, href: 'h', baseApp: { meta: {} } }, syncParams })
const table = (syncParams?: SyncParams): TablePreviewElement => ({ type: 'tablePreview', syncParams })
const form = (syncParams?: SyncParams): FormElement => ({ type: 'form', syncParams })

const sections = (rows: DashboardElement[][]): DashboardSection[] =>
  [{ rows: rows.map(elements => ({ elements })) }] as DashboardSection[]

test.describe('clés de filtre', () => {
  test('isFilterKey', () => {
    expect(isFilterKey('_c_codeDepartement_in')).toBe(true)
    expect(isFilterKey('_d_ds1_dep_in')).toBe(true)
    expect(isFilterKey('_s_codeDepartement')).toBe(false)
    expect(isFilterKey('page')).toBe(false)
  })

  test('keyWithoutOp retire l\'opérateur REST, du plus long au plus court', () => {
    expect(keyWithoutOp('_c_codeDepartement_nin')).toBe('codeDepartement')
    expect(keyWithoutOp('_d_ds1_an_nexists')).toBe('ds1_an')
    expect(keyWithoutOp('_c_codeCommune')).toBe('codeCommune')
  })
})

test.describe('emissionScope', () => {
  test('préfixe la clé d\'instance en mode comparaison', () => {
    expect(emissionScope('', 'application-sankey')).toBe('application-sankey')
    expect(emissionScope('c', 'application-sankey')).toBe('c_application-sankey')
  })
})

test.describe('elementSyncParams', () => {
  test('applique le défaut : partage des filtres', () => {
    expect(elementSyncParams(app('sankey'))).toBe('shared-filters')
    expect(elementSyncParams(table())).toBe('shared-filters')
    expect(elementSyncParams(form())).toBe('shared-filters')
  })

  test('respecte la configuration explicite', () => {
    expect(elementSyncParams(app('sankey', 'sandboxed'))).toBe('sandboxed')
    expect(elementSyncParams(app('sankey', 'none'))).toBe('none')
  })
})

test.describe('collectEmissionsTargets', () => {
  test('collecte applications, tables et formulaires, avec les deux préfixes de colonne', () => {
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
  })

  test('reprend le mode configuré de l\'élément', () => {
    const targets = collectEmissionsTargets(sections([[app('a', 'sandboxed')]]), [''])
    expect(targets).toEqual([{ scope: 'application-a', syncParams: 'sandboxed' }])
  })

  test('suit le chemin des colonnes et la déduplication par ligne', () => {
    const column = { type: 'column', elements: [app('a')] } as DashboardElement
    const targets = collectEmissionsTargets(sections([[column], [app('b'), app('b')]]), [''])
    expect(targets.map(t => t.scope)).toEqual(['column-0-application-a', 'application-b', 'application-b#1'])
  })

  test('ignore les types non embarquables et les sections absentes', () => {
    expect(collectEmissionsTargets(sections([[{ type: 'text', content: 'x' } as DashboardElement]]), [''])).toEqual([])
    expect(collectEmissionsTargets(undefined, [''])).toEqual([])
  })
})

test.describe('collectElementEmissions', () => {
  test('dé-namespace les clés du scope, ignore les autres et les valeurs vides', () => {
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

  test('shared-filters : publie les clés de filtre, ignore l\'état interne', () => {
    expect(projectEmissions(emissions, 'shared-filters')).toEqual({
      _c_codeCommune_in: '86194',
      _d_ds1_an_in: '2020'
    })
  })

  test('sandboxed / none : rien', () => {
    expect(projectEmissions(emissions, 'sandboxed')).toEqual({})
    expect(projectEmissions(emissions, 'none')).toEqual({})
  })
})

test.describe('computeProjections', () => {
  const targets = [{ scope: 'application-a', syncParams: 'shared-filters' as const }]

  test('projette les émissions de chaque élément dans le namespace propre', () => {
    const params = { 'application-a__c_codeCommune_in': '86194' }
    expect(computeProjections(params, targets, new Set(), {})).toEqual({
      values: { _c_codeCommune_in: '86194' },
      remove: []
    })
  })

  test('ne projette jamais une clé du dashboard (ses filtres gagnent)', () => {
    const params = { 'application-a__c_codeCommune_in': '86194' }
    expect(computeProjections(params, targets, new Set(['_c_codeCommune_in']), {})).toEqual({ values: {}, remove: [] })
  })

  test('retire une clé projetée dont l\'émission a disparu, en gardant la valeur d\'un autre écrivain', () => {
    const previous = { _c_codeCommune_in: '86194' }
    expect(computeProjections({}, targets, new Set(), previous)).toEqual({ values: {}, remove: ['_c_codeCommune_in'] })
    expect(computeProjections({ _c_codeCommune_in: '44109' }, targets, new Set(), previous)).toEqual({ values: {}, remove: [] })
  })

  test('le dernier émetteur gagne sur une clé partagée', () => {
    const both = [
      { scope: 'application-a', syncParams: 'shared-filters' as const },
      { scope: 'application-b', syncParams: 'shared-filters' as const }
    ]
    const params = { 'application-a__c_q': 'a', 'application-b__c_q': 'b' }
    expect(computeProjections(params, both, new Set(), {}).values).toEqual({ _c_q: 'b' })
  })

  test('un élément sandboxed ne publie rien mais garde ses clés namespacées', () => {
    const sandbox = [{ scope: 'application-a', syncParams: 'sandboxed' as const }]
    const params = { 'application-a__c_codeCommune_in': '86194' }
    expect(computeProjections(params, sandbox, new Set(), {})).toEqual({ values: {}, remove: [] })
  })

  test('un élément none voit ses clés namespacées résiduelles purgées', () => {
    const none = [{ scope: 'application-a', syncParams: 'none' as const }]
    const params = { 'application-a__c_codeCommune_in': '86194', 'application-b__c_q': 'b' }
    expect(computeProjections(params, none, new Set(), {})).toEqual({
      values: {},
      remove: ['application-a__c_codeCommune_in']
    })
  })
})

test.describe('écho d\'un filtre retiré', () => {
  // A émet, B le reçoit par sa src ; B renvoie en retard l'ancienne valeur
  // après le retrait (course du stateChange de d-frame), parfois en clignotant.
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

  test('le retrait mémorise la valeur et l\'élément qui l\'avait publiée', () => {
    const published = run({ 'application-a__c_q': 'x' }, shared, empty, {})
    expect(published.result.values).toEqual({ _c_q: 'x' })
    const withdrawn = run({ 'application-a__c_q': 'x' }, sandboxedA, published.state, published.result.values)
    expect(withdrawn.result.remove).toEqual(['_c_q'])
    expect(withdrawn.state.withdrawn).toEqual({ _c_q: { value: 'x', origins: ['application-a'] } })
  })

  test('l\'écho d\'un autre élément n\'est jamais republié, même s\'il clignote', () => {
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

  test('l\'émetteur qui efface puis resélectionne la même valeur la republie', () => {
    const published = run({ 'application-a__c_q': 'x' }, shared, empty, {})
    const cleared = run({}, shared, published.state, published.result.values)
    expect(cleared.result.remove).toEqual(['_c_q'])
    const reselected = run({ 'application-a__c_q': 'x' }, shared, cleared.state, {})
    expect(reselected.result.values).toEqual({ _c_q: 'x' })
    expect(reselected.state.withdrawn).toEqual({})
  })

  test('une autre valeur émise par un autre élément passe', () => {
    const state: EchoState = { sources: {}, withdrawn: { _c_q: { value: 'x', origins: ['application-a'] } } }
    expect(run({ 'application-b__c_q': 'y' }, shared, state, {}).result.values).toEqual({ _c_q: 'y' })
  })
})

test.describe('seedProjected', () => {
  test('adopte les clés propres qui doublonnent une émission d\'élément partagée', () => {
    const targets = [{ scope: 'application-a', syncParams: 'shared-filters' as const }]
    const params = { 'application-a__c_q': 'a', _c_q: 'a', _c_codeCommune_in: '86194' }
    expect(seedProjected(params, targets)).toEqual({ _c_q: 'a' })
  })

  test('n\'adopte rien pour un élément non partagé', () => {
    const targets = [{ scope: 'application-a', syncParams: 'sandboxed' as const }]
    expect(seedProjected({ 'application-a__c_q': 'a', _c_q: 'a' }, targets)).toEqual({})
  })
})

test.describe('emissionsSignature', () => {
  const targets = [
    { scope: 'application-a', syncParams: 'shared-filters' as const },
    { scope: 'application-b', syncParams: 'shared-filters' as const }
  ]

  test('suit les émissions des cibles, pas le reste de l\'URL', () => {
    const params: Record<string, string> = { 'application-a_page': '2', period: '2020-01-01,2020-12-31' }
    const before = emissionsSignature(params, targets)
    params['application-b_page'] = '3'
    const after = emissionsSignature(params, targets)
    expect(after).not.toBe(before)
    params.period = '2021-01-01,2021-12-31'
    expect(emissionsSignature(params, targets)).toBe(after)
  })

  test('change quand un mode de sync est reconfiguré ou qu\'une cible apparaît', () => {
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
