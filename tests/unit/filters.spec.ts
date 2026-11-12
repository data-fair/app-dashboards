import type { DashboardConfig, DashboardFilter } from '@/config'
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import { test, expect } from '@playwright/test'
import {
  collectActiveFields,
  ownedFilterKeys,
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

const fieldWithConcept = (key: string, concept: string): Field =>
  ({ key, title: key, 'x-concept': { id: concept, title: concept } }) as Field
const plainField = (key: string): Field => ({ key, title: key }) as Field

test.describe('collectStaticFilterParams', () => {
  const fields = { dep: fieldWithConcept('dep', 'codeDepartement'), an: plainField('an') }

  test('builds the dataset-scoped keys and mirrors them as _c_<concept>_<op>', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep', values: ['75', '92'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_in: '75,92',
      _c_codeDepartement_in: '75,92'
    })
  })

  test('handles nin with concept mirror', () => {
    const config = { staticFilters: [{ type: 'nin', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_nin: '75',
      _c_codeDepartement_nin: '75'
    })
  })

  test('handles interval with gte/lte and concept mirrors', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', minValue: '10', maxValue: '20' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_gte: '10',
      _d_ds1_dep_lte: '20',
      _c_codeDepartement_gte: '10',
      _c_codeDepartement_lte: '20'
    })
  })

  test('handles an interval bounded on one side only', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', minValue: '10' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_gte: '10',
      _c_codeDepartement_gte: '10'
    })
  })

  test('no _c_ key for a field without concept', () => {
    const config = { staticFilters: [{ type: 'in', field: 'an', values: ['2020'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_an_in: '2020'
    })
  })

  test('no concept mirror for nin/interval on a field without concept', () => {
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

  test('column prefix applied to dataset-scoped keys but not to concept keys', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', 'c', fields)).toEqual({
      c_d_ds1_dep_in: '75',
      _c_codeDepartement_in: '75'
    })
  })

  test('returns {} without staticFilters', () => {
    expect(collectStaticFilterParams({} as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('ignores an unknown staticFilter type', () => {
    const config = { staticFilters: [{ type: 'eq', field: 'dep', values: ['75'] }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('omits a filter without values (filters2params semantics)', () => {
    const config = { staticFilters: [{ type: 'in', field: 'dep' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({})
    const configNin = { staticFilters: [{ type: 'nin', field: 'dep' }] }
    expect(collectStaticFilterParams(configNin as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('handles an interval bounded from above only, and an empty interval', () => {
    const config = { staticFilters: [{ type: 'interval', field: 'dep', maxValue: '20' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_lte: '20',
      _c_codeDepartement_lte: '20'
    })
    expect(collectStaticFilterParams({ staticFilters: [{ type: 'interval', field: 'dep' }] } as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('handles starts with concept mirror, and without value', () => {
    const config = { staticFilters: [{ type: 'starts', field: 'dep', value: '75' }] }
    expect(collectStaticFilterParams(config as DashboardConfig, 'ds1', '', fields)).toEqual({
      _d_ds1_dep_starts: '75',
      _c_codeDepartement_starts: '75'
    })
    expect(collectStaticFilterParams({ staticFilters: [{ type: 'starts', field: 'dep' }] } as DashboardConfig, 'ds1', '', fields)).toEqual({})
  })

  test('handles exists and notExists with the conventional space value', () => {
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
  test('extracts the concept id, undefined otherwise', () => {
    expect(fieldConcept(fieldWithConcept('dep', 'codeDepartement'))).toBe('codeDepartement')
    expect(fieldConcept(plainField('an'))).toBeUndefined()
    expect(fieldConcept(undefined)).toBeUndefined()
  })
})

test.describe('isRangeFilter', () => {
  test('true when slider is enabled', () => {
    expect(isRangeFilter({ labelField: 'tx', slider: true } as any)).toBe(true)
    expect(isRangeFilter({ labelField: 'tx' } as any)).toBe(false)
  })
})

test.describe('collectActiveFields', () => {
  const filters = [
    { labelField: 'int' },
    { labelField: 'equipement' }
  ]

  test('collects the fields that have a value in the params', () => {
    const params = { _d_ds1_int_in: '1' }
    expect(collectActiveFields(filters as any, '', 'ds1', params)).toEqual(['int'])
  })

  test('honors the prefix', () => {
    const params = { c_d_ds1_int_in: '1' }
    expect(collectActiveFields(filters as any, 'c', 'ds1', params)).toEqual(['int'])
    expect(collectActiveFields(filters as any, '', 'ds1', params)).toEqual([])
  })

  test('returns [] without filters', () => {
    expect(collectActiveFields(undefined, '', 'ds1', {})).toEqual([])
  })

  test('considers a range filter active when a gte/lte bound is present', () => {
    const sliders = [{ labelField: 'tx', slider: true }]
    expect(collectActiveFields(sliders as any, '', 'ds1', { _d_ds1_tx_gte: '10' })).toEqual(['tx'])
    expect(collectActiveFields(sliders as any, '', 'ds1', { _d_ds1_tx_lte: '20' })).toEqual(['tx'])
    expect(collectActiveFields(sliders as any, '', 'ds1', { _d_ds1_tx_gte: '10', _d_ds1_tx_lte: '20' })).toEqual(['tx'])
    expect(collectActiveFields(sliders as any, '', 'ds1', {})).toEqual([])
  })

  test('an active range filter honors the prefix', () => {
    const sliders = [{ labelField: 'tx', slider: true }]
    expect(collectActiveFields(sliders as any, 'c', 'ds1', { c_d_ds1_tx_gte: '10' })).toEqual(['tx'])
    expect(collectActiveFields(sliders as any, '', 'ds1', { c_d_ds1_tx_gte: '10' })).toEqual([])
  })
})

test.describe('initDefaultFilterValues', () => {
  test('initializes the simple start value', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], 'ds1', params)
    expect(params._d_ds1_an_in).toBe('2020')
  })

  test('serializes the multiple start value as CSV (each value quoted)', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020', multipleValues: true }], 'ds1', params)
    // JSON.stringify(['2020']).slice(1,-1) → "2020" (quotes kept, read back by JSON.parse(`[...]`))
    expect(params._d_ds1_an_in).toBe('"2020"')
  })

  test('does not overwrite an already present value', () => {
    const params: Record<string, string> = { _d_ds1_an_in: '2019' }
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], 'ds1', params)
    expect(params._d_ds1_an_in).toBe('2019')
  })

  test('ignores filters without startValue', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an' }], 'ds1', params)
    expect(params).toEqual({})
  })

  test('tolerates undefined filters', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues(undefined, 'ds1', params)
    expect(params).toEqual({})
  })

  test('tolerates an undefined datasetId (unscoped key)', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], undefined, params)
    expect(params._d__an_in).toBe('2020')
  })

  test('prefixes the key with the compare column prefix', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'an', startValue: '2020' }], 'ds1', params, 'c')
    expect(params.c_d_ds1_an_in).toBe('2020')
    expect(params._d_ds1_an_in).toBeUndefined()
  })

  test('range slider: writes min,max into the gte/lte keys', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'tx', slider: true, startValue: '10,20' }], 'ds1', params)
    expect(params._d_ds1_tx_gte).toBe('10')
    expect(params._d_ds1_tx_lte).toBe('20')
    expect(params._d_ds1_tx_in).toBeUndefined()
  })

  test('range slider: tolerates a single side and prefix', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'tx', slider: true, startValue: '10' }], 'ds1', params, 'c')
    expect(params.c_d_ds1_tx_gte).toBe('10')
    expect(params.c_d_ds1_tx_lte).toBeUndefined()
  })

  test('range slider: does not overwrite already present bounds', () => {
    const params: Record<string, string> = { _d_ds1_tx_gte: '5' }
    initDefaultFilterValues([{ labelField: 'tx', slider: true, startValue: '10,20' }], 'ds1', params)
    expect(params._d_ds1_tx_gte).toBe('5')
    expect(params._d_ds1_tx_lte).toBe('20')
  })

  test('range slider: ignored without startValue', () => {
    const params: Record<string, string> = {}
    initDefaultFilterValues([{ labelField: 'tx', slider: true }], 'ds1', params)
    expect(params).toEqual({})
  })
})

test.describe('mergeAndSortItems', () => {
  test('merges the selected values missing from the list and sorts by label', () => {
    const items = mergeAndSortItems(
      [{ value: 'b', label: 'Beta' }, { value: 'a', label: 'Alpha' }],
      '"c"',
      true
    )
    expect(items.map(i => i.value)).toEqual(['a', 'b', 'c'])
  })

  test('handles a single (non multiple) selection', () => {
    const items = mergeAndSortItems([{ value: 'x', label: 'X' }], 'z', false)
    expect(items.map(i => i.value)).toEqual(['x', 'z'])
    expect(items.find(i => i.value === 'z')?.label).toBe('z')
  })

  test('returns [] without data', () => {
    expect(mergeAndSortItems(null, undefined, true)).toEqual([])
    expect(mergeAndSortItems(undefined, undefined, false)).toEqual([])
  })

  test('does not duplicate a value already in the list', () => {
    const items = mergeAndSortItems([{ value: 'a', label: 'Alpha' }], '"a"', true)
    expect(items).toEqual([{ value: 'a', label: 'Alpha' }])
  })

  test('sorts without label (comparison on raw values)', () => {
    const items = mergeAndSortItems([{ value: 'z' }, { value: 'y' }], undefined, false)
    expect(items.map(i => i.value)).toEqual(['y', 'z'])
  })
})

test.describe('computeMandatoryFilterIssues', () => {
  const fields = { dep: fieldWithConcept('dep', 'codeDepartement') }

  test('resolves the labels of the missing filters', () => {
    const issues = computeMandatoryFilterIssues(
      { valueMandatory: true, mandatoryFilters: ['dep', 'an'] },
      [],
      fields
    )
    expect(issues).toEqual(['dep', 'an'])
  })

  test('ignores satisfied filters (in keys)', () => {
    const issues = computeMandatoryFilterIssues(
      { valueMandatory: true, mandatoryFilters: ['dep'] },
      ['dep'],
      fields
    )
    expect(issues).toEqual([])
  })

  test('returns [] without valueMandatory or without mandatoryFilters', () => {
    expect(computeMandatoryFilterIssues({}, ['dep'], fields)).toEqual([])
    expect(computeMandatoryFilterIssues({ valueMandatory: true }, [], fields)).toEqual([])
  })
})

test.describe('buildValuesLabelsUrl', () => {
  const filter = { labelField: 'equipement' }
  const config: DashboardConfig = {}

  test('returns null without dataset', () => {
    expect(buildValuesLabelsUrl(filter, undefined, 'https://x/href', config, '', undefined, undefined, {})).toBeNull()
    expect(buildValuesLabelsUrl(filter, 'ds1', undefined, config, '', undefined, undefined, {})).toBeNull()
  })

  test('builds the minimal URL', () => {
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', config, '', undefined, undefined, {})!
    expect(url.startsWith('https://x/href/values-labels/equipement?')).toBe(true)
    expect(url).not.toContain('finalizedAt')
    expect(url).toContain('stringify=true')
  })

  test('timestamps the URL with the dataset\'s finalizedAt', () => {
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', { datasets: [{ finalizedAt: 'F' }] } as DashboardConfig, '', undefined, undefined, {})!
    expect(url).toContain('finalizedAt=F')
  })

  test('applies the other active filters', () => {
    const params = { _d_ds1_int_in: '1,2' }
    const cfg = { filters: [{ labelField: 'int' }, { labelField: 'equipement' }] }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, params)!
    expect(url).toContain('int_in=1%2C2')
  })

  test('applies the staticFilters (in/nin/interval)', () => {
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

  test('applies the staticFilters starts/exists/notExists', () => {
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

  test('omits staticFilters without values and keeps partial intervals', () => {
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

  test('adds q=<search>* when the search is active', () => {
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', config, '', 'vel', undefined, {})!
    expect(url).toContain('q=vel*')
  })

  test('adds size=1000 with showAllValues (no q)', () => {
    const url = buildValuesLabelsUrl({ ...filter, showAllValues: true }, 'ds1', 'https://x/href', config, '', 'vel', undefined, {})!
    expect(url).toContain('size=1000')
    expect(url).not.toContain('q=')
  })

  test('ignores an unknown staticFilter type in the URL', () => {
    const cfg = { staticFilters: [{ type: 'eq', field: 'dep', values: ['75'] }] }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).not.toContain('dep_')
  })

  test('adds _c_date_match and _c_geo_distance when enabled', () => {
    const cfg = { periodFilter: true, addressFilter: true }
    const params = { period: '2020-01-01,2020-12-31', radius: '5' }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, { lon: 1.5, lat: 48.8 }, params)!
    expect(url).toContain('_c_date_match=2020-01-01%2C2020-12-31')
    expect(url).toContain('_c_geo_distance=1.5%2C48.8%2C5000')
  })

  test('adds an empty _c_date_match without a defined period, no geo without address', () => {
    const cfg = { periodFilter: true, addressFilter: true }
    const url = buildValuesLabelsUrl(filter, 'ds1', 'https://x/href', cfg as DashboardConfig, '', undefined, undefined, {})!
    expect(url).toContain('_c_date_match=')
    expect(url).not.toContain('_c_geo_distance')
  })
})

test.describe('buildMetricsUrl', () => {
  const slider = { labelField: 'tx', slider: true }

  test('returns null without dataset', () => {
    expect(buildMetricsUrl(slider, undefined, {})).toBeNull()
  })

  test('builds the minimal URL', () => {
    const url = buildMetricsUrl(slider, 'https://x/href', {})!
    expect(url.startsWith('https://x/href/simple_metrics_agg?')).toBe(true)
    expect(url).toContain('fields=tx')
    expect(url).toContain('metrics=min%2Cmax')
    expect(url).not.toContain('finalizedAt')
  })

  test('applies the staticFilters to bound on the filtered subset', () => {
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
  test('returns the labelFields without associated values', () => {
    expect(collectFilterEmitFields([{ labelField: 'a' }, { labelField: 'b' }])).toEqual(['a', 'b'])
  })

  test('unfolds the associated values and deduplicates', () => {
    expect(collectFilterEmitFields([
      { labelField: 'a', values: ['x', 'y'] },
      { labelField: 'b', values: ['y', 'z'] }
    ])).toEqual(['x', 'y', 'z'])
  })

  test('handles a mix of labelField / associated values', () => {
    expect(collectFilterEmitFields([
      { labelField: 'a' },
      { labelField: 'b', values: ['x'] }
    ])).toEqual(['a', 'x'])
  })

  test('returns [] without filter', () => {
    expect(collectFilterEmitFields([])).toEqual([])
  })

  test('ignores range slider filters (raw bounds, no /values)', () => {
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
  const config = { datasets: [{ id: 'ds1' }] } as DashboardConfig

  test('relays the concept keys, resolves the carrying field and ignores the rest', () => {
    const received = collectReceivedFilters({
      params: {
        _c_codeDepartement_in: '75',
        finalizedAt: 'F',
        'd-frame': 'true',
        q: 'x'
      },
      fields,
      config: {} as DashboardConfig
    })
    expect(received).toEqual({
      values: { _c_codeDepartement_in: '75' },
      fields: ['dep']
    })
  })

  test.describe('compare view columns', () => {
    const received = (params: Record<string, string>, prefix: string, otherColumnKeys?: Record<string, string>) =>
      collectReceivedFilters({ params, fields, config, prefix, otherColumnKeys }).values

    test('the right column receives its prefixed keys, unprefixed for the embeds', () => {
      expect(received({ c_d_ds1__id_eq: 'x', c_c_codeDepartement_in: '75' }, 'c')).toEqual({
        _d_ds1__id_eq: 'x',
        _c_codeDepartement_in: '75'
      })
    })

    test('the left column ignores the right column\'s keys', () => {
      expect(received({ c_d_ds1__id_eq: 'x' }, '')).toEqual({})
    })

    test('the right column ignores what the left column publishes', () => {
      const params = { _d_ds1__id_eq: 'x' }
      expect(received(params, 'c', { _d_ds1__id_eq: 'x' })).toEqual({})
    })

    test('a filter received from the parent reaches both columns', () => {
      const params = { _c_codeDepartement_in: '75' }
      expect(received(params, '')).toEqual(params)
      expect(received(params, 'c', {})).toEqual(params)
    })

    test('a right column key wins over the same key received from the parent', () => {
      expect(received({ c_c_codeDepartement_in: '44', _c_codeDepartement_in: '75' }, 'c')).toEqual({ _c_codeDepartement_in: '44' })
      expect(received({ _c_codeDepartement_in: '75', c_c_codeDepartement_in: '44' }, 'c')).toEqual({ _c_codeDepartement_in: '44' })
    })

    test('the right column\'s dynamic filter stays internal', () => {
      const filters = [{ labelField: 'an', values: ['an'] }] as DashboardFilter[]
      expect(collectReceivedFilters({ params: { c_d_ds1_an_in: '2022' }, fields, config, filters, prefix: 'c' }).values).toEqual({})
    })
  })

  test('relays the dataset-scoped keys of the root dataset and resolves their field', () => {
    const received = collectReceivedFilters({
      params: { _d_ds1_an_gte: '10', _d_ds1_dep_in: '75' },
      fields,
      config
    })
    expect(received).toEqual({
      values: { _d_ds1_an_gte: '10', _d_ds1_dep_in: '75' },
      fields: ['an', 'dep']
    })
  })

  test('relays the dataset-scoped keys of another dataset without resolving a field', () => {
    const received = collectReceivedFilters({
      params: { _d_autre_an_in: '2020' },
      fields,
      config
    })
    expect(received).toEqual({
      values: { _d_autre_an_in: '2020' },
      fields: []
    })
  })

  test('ignores legacy selection markers (_s_), unknown keys', () => {
    const received = collectReceivedFilters({
      params: { _s_codeDepartement: 'app_sankey', _s_ds1_an: 'app_table' },
      fields,
      config
    })
    expect(received).toEqual({ values: {}, fields: [] })
  })

  test('does not relay the internal keys of its dynamic filters (labels, quoted CSV)', () => {
    const filteredConfig = {
      datasets: [{ id: 'ds1' }],
      filters: [{ labelField: 'dep', values: ['dep'] }],
      periodFilter: true
    } as DashboardConfig
    const received = collectReceivedFilters({
      params: {
        _d_ds1_dep_in: '"75","92"',
        c_d_ds1_dep_in: '"75"',
        _d_ds1_dep_gte: '10',
        _c_date_match: '2019-01-01,2019-12-31'
      },
      fields,
      config: filteredConfig
    })
    // The resolved values of the filters go out through the serialization; a
    // dynamic filter key in the URL is never relayed as-is.
    expect(received).toEqual({
      values: { _c_date_match: '2019-01-01,2019-12-31' },
      fields: []
    })
  })

  test('relays universal concepts without field', () => {
    const received = collectReceivedFilters({
      params: { _c_date_match: '2020-01-01,2020-12-31' },
      fields,
      config
    })
    expect(received).toEqual({
      values: { _c_date_match: '2020-01-01,2020-12-31' },
      fields: []
    })
  })

  test('ignores empty values and unknown concepts', () => {
    const received = collectReceivedFilters({
      params: { _c_vide_in: '', _c_inconnu_in: '1' },
      fields,
      config
    })
    expect(received).toEqual({
      values: { _c_inconnu_in: '1' },
      fields: []
    })
  })
})

test.describe('ownedFilterKeys', () => {
  const fields = {
    dep: fieldWithConcept('dep', 'codeDepartement'),
    an: plainField('an')
  }

  test('covers dynamic filters, their associated values, static, period and geo', () => {
    const filters: DashboardFilter[] = [{ labelField: 'an' }, { labelField: 'dep', values: ['dep'] }, { labelField: 'tx', slider: true }]
    const config = {
      datasets: [{ id: 'ds1' }],
      filters,
      staticFilters: [{ type: 'in', field: 'dep', values: ['75'] }],
      periodFilter: true,
      addressFilter: true
    } as unknown as DashboardConfig
    const owned = ownedFilterKeys({ config, fields, filters })
    expect([...owned].sort()).toEqual([
      '_c_codeDepartement_in',
      '_c_date_match',
      '_c_geo_distance',
      '_d_ds1_an_in', '_d_ds1_an_gte', '_d_ds1_an_lte',
      '_d_ds1_dep_in', '_d_ds1_dep_gte', '_d_ds1_dep_lte',
      '_d_ds1_tx_in', '_d_ds1_tx_gte', '_d_ds1_tx_lte',
      'c_d_ds1_an_in', 'c_d_ds1_an_gte', 'c_d_ds1_an_lte',
      'c_d_ds1_dep_in', 'c_d_ds1_dep_gte', 'c_d_ds1_dep_lte',
      'c_d_ds1_tx_in', 'c_d_ds1_tx_gte', 'c_d_ds1_tx_lte',
      'finalizedAt'
    ].sort())
  })
})

test.describe('serializeFiltersValues', () => {
  const fields = {
    dep: fieldWithConcept('dep', 'codeDepartement'),
    an: plainField('an')
  }

  test('emits the resolved values as dataset-scoped keys with concept mirror', () => {
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

  test('applies the column prefix to the dataset-scoped keys', () => {
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

  test('adds period and geo when enabled', () => {
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

  test('does not emit period/geo when disabled or empty', () => {
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

  test('merges the staticFilters and always emits finalizedAt (even empty)', () => {
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

  test('an active dynamic filter wins over a static in on the same field', () => {
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

  test('an active range slider wins over a static interval on the same field', () => {
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

  test('emits the provided finalizedAt value', () => {
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

  test('ignores an emitField without resolved values', () => {
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

  test('emits the bounds of a range slider as gte/lte with concept mirror', () => {
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

  test('emits a single bound when the other is missing and applies the prefix', () => {
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

  test('ignores the empty bounds of a range slider', () => {
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

  test('relays a received concept filter without configured filter', () => {
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

  test('configured filters win over received filters', () => {
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
