import { test, expect } from '@playwright/test'
import {
  collectElementEmissions,
  collectEmissionsTargets,
  computeProjections,
  elementPropagation,
  emissionScope,
  emissionsSignature,
  isFilterKey,
  isMarkerKey,
  keyWithoutOp,
  markerKeyOf,
  projectEmissions,
  propagationsByApplicationId,
  seedProjected,
  stripEmissions
} from '@/utils/emissions'
import type { ApplicationElement, DashboardElement, DashboardSection, ElementPropagation, TablePreviewElement } from '@/config'

const app = (id: string, propagation?: ElementPropagation): ApplicationElement =>
  ({ type: 'application', application: { id, title: id, href: 'h', baseApp: { meta: {} } }, propagation })
const table = (): TablePreviewElement => ({ type: 'tablePreview' })

const sections = (rows: DashboardElement[][]): DashboardSection[] =>
  [{ rows: rows.map(elements => ({ elements })) }] as DashboardSection[]

test.describe('clés de filtre et marqueurs', () => {
  test('isFilterKey / isMarkerKey', () => {
    expect(isFilterKey('_c_codeDepartement_in')).toBe(true)
    expect(isFilterKey('_d_ds1_dep_in')).toBe(true)
    expect(isFilterKey('_s_codeDepartement')).toBe(false)
    expect(isMarkerKey('_s_codeDepartement')).toBe(true)
    expect(isMarkerKey('_c_codeDepartement_in')).toBe(false)
  })

  test('keyWithoutOp retire l\'opérateur REST, du plus long au plus court', () => {
    expect(keyWithoutOp('_c_codeDepartement_nin')).toBe('codeDepartement')
    expect(keyWithoutOp('_d_ds1_an_nexists')).toBe('ds1_an')
    expect(keyWithoutOp('_c_codeCommune')).toBe('codeCommune')
  })

  test('markerKeyOf mappe clé de filtre → marqueur', () => {
    expect(markerKeyOf('_c_codeCommune_in')).toBe('_s_codeCommune')
    expect(markerKeyOf('_d_ds1__id_eq')).toBe('_s_ds1__id')
    expect(markerKeyOf('_s_codeCommune')).toBeUndefined()
  })
})

test.describe('emissionScope', () => {
  test('préfixe la clé d\'instance en mode comparaison', () => {
    expect(emissionScope('', 'application-sankey')).toBe('application-sankey')
    expect(emissionScope('c', 'application-sankey')).toBe('c_application-sankey')
  })
})

test.describe('elementPropagation', () => {
  test('applique les défauts : sélection propagée en filtre, filtres simples non propagés', () => {
    expect(elementPropagation(app('sankey'))).toEqual({
      selection: 'filter',
      filter: false,
      applicationId: 'sankey'
    })
  })

  test('respecte la configuration explicite', () => {
    expect(elementPropagation(app('sankey', { selection: 'selection', filter: true }))).toEqual({
      selection: 'selection',
      filter: true,
      applicationId: 'sankey'
    })
    expect(elementPropagation(app('sankey', { selection: 'none' })).selection).toBe('none')
    expect(elementPropagation(table()).applicationId).toBeUndefined()
  })
})

test.describe('collectEmissionsTargets', () => {
  test('collecte applications et tables, avec les deux préfixes de colonne', () => {
    const targets = collectEmissionsTargets(sections([[app('a'), table()]]), ['', 'c'])
    expect(targets.map(t => t.scope)).toEqual(['application-a', 'c_application-a', 'tablePreview-root', 'c_tablePreview-root'])
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

test.describe('propagationsByApplicationId', () => {
  test('associe l\'id d\'application à sa propagation, première occurrence gagnante', () => {
    const rows = [[
      app('a', { selection: 'selection' }),
      app('a'),
      app('b', { selection: 'none', filter: true })
    ]]
    const byId = propagationsByApplicationId(sections(rows))
    expect(byId).toEqual({
      a: { selection: 'selection', filter: false, applicationId: 'a' },
      b: { selection: 'none', filter: true, applicationId: 'b' }
    })
  })
})

test.describe('collectElementEmissions', () => {
  test('dé-namespace les clés du scope, ignore les autres et les valeurs vides', () => {
    const params = {
      'application-a__c_codeCommune_in': '86194',
      'application-a__s_codeCommune': 'app_a',
      'application-a_page': '2',
      'application-a_vide': '',
      'application-b_page': '3',
      page: '1'
    }
    expect(collectElementEmissions(params, 'application-a')).toEqual({
      _c_codeCommune_in: '86194',
      _s_codeCommune: 'app_a',
      page: '2'
    })
  })
})

test.describe('projectEmissions', () => {
  const selection = {
    _c_codeCommune_in: '86194',
    _s_codeCommune: 'app_a',
    page: '2'
  }
  const filter = { _c_q: 'velo', page: '2' }

  test('en filtre : la sélection sort, marqueur inclus (retiré par récepteur)', () => {
    // Le marqueur est publié (auto-exclusion après rechargement) ; c'est le
    // `stripEmissions` de chaque récepteur qui décide de le retirer.
    expect(projectEmissions(selection, { selection: 'filter', filter: false })).toEqual({
      _c_codeCommune_in: '86194',
      _s_codeCommune: 'app_a'
    })
  })

  test('en sélection : identique', () => {
    expect(projectEmissions(selection, { selection: 'selection', filter: false })).toEqual({
      _c_codeCommune_in: '86194',
      _s_codeCommune: 'app_a'
    })
  })

  test('sans propagation : rien, pas même le marqueur', () => {
    expect(projectEmissions(selection, { selection: 'none', filter: false })).toEqual({})
    expect(projectEmissions({ ...selection, _d_ds1_an_in: '2020' }, { selection: 'none', filter: false })).toEqual({})
  })

  test('les filtres simples ne sortent que si filter est actif', () => {
    expect(projectEmissions(filter, { selection: 'filter', filter: false })).toEqual({})
    expect(projectEmissions(filter, { selection: 'filter', filter: true })).toEqual({ _c_q: 'velo' })
  })

  test('sans propagation de sélection, un filtre simple sort quand même si filter est actif', () => {
    expect(projectEmissions(filter, { selection: 'none', filter: true })).toEqual({ _c_q: 'velo' })
    expect(projectEmissions(selection, { selection: 'none', filter: true })).toEqual({})
  })

  test('un filtre marqué (sélection) suit la sélection, pas le booléen filter', () => {
    const marked = { _d_ds1_an_eq: '2020', _s_ds1_an: 'app_a' }
    expect(projectEmissions(marked, { selection: 'filter', filter: false })).toEqual(marked)
    expect(projectEmissions(marked, { selection: 'none', filter: true })).toEqual({})
  })

  test('ignore l\'état interne des visus', () => {
    expect(projectEmissions({ page: '2', sort: 'desc', _c_date_match: '2020-01-01,2020-12-31' }, { selection: 'filter', filter: false }))
      .toEqual({})
    expect(projectEmissions({ _c_date_match: '2020-01-01,2020-12-31' }, { selection: 'filter', filter: true }))
      .toEqual({ _c_date_match: '2020-01-01,2020-12-31' })
  })
})

test.describe('computeProjections', () => {
  const targets = [{ scope: 'application-a', selection: 'filter' as const, filter: false, applicationId: 'a' }]

  test('projette les émissions de chaque élément dans le namespace propre', () => {
    const params = { 'application-a__c_codeCommune_in': '86194', 'application-a__s_codeCommune': 'app_a' }
    expect(computeProjections(params, targets, new Set(), {})).toEqual({
      values: { _c_codeCommune_in: '86194', _s_codeCommune: 'app_a' },
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
      { scope: 'application-a', selection: 'filter' as const, filter: false },
      { scope: 'application-b', selection: 'filter' as const, filter: false }
    ]
    const params = { 'application-a__c_q': 'a', 'application-b__c_q': 'b' }
    const projected = computeProjections(params, both.map(t => ({ ...t, filter: true })), new Set(), {})
    expect(projected.values).toEqual({ _c_q: 'b' })
  })
})

test.describe('seedProjected', () => {
  test('adopte les clés propres qui doublonnent une émission d\'élément', () => {
    const targets = [{ scope: 'application-a', selection: 'filter' as const, filter: false }]
    const params = { 'application-a__c_q': 'a', _c_q: 'a', _c_codeCommune_in: '86194' }
    expect(seedProjected(params, targets)).toEqual({ _c_q: 'a' })
  })
})

test.describe('emissionsSignature', () => {
  const targets = [{ scope: 'application-a', selection: 'filter' as const, filter: false }, { scope: 'application-b', selection: 'filter' as const, filter: false }]

  test('suit les émissions des cibles, pas le reste de l\'URL', () => {
    const params: Record<string, string> = { 'application-a_page': '2', period: '2020-01-01,2020-12-31' }
    const before = emissionsSignature(params, targets)
    params['application-b_page'] = '3'
    const after = emissionsSignature(params, targets)
    expect(after).not.toBe(before)
    params.period = '2021-01-01,2021-12-31'
    expect(emissionsSignature(params, targets)).toBe(after)
  })

  test('change quand une propagation est reconfigurée', () => {
    const params = { 'application-a_page': '2' }
    const before = emissionsSignature(params, targets)
    expect(emissionsSignature(params, [
      { ...targets[0], selection: 'selection' },
      targets[1]
    ])).not.toBe(before)
    expect(emissionsSignature(params, [
      { ...targets[0], filter: true },
      targets[1]
    ])).not.toBe(before)
    expect(emissionsSignature(params, [
      { scope: 'application-b', selection: 'filter', filter: false },
      targets[1]
    ])).not.toBe(before)
  })
})

test.describe('stripEmissions', () => {
  const emitters = {
    a: { selection: 'filter' as const, filter: false, applicationId: 'a' },
    b: { selection: 'selection' as const, filter: false, applicationId: 'b' },
    c: { selection: 'none' as const, filter: false, applicationId: 'c' }
  }

  test('retire le marqueur d\'un émetteur « en filtre » pour les autres, le garde pour lui', () => {
    const filters = { _c_codeCommune_in: '86194', _s_codeCommune: 'app_a' }
    expect(stripEmissions(filters, { applicationId: 'z', emitters })).toEqual({ _c_codeCommune_in: '86194' })
    expect(stripEmissions(filters, { applicationId: 'a', emitters })).toEqual(filters)
  })

  test('garde le marqueur d\'un émetteur « en sélection »', () => {
    const filters = { _s_codeCommune: 'app_b' }
    expect(stripEmissions(filters, { applicationId: 'z', emitters })).toEqual(filters)
  })

  test('retire un marqueur « aucune propagation » et tout marqueur d\'un embed natif', () => {
    expect(stripEmissions({ _s_codeCommune: 'app_c' }, { applicationId: 'z', emitters })).toEqual({})
    expect(stripEmissions({ _c_codeCommune_in: '86194', _s_codeCommune: 'app_b' }, { nativeEmbed: true, emitters }))
      .toEqual({ _c_codeCommune_in: '86194' })
  })

  test('garde un marqueur posé par la page (valeur libre ou app inconnue)', () => {
    expect(stripEmissions({ _s_codeCommune: '86194' }, { applicationId: 'z', emitters })).toEqual({ _s_codeCommune: '86194' })
    expect(stripEmissions({ _s_codeCommune: 'app_inconnue' }, { applicationId: 'z', emitters })).toEqual({ _s_codeCommune: 'app_inconnue' })
  })
})
