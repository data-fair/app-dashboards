import { test, expect } from '@playwright/test'
import { datasetFilterKey, conceptFilterKey } from '@/utils/dataset-filter'

test.describe('datasetFilterKey', () => {
  test('builds the dataset-scoped key', () => {
    expect(datasetFilterKey('ds1', 'an')).toBe('_d_ds1_an_in')
  })

  test('adds the column prefix', () => {
    expect(datasetFilterKey('ds1', 'an', 'c')).toBe('c_d_ds1_an_in')
  })

  test('tolerates an empty datasetId', () => {
    expect(datasetFilterKey('', 'an')).toBe('_d__an_in')
  })
})

test.describe('conceptFilterKey', () => {
  test('builds the concept key with default op in', () => {
    expect(conceptFilterKey('codeDepartement')).toBe('_c_codeDepartement_in')
  })

  test('supports the other operators', () => {
    expect(conceptFilterKey('codeDepartement', 'nin')).toBe('_c_codeDepartement_nin')
    expect(conceptFilterKey('codeDepartement', 'eq')).toBe('_c_codeDepartement_eq')
    expect(conceptFilterKey('date', 'gte')).toBe('_c_date_gte')
    expect(conceptFilterKey('date', 'lte')).toBe('_c_date_lte')
  })
})
