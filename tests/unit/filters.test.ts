import { describe, it, expect } from 'vitest'
import {
  collectActiveFields,
  collectStaticFilterParams,
  fieldConcept,
  initDefaultFilterValues,
  mergeAndSortItems,
  computeMandatoryFilterIssues,
  buildValuesLabelsUrl
} from '@/utils/filters'
import type { DashboardConfig } from '@/config'

const fieldWithConcept = (key: string, concept: string) => ({ key, title: key, 'x-concept': { id: concept, title: concept } })
const plainField = (key: string) => ({ key, title: key })

describe('collectStaticFilterParams', () => {
  const fields = { dep: fieldWithConcept('dep', 'codeDepartement'), an: plainField('an') }

  it('build les clés dataset-scopées et les mirrore en _c_<concept>_<op>', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep', values: ['75', '92'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_in: '75,92',
      _c_codeDepartement_in: '75,92'
    })
  })

  it('gère nin avec mirror concept', () => {
    const config = { staticFilters: [{ type: 'nin', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_nin: '75',
      _c_codeDepartement_nin: '75'
    })
  })

  it('gère interval avec gte/lte et mirrors concept', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', minValue: '10', maxValue: '20' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_gte: '10',
      _d_ds1_dep_lte: '20',
      _c_codeDepartement_gte: '10',
      _c_codeDepartement_lte: '20'
    })
  })

  it('gère interval borné d\'un seul côté', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', minValue: '10' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_gte: '10',
      _c_codeDepartement_gte: '10'
    })
  })

  it('pas de clé _c_ pour un champ sans concept', () => {
    const config = { staticFilters: [{ type: 'in', field: 'an', values: ['2020'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_an_in: '2020'
    })
  })

  it('pas de mirror concept pour nin/interval sur un champ sans concept', () => {
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

  it('préfixe de colonne appliqué aux clés dataset-scopées mais pas aux clés concept', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', 'c', fields)).toEqual({
      c_d_ds1_dep_in: '75',
      _c_codeDepartement_in: '75'
    })
  })

  it('renvoie {} sans staticFilters', () => {
    expect(collectStaticFilterParams({} as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  it('ignore un type de staticFilter inconnu', () => {
    const config = { staticFilters: [{ type: 'eq', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  it('sérialise les valeurs vides en chaîne vide (mirror concept aussi émis)', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_in: '',
      _c_codeDepartement_in: ''
    })
    const configNin = { staticFilters: [{ type: 'nin', field: 'dep' }] }
    expect(collectStaticFilterParams(configNin as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_nin: '',
      _c_codeDepartement_nin: ''
    })
  })

  it('gère un interval borné par le haut uniquement, et un interval vide', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', maxValue: '20' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_lte: '20',
      _c_codeDepartement_lte: '20'
    })
    expect(collectStaticFilterParams({ staticFilters: [{ type: 'interval', field: 'dep' }] } as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })
})

describe('fieldConcept', () => {
  it('extrait l\'id du concept, undefined sinon', () => {
    expect(fieldConcept(fieldWithConcept('dep', 'codeDepartement'))).toBe('codeDepartement')
    expect(fieldConcept(plainField('an'))).toBeUndefined()
    expect(fieldConcept(undefined)).toBeUndefined()
  })
})

describe('collectActiveFields', () => {
  const filters = [
    { labelField: 'int' },
    { labelField: 'equipement' }
  ]

  it('collecte les champs ayant une valeur dans les params', () => {
    const params = { _d_ds1_int_in: '1' }
    expect(collectActiveFields(filters as any, '', 'ds1', params)).toEqual(['int'])
  })

  it('respecte le préfixe', () => {
    const params = { c_d_ds1_int_in: '1' }
    expect(collectActiveFields(filters as any, 'c', 'ds1', params)).toEqual(['int'])
    expect(collectActiveFields(filters as any, '', 'ds1', params)).toEqual([])
  })

  it('renvoie [] sans filters', () => {
    expect(collectActiveFields(undefined, '', 'ds1', {})).toEqual([])
  })
})

describe('initDefaultFilterValues', () => {
  it('initialise la valeur de départ simple', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], 'ds1', params)
    expect(params._d_ds1_an_in).toBe('2020')
  })

  it('sérialise la valeur de départ multiple en CSV (chaque valeur entre guillemets)', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020', multipleValues: true }], 'ds1', params)
    // JSON.stringify(['2020']).slice(1,-1) → "2020" (citations conservées, relues par JSON.parse(`[...]`))
    expect(params._d_ds1_an_in).toBe('"2020"')
  })

  it('n\'écrase pas une valeur déjà présente', () => {
    const params: Record<string, string> = { _d_ds1_an_in: '2019' }
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], 'ds1', params)
    expect(params._d_ds1_an_in).toBe('2019')
  })

  it('ignore les filtres sans startValue', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an' }], 'ds1', params)
    expect(params).toEqual({})
  })

  it('tolère undefined en filtres', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues(undefined, 'ds1', params)
    expect(params).toEqual({})
  })

  it('tolère un datasetId indéfini (clé sans scope)', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], undefined, params)
    expect(params._d__an_in).toBe('2020')
  })
})

describe('mergeAndSortItems', () => {
  it('fusionne les valeurs sélectionnées absentes de la liste et trie par label', () => {
    const items = mergeAndSortItems(
      [{ value: 'b', label: 'Beta' }, { value: 'a', label: 'Alpha' }],
      '"c"',
      true
    )
    expect(items.map(i => i.value)).toEqual(['a', 'b', 'c'])
  })

  it('gère une sélection simple (non multiple)', () => {
    const items = mergeAndSortItems([{ value: 'x', label: 'X' }], 'z', false)
    expect(items.map(i => i.value)).toEqual(['x', 'z'])
  })

  it('renvoie [] sans données', () => {
    expect(mergeAndSortItems(null, undefined, true)).toEqual([])
    expect(mergeAndSortItems(undefined, undefined, false)).toEqual([])
  })

  it('ne duplique pas une valeur déjà présente dans la liste', () => {
    const items = mergeAndSortItems([{ value: 'a', label: 'Alpha' }], '"a"', true)
    expect(items).toEqual([{ value: 'a', label: 'Alpha' }])
  })

  it('trie sans label (comparaison sur les valeurs brutes)', () => {
    const items = mergeAndSortItems([{ value: 'z' }, { value: 'y' }], undefined, false)
    expect(items.map(i => i.value)).toEqual(['y', 'z'])
  })
})

describe('computeMandatoryFilterIssues', () => {
  const fields = { dep: fieldWithConcept('dep', 'codeDepartement') }

  it('résout les labels des filtres manquants', () => {
    const issues = computeMandatoryFilterIssues(
      { valueMandatory: true, mandatoryFilters: ['dep', 'an'] },
      [],
      fields
    )
    expect(issues).toEqual(['dep', 'an'])
  })

  it('ignore les filtres satisfaits (dans keys)', () => {
    const issues = computeMandatoryFilterIssues(
      { valueMandatory: true, mandatoryFilters: ['dep'] },
      ['dep'],
      fields
    )
    expect(issues).toEqual([])
  })

  it('renvoie [] sans valueMandatory ou sans mandatoryFilters', () => {
    expect(computeMandatoryFilterIssues({}, ['dep'], fields)).toEqual([])
    expect(computeMandatoryFilterIssues({ valueMandatory: true }, [], fields)).toEqual([])
  })
})

describe('buildValuesLabelsUrl', () => {
  const filter = { labelField: 'equipement' }
  const config: DashboardConfig = {}

  it('renvoie null sans dataset', () => {
    expect(buildValuesLabelsUrl(filter, undefined, 'https://x/href', config, '', undefined, undefined, {})).toBeNull()
    expect(buildValuesLabelsUrl(filter, 'ds1', undefined, config, '', undefined, undefined, {})).toBeNull()
  })

  it('build l\'URL minimale', () => {
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', config, '', undefined, undefined, {})!
    expect(url.startsWith('https://x/href/values-labels/equipement?')).toBe(true)
    expect(url).toContain('finalizedAt=')
    expect(url).toContain('stringify=true')
  })

  it('applique les autres filtres actifs', () => {
    const params = { _d_ds1_int_in: '1,2' }
    const cfg = { filters: [{ labelField: 'int' }, { labelField: 'equipement' }] }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, params)!
    expect(url).toContain('int_in=1%2C2')
  })

  it('applique les staticFilters (in/nin/interval)', () => {
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

  it('sérialise les staticFilters sans valeurs et les intervalles partiels', () => {
    const cfg = {
      staticFilters: [
        { type: 'in', field: 'dep' },
        { type: 'nin', field: 'reg' },
        { type: 'interval', field: 'an', minValue: '2010' },
        { type: 'interval', field: 'jour', maxValue: '2020' }
      ]
    }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).toContain('dep_in=')
    expect(url).toContain('reg_nin=')
    expect(url).toContain('an_gte=2010')
    expect(url).toContain('jour_lte=2020')
  })

  it('ajoute q=<search>* quand la recherche est active', () => {
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', config, '', 'vel', undefined, {})!
    expect(url).toContain('q=vel*')
  })

  it('ajoute size=1000 avec showAllValues (pas de q)', () => {
    const url = buildValuesLabelsUrl({ ...filter, showAllValues: true }, 'ds1', 'https://x/href', config, '', 'vel', undefined, {})!
    expect(url).toContain('size=1000')
    expect(url).not.toContain('q=')
  })

  it('ignore un type de staticFilter inconnu dans l\'URL', () => {
    const cfg = { staticFilters: [{ type: 'eq', field: 'dep', values: ['75'] }] }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).not.toContain('dep_')
  })

  it('ajoute _c_date_match et _c_geo_distance quand activés', () => {
    const cfg = { periodFilter: true, addressFilter: true }
    const params = { period: '2020-01-01,2020-12-31', radius: '5' }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, { lon: 1.5, lat: 48.8 }, params)!
    expect(url).toContain('_c_date_match=2020-01-01%2C2020-12-31')
    expect(url).toContain('_c_geo_distance=1.5%2C48.8%2C5000')
  })

  it('ajoute _c_date_match vide sans période définie, pas de géo sans adresse', () => {
    const cfg = { periodFilter: true, addressFilter: true }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).toContain('_c_date_match=')
    expect(url).not.toContain('_c_geo_distance')
  })
})
