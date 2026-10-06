import { test, expect } from '@playwright/test'
import {
  collectActiveFields,
  collectFilterEmitFields,
  collectReceivedFilters,
  collectStaticFilterParams,
  fieldConcept,
  initDefaultFilterValues,
  isRangeFilter,
  mergeAndSortItems,
  computeMandatoryFilterIssues,
  buildMetricsUrl,
  buildValuesLabelsUrl,
  serializeFiltersValues
} from '@/utils/filters'
import type { DashboardConfig } from '@/config'
import type { Field } from '@data-fair/lib-common-types/application/index.js'

const fieldWithConcept = (key: string, concept: string): Field =>
  ({ key, title: key, 'x-concept': { id: concept, title: concept } }) as Field
const plainField = (key: string): Field => ({ key, title: key }) as Field

test.describe('collectStaticFilterParams', () => {
  const fields = { dep: fieldWithConcept('dep', 'codeDepartement'), an: plainField('an') }

  test('build les clés dataset-scopées et les mirrore en _c_<concept>_<op>', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep', values: ['75', '92'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_in: '75,92',
      _c_codeDepartement_in: '75,92'
    })
  })

  test('gère nin avec mirror concept', () => {
    const config = { staticFilters: [{ type: 'nin', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_nin: '75',
      _c_codeDepartement_nin: '75'
    })
  })

  test('gère interval avec gte/lte et mirrors concept', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', minValue: '10', maxValue: '20' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_gte: '10',
      _d_ds1_dep_lte: '20',
      _c_codeDepartement_gte: '10',
      _c_codeDepartement_lte: '20'
    })
  })

  test('gère interval borné d\'un seul côté', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', minValue: '10' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_gte: '10',
      _c_codeDepartement_gte: '10'
    })
  })

  test('pas de clé _c_ pour un champ sans concept', () => {
    const config = { staticFilters: [{ type: 'in', field: 'an', values: ['2020'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_an_in: '2020'
    })
  })

  test('pas de mirror concept pour nin/interval sur un champ sans concept', () => {
    const config = {
      staticFilters: [
        { type: 'nin', field: 'an', values: ['2020'] },
        { type: 'interval', field: 'an', minValue: '10', maxValue: '20' }
      ]
    }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_an_nin: '2020',
      _d_ds1_an_gte: '10',
      _d_ds1_an_lte: '20'
    })
  })

  test('préfixe de colonne appliqué aux clés dataset-scopées mais pas aux clés concept', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', 'c', fields)).toEqual({
      c_d_ds1_dep_in: '75',
      _c_codeDepartement_in: '75'
    })
  })

  test('renvoie {} sans staticFilters', () => {
    expect(collectStaticFilterParams({} as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('ignore un type de staticFilter inconnu', () => {
    const config = { staticFilters: [{ type: 'eq', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('omet un filtre sans valeurs (sémantique filters2params)', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({})
    const configNin = { staticFilters: [{ type: 'nin', field: 'dep' }] }
    expect(collectStaticFilterParams(configNin as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('gère un interval borné par le haut uniquement, et un interval vide', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', maxValue: '20' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_lte: '20',
      _c_codeDepartement_lte: '20'
    })
    expect(collectStaticFilterParams({ staticFilters: [{ type: 'interval', field: 'dep' }] } as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('gère starts avec mirror concept, et sans valeur', () => {
    const config = { staticFilters: [{ type: 'starts', field: 'dep', value: '75' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_starts: '75',
      _c_codeDepartement_starts: '75'
    })
    expect(collectStaticFilterParams({ staticFilters: [{ type: 'starts', field: 'dep' }] } as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('gère exists et notExists avec la valeur conventionnelle espace', () => {
    const config = {
      staticFilters: [
        { type: 'exists', field: 'dep' },
        { type: 'notExists', field: 'an' }
      ]
    }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_exists: ' ',
      _c_codeDepartement_exists: ' ',
      _d_ds1_an_nexists: ' '
    })
  })
})

test.describe('fieldConcept', () => {
  test('extrait l\'id du concept, undefined sinon', () => {
    expect(fieldConcept(fieldWithConcept('dep', 'codeDepartement'))).toBe('codeDepartement')
    expect(fieldConcept(plainField('an'))).toBeUndefined()
    expect(fieldConcept(undefined)).toBeUndefined()
  })
})

test.describe('isRangeFilter', () => {
  test('vrai quand slider est activé', () => {
    expect(isRangeFilter({ labelField: 'tx', slider: true } as any)).toBe(true)
    expect(isRangeFilter({ labelField: 'tx' } as any)).toBe(false)
  })
})

test.describe('collectActiveFields', () => {
  const filters = [
    { labelField: 'int' },
    { labelField: 'equipement' }
  ]

  test('collecte les champs ayant une valeur dans les params', () => {
    const params = { _d_ds1_int_in: '1' }
    expect(collectActiveFields(filters as any, '', 'ds1', params)).toEqual(['int'])
  })

  test('respecte le préfixe', () => {
    const params = { c_d_ds1_int_in: '1' }
    expect(collectActiveFields(filters as any, 'c', 'ds1', params)).toEqual(['int'])
    expect(collectActiveFields(filters as any, '', 'ds1', params)).toEqual([])
  })

  test('renvoie [] sans filters', () => {
    expect(collectActiveFields(undefined, '', 'ds1', {})).toEqual([])
  })

  test('considère un filtre range actif quand une borne gte/lte est présente', () => {
    const sliders = [{ labelField: 'tx', slider: true }]
    expect(collectActiveFields(sliders as any, '', 'ds1', { _d_ds1_tx_gte: '10' })).toEqual(['tx'])
    expect(collectActiveFields(sliders as any, '', 'ds1', { _d_ds1_tx_lte: '20' })).toEqual(['tx'])
    expect(collectActiveFields(sliders as any, '', 'ds1', { _d_ds1_tx_gte: '10', _d_ds1_tx_lte: '20' })).toEqual(['tx'])
    expect(collectActiveFields(sliders as any, '', 'ds1', {})).toEqual([])
  })

  test('un filtre range actif respecte le préfixe', () => {
    const sliders = [{ labelField: 'tx', slider: true }]
    expect(collectActiveFields(sliders as any, 'c', 'ds1', { c_d_ds1_tx_gte: '10' })).toEqual(['tx'])
    expect(collectActiveFields(sliders as any, '', 'ds1', { c_d_ds1_tx_gte: '10' })).toEqual([])
  })
})

test.describe('initDefaultFilterValues', () => {
  test('initialise la valeur de départ simple', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], 'ds1', params)
    expect(params._d_ds1_an_in).toBe('2020')
  })

  test('sérialise la valeur de départ multiple en CSV (chaque valeur entre guillemets)', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020', multipleValues: true }], 'ds1', params)
    // JSON.stringify(['2020']).slice(1,-1) → "2020" (citations conservées, relues par JSON.parse(`[...]`))
    expect(params._d_ds1_an_in).toBe('"2020"')
  })

  test('n\'écrase pas une valeur déjà présente', () => {
    const params: Record<string, string> = { _d_ds1_an_in: '2019' }
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], 'ds1', params)
    expect(params._d_ds1_an_in).toBe('2019')
  })

  test('ignore les filtres sans startValue', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an' }], 'ds1', params)
    expect(params).toEqual({})
  })

  test('tolère undefined en filtres', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues(undefined, 'ds1', params)
    expect(params).toEqual({})
  })

  test('tolère un datasetId indéfini (clé sans scope)', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], undefined, params)
    expect(params._d__an_in).toBe('2020')
  })

  test('préfixe la clé avec le prefix de colonne compare', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], 'ds1', params, 'c')
    expect(params.c_d_ds1_an_in).toBe('2020')
    expect(params._d_ds1_an_in).toBeUndefined()
  })

  test('range slider: écrit min,max dans les clés gte/lte', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'tx', slider: true, startValue: '10,20' }], 'ds1', params)
    expect(params._d_ds1_tx_gte).toBe('10')
    expect(params._d_ds1_tx_lte).toBe('20')
    expect(params._d_ds1_tx_in).toBeUndefined()
  })

  test('range slider: tolère un seul côté et préfixe', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'tx', slider: true, startValue: '10' }], 'ds1', params, 'c')
    expect(params.c_d_ds1_tx_gte).toBe('10')
    expect(params.c_d_ds1_tx_lte).toBeUndefined()
  })

  test('range slider: n\'écrase pas les bornes déjà présentes', () => {
    const params: Record<string, string> = { _d_ds1_tx_gte: '5' }
    initDefaultFilterValues([{ labelField: 'tx', slider: true, startValue: '10,20' }], 'ds1', params)
    expect(params._d_ds1_tx_gte).toBe('5')
    expect(params._d_ds1_tx_lte).toBe('20')
  })

  test('range slider: ignore sans startValue', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'tx', slider: true }], 'ds1', params)
    expect(params).toEqual({})
  })
})

test.describe('mergeAndSortItems', () => {
  test('fusionne les valeurs sélectionnées absentes de la liste et trie par label', () => {
    const items = mergeAndSortItems(
      [{ value: 'b', label: 'Beta' }, { value: 'a', label: 'Alpha' }],
      '"c"',
      true
    )
    expect(items.map(i => i.value)).toEqual(['a', 'b', 'c'])
  })

  test('gère une sélection simple (non multiple)', () => {
    const items = mergeAndSortItems([{ value: 'x', label: 'X' }], 'z', false)
    expect(items.map(i => i.value)).toEqual(['x', 'z'])
    expect(items.find(i => i.value === 'z')?.label).toBe('z')
  })

  test('renvoie [] sans données', () => {
    expect(mergeAndSortItems(null, undefined, true)).toEqual([])
    expect(mergeAndSortItems(undefined, undefined, false)).toEqual([])
  })

  test('ne duplique pas une valeur déjà présente dans la liste', () => {
    const items = mergeAndSortItems([{ value: 'a', label: 'Alpha' }], '"a"', true)
    expect(items).toEqual([{ value: 'a', label: 'Alpha' }])
  })

  test('trie sans label (comparaison sur les valeurs brutes)', () => {
    const items = mergeAndSortItems([{ value: 'z' }, { value: 'y' }], undefined, false)
    expect(items.map(i => i.value)).toEqual(['y', 'z'])
  })
})

test.describe('computeMandatoryFilterIssues', () => {
  const fields = { dep: fieldWithConcept('dep', 'codeDepartement') }

  test('résout les labels des filtres manquants', () => {
    const issues = computeMandatoryFilterIssues(
      { valueMandatory: true, mandatoryFilters: ['dep', 'an'] },
      [],
      fields
    )
    expect(issues).toEqual(['dep', 'an'])
  })

  test('ignore les filtres satisfaits (dans keys)', () => {
    const issues = computeMandatoryFilterIssues(
      { valueMandatory: true, mandatoryFilters: ['dep'] },
      ['dep'],
      fields
    )
    expect(issues).toEqual([])
  })

  test('renvoie [] sans valueMandatory ou sans mandatoryFilters', () => {
    expect(computeMandatoryFilterIssues({}, ['dep'], fields)).toEqual([])
    expect(computeMandatoryFilterIssues({ valueMandatory: true }, [], fields)).toEqual([])
  })
})

test.describe('buildValuesLabelsUrl', () => {
  const filter = { labelField: 'equipement' }
  const config: DashboardConfig = {}

  test('renvoie null sans dataset', () => {
    expect(buildValuesLabelsUrl(filter, undefined, 'https://x/href', config, '', undefined, undefined, {})).toBeNull()
    expect(buildValuesLabelsUrl(filter, 'ds1', undefined, config, '', undefined, undefined, {})).toBeNull()
  })

  test('build l\'URL minimale', () => {
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', config, '', undefined, undefined, {})!
    expect(url.startsWith('https://x/href/values-labels/equipement?')).toBe(true)
    expect(url).not.toContain('finalizedAt')
    expect(url).toContain('stringify=true')
  })

  test('horodate l\'URL avec le finalizedAt du dataset', () => {
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', { datasets: [{ finalizedAt: 'F' }] } as DashboardConfig, '', undefined, undefined, {})!
    expect(url).toContain('finalizedAt=F')
  })

  test('applique les autres filtres actifs', () => {
    const params = { _d_ds1_int_in: '1,2' }
    const cfg = { filters: [{ labelField: 'int' }, { labelField: 'equipement' }] }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, params)!
    expect(url).toContain('int_in=1%2C2')
  })

  test('applique les staticFilters (in/nin/interval)', () => {
    const cfg = {
      staticFilters: [
        { type: 'in', field: 'dep', values: ['75'] },
        { type: 'nin', field: 'reg', values: ['idf'] },
        { type: 'interval', field: 'an', minValue: '2010', maxValue: '2020' }
      ]
    }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).toContain('dep_in=75')
    expect(url).toContain('reg_nin=idf')
    expect(url).toContain('an_gte=2010')
    expect(url).toContain('an_lte=2020')
  })

  test('applique les staticFilters starts/exists/notExists', () => {
    const cfg = {
      staticFilters: [
        { type: 'starts', field: 'dep', value: '75' },
        { type: 'exists', field: 'reg' },
        { type: 'notExists', field: 'an' }
      ]
    }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).toContain('dep_starts=75')
    expect(url).toContain('reg_exists=+')
    expect(url).toContain('an_nexists=+')
  })

  test('omet les staticFilters sans valeurs et garde les intervalles partiels', () => {
    const cfg = {
      staticFilters: [
        { type: 'in', field: 'dep' },
        { type: 'nin', field: 'reg' },
        { type: 'interval', field: 'an', minValue: '2010' },
        { type: 'interval', field: 'jour', maxValue: '2020' }
      ]
    }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).not.toContain('dep_')
    expect(url).not.toContain('reg_')
    expect(url).toContain('an_gte=2010')
    expect(url).toContain('jour_lte=2020')
  })

  test('ajoute q=<search>* quand la recherche est active', () => {
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', config, '', 'vel', undefined, {})!
    expect(url).toContain('q=vel*')
  })

  test('ajoute size=1000 avec showAllValues (pas de q)', () => {
    const url = buildValuesLabelsUrl({ ...filter, showAllValues: true }, 'ds1', 'https://x/href', config, '', 'vel', undefined, {})!
    expect(url).toContain('size=1000')
    expect(url).not.toContain('q=')
  })

  test('ignore un type de staticFilter inconnu dans l\'URL', () => {
    const cfg = { staticFilters: [{ type: 'eq', field: 'dep', values: ['75'] }] }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).not.toContain('dep_')
  })

  test('ajoute _c_date_match et _c_geo_distance quand activés', () => {
    const cfg = { periodFilter: true, addressFilter: true }
    const params = { period: '2020-01-01,2020-12-31', radius: '5' }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, { lon: 1.5, lat: 48.8 }, params)!
    expect(url).toContain('_c_date_match=2020-01-01%2C2020-12-31')
    expect(url).toContain('_c_geo_distance=1.5%2C48.8%2C5000')
  })

  test('ajoute _c_date_match vide sans période définie, pas de géo sans adresse', () => {
    const cfg = { periodFilter: true, addressFilter: true }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).toContain('_c_date_match=')
    expect(url).not.toContain('_c_geo_distance')
  })
})

test.describe('buildMetricsUrl', () => {
  const slider = { labelField: 'tx', slider: true }

  test('renvoie null sans dataset', () => {
    expect(buildMetricsUrl(slider, undefined, {})).toBeNull()
  })

  test('build l\'URL minimale', () => {
    const url = buildMetricsUrl(slider, 'https://x/href', {})!
    expect(url.startsWith('https://x/href/simple_metrics_agg?')).toBe(true)
    expect(url).toContain('fields=tx')
    expect(url).toContain('metrics=min%2Cmax')
    expect(url).not.toContain('finalizedAt')
  })

  test('applique les staticFilters pour borner sur le sous-ensemble filtré', () => {
    const cfg = {
      datasets: [{ finalizedAt: 'F' }],
      staticFilters: [
        { type: 'in', field: 'dep', values: ['75'] },
        { type: 'interval', field: 'an', minValue: '2010', maxValue: '2020' }
      ]
    } as DashboardConfig
    const url = buildMetricsUrl(slider, 'https://x/href', cfg)!
    expect(url).toContain('finalizedAt=F')
    expect(url).toContain('dep_in=75')
    expect(url).toContain('an_gte=2010')
    expect(url).toContain('an_lte=2020')
  })
})

test.describe('collectFilterEmitFields', () => {
  test('retourne les labelFields sans valeurs associées', () => {
    expect(collectFilterEmitFields([{ labelField: 'a' }, { labelField: 'b' }])).toEqual(['a', 'b'])
  })

  test('déplie les valeurs associées et déduplique', () => {
    expect(collectFilterEmitFields([
      { labelField: 'a', values: ['x', 'y'] },
      { labelField: 'b', values: ['y', 'z'] }
    ])).toEqual(['x', 'y', 'z'])
  })

  test('gère un mélange labelField / valeurs associées', () => {
    expect(collectFilterEmitFields([
      { labelField: 'a' },
      { labelField: 'b', values: ['x'] }
    ])).toEqual(['a', 'x'])
  })

  test('retourne [] sans filtre', () => {
    expect(collectFilterEmitFields([])).toEqual([])
  })

  test('ignore les filtres range slider (bornes brutes, pas de /values)', () => {
    expect(collectFilterEmitFields([
      { labelField: 'tx', slider: true },
      { labelField: 'a' }
    ])).toEqual(['a'])
  })
})

test.describe('collectReceivedFilters', () => {
  const fields = {
    dep: fieldWithConcept('dep', 'codeDepartement'),
    an: plainField('an')
  }

  test('relaie les clés concept, résout le champ porteur et ignore le reste', () => {
    const received = collectReceivedFilters({
      _c_codeDepartement_in: '75',
      _d_ds1_dep_in: '75',
      finalizedAt: 'F',
      'd-frame': 'true',
      q: 'x'
    }, fields)
    expect(received).toEqual({
      values: { _c_codeDepartement_in: '75' },
      fields: ['dep']
    })
  })

  test('relaie les concepts universels sans champ', () => {
    const received = collectReceivedFilters({ _c_date_match: '2020-01-01,2020-12-31' }, fields)
    expect(received).toEqual({
      values: { _c_date_match: '2020-01-01,2020-12-31' },
      fields: []
    })
  })

  test('ignore les valeurs vides et les concepts inconnus', () => {
    const received = collectReceivedFilters({ _c_vide_in: '', _c_inconnu_in: '1' }, fields)
    expect(received).toEqual({
      values: { _c_inconnu_in: '1' },
      fields: []
    })
  })
})

test.describe('serializeFiltersValues', () => {
  const fields = {
    dep: fieldWithConcept('dep', 'codeDepartement'),
    an: plainField('an')
  }

  test('émet les valeurs résolues en clés dataset-scopées avec mirror concept', () => {
    const result = serializeFiltersValues({
      emitFields: ['dep', 'an'],
      activeFields: ['dep', 'an'],
      resolvedValues: { dep: ['75', '92'], an: ['2020'] },
      fields,
      config: {} as DashboardConfig,
      prefix: '',
      datasetId: 'ds1',
      finalizedAt: '2020-01-01'
    })
    expect(result).toEqual({
      keys: ['dep', 'an'],
      _d_ds1_dep_in: '"75","92"',
      _c_codeDepartement_in: '"75","92"',
      _d_ds1_an_in: '"2020"',
      finalizedAt: '2020-01-01'
    })
  })

  test('applique le préfixe de colonne sur les clés dataset-scopées', () => {
    const result = serializeFiltersValues({
      emitFields: ['dep'],
      activeFields: ['dep'],
      resolvedValues: { dep: ['75'] },
      fields,
      config: {} as DashboardConfig,
      prefix: 'c',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: ['dep'],
      c_d_ds1_dep_in: '"75"',
      _c_codeDepartement_in: '"75"',
      finalizedAt: ''
    })
  })

  test('ajoute période et géo quand activées', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: [],
      resolvedValues: {},
      fields,
      config: { periodFilter: true, addressFilter: true } as DashboardConfig,
      prefix: '',
      datasetId: 'ds1',
      period: '2020-01-01,2020-12-31',
      geoDistance: '1.5,48.8,5000'
    })
    expect(result).toEqual({
      keys: [],
      _c_date_match: '2020-01-01,2020-12-31',
      _c_geo_distance: '1.5,48.8,5000',
      finalizedAt: ''
    })
  })

  test('n\'émet pas période/géo si désactivées ou vides', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: [],
      resolvedValues: {},
      fields,
      config: {} as DashboardConfig,
      prefix: '',
      datasetId: 'ds1',
      period: '2020'
    })
    expect(result).toEqual({ keys: [], finalizedAt: '' })
    expect(result._c_date_match).toBeUndefined()
    expect(result._c_geo_distance).toBeUndefined()
  })

  test('fusionne les staticFilters et émet toujours finalizedAt (même vide)', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: [],
      resolvedValues: {},
      fields,
      config: { staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] } as DashboardConfig,
      prefix: '',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: [],
      _d_ds1_dep_in: '75',
      _c_codeDepartement_in: '75',
      finalizedAt: ''
    })
  })

  test('un filtre dynamique actif l\'emporte sur un static in du même champ', () => {
    const result = serializeFiltersValues({
      emitFields: ['dep'],
      activeFields: ['dep'],
      resolvedValues: { dep: ['75'] },
      fields,
      config: { staticFilters: [{ type: 'in', field: 'dep', values: ['75', '92'] }] } as DashboardConfig,
      prefix: '',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: ['dep'],
      _d_ds1_dep_in: '"75"',
      _c_codeDepartement_in: '"75"',
      finalizedAt: ''
    })
  })

  test('un range slider actif l\'emporte sur un static interval du même champ', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: ['tx'],
      resolvedValues: {},
      rangeValues: { tx: { min: '10', max: '20' } },
      fields: { tx: fieldWithConcept('tx', 'tauxPauvrete') },
      config: { staticFilters: [{ type: 'interval', field: 'tx', minValue: '0', maxValue: '100' }] } as DashboardConfig,
      prefix: '',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: ['tx'],
      _d_ds1_tx_gte: '10',
      _d_ds1_tx_lte: '20',
      _c_tauxPauvrete_gte: '10',
      _c_tauxPauvrete_lte: '20',
      finalizedAt: ''
    })
  })

  test('émet la valeur finalizedAt fournie', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: [],
      resolvedValues: {},
      fields,
      config: {} as DashboardConfig,
      prefix: '',
      datasetId: 'ds1',
      finalizedAt: '2020-01-01'
    })
    expect(result.finalizedAt).toBe('2020-01-01')
  })

  test('ignore un emitField sans valeurs résolues', () => {
    const result = serializeFiltersValues({
      emitFields: ['dep', 'an'],
      activeFields: ['dep'],
      resolvedValues: { dep: ['75'] },
      fields,
      config: {} as DashboardConfig,
      prefix: '',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: ['dep'],
      _d_ds1_dep_in: '"75"',
      _c_codeDepartement_in: '"75"',
      finalizedAt: ''
    })
  })

  test('émet les bornes d\'un range slider en gte/lte avec mirror concept', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: ['tx'],
      resolvedValues: {},
      rangeValues: { tx: { min: '10', max: '20' } },
      fields: { tx: fieldWithConcept('tx', 'tauxPauvrete') },
      config: {} as DashboardConfig,
      prefix: '',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: ['tx'],
      _d_ds1_tx_gte: '10',
      _d_ds1_tx_lte: '20',
      _c_tauxPauvrete_gte: '10',
      _c_tauxPauvrete_lte: '20',
      finalizedAt: ''
    })
  })

  test('émet une seule borne quand l\'autre est absente et applique le préfixe', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: ['tx'],
      resolvedValues: {},
      rangeValues: { tx: { min: '10' } },
      fields: { tx: plainField('tx') },
      config: {} as DashboardConfig,
      prefix: 'c',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: ['tx'],
      c_d_ds1_tx_gte: '10',
      finalizedAt: ''
    })
  })

  test('ignore les bornes vides d\'un range slider', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: [],
      resolvedValues: {},
      rangeValues: { tx: {} },
      fields: { tx: plainField('tx') },
      config: {} as DashboardConfig,
      prefix: '',
      datasetId: 'ds1'
    })
    expect(result).toEqual({ keys: [], finalizedAt: '' })
  })

  test('relaie un filtre concept reçu sans filtre configuré', () => {
    const result = serializeFiltersValues({
      emitFields: [],
      activeFields: [],
      resolvedValues: {},
      received: { values: { _c_codeCommune_in: '86222' }, fields: ['commune'] },
      fields,
      config: {} as DashboardConfig,
      prefix: '',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: ['commune'],
      _c_codeCommune_in: '86222',
      finalizedAt: ''
    })
  })

  test('les filtres configurés l\'emportent sur les filtres reçus', () => {
    const result = serializeFiltersValues({
      emitFields: ['dep'],
      activeFields: ['dep'],
      resolvedValues: { dep: ['75'] },
      received: { values: { _c_codeCommune_in: '86222', _c_codeDepartement_in: '92' }, fields: ['dep'] },
      fields,
      config: { staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] } as DashboardConfig,
      prefix: '',
      datasetId: 'ds1'
    })
    expect(result).toEqual({
      keys: ['dep'],
      _c_codeCommune_in: '86222',
      _d_ds1_dep_in: '"75"',
      _c_codeDepartement_in: '"75"',
      finalizedAt: ''
    })
  })
})
