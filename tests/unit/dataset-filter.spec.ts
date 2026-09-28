import { test, expect } from '@playwright/test'
import { datasetFilterKey, conceptFilterKey } from '@/utils/dataset-filter'

test.describe('datasetFilterKey', () => {
  test('build la clé dataset-scopée', () => {
    expect(datasetFilterKey('ds1', 'an')).toBe('_d_ds1_an_in')
  })

  test('ajoute le préfixe de colonne', () => {
    expect(datasetFilterKey('ds1', 'an', 'c')).toBe('c_d_ds1_an_in')
  })

  test('tolère un datasetId vide', () => {
    expect(datasetFilterKey('', 'an')).toBe('_d__an_in')
  })
})

test.describe('conceptFilterKey', () => {
  test('build la clé concept avec op par défaut in', () => {
    expect(conceptFilterKey('codeDepartement')).toBe('_c_codeDepartement_in')
  })

  test('supporte les autres opérateurs', () => {
    expect(conceptFilterKey('codeDepartement', 'nin')).toBe('_c_codeDepartement_nin')
    expect(conceptFilterKey('codeDepartement', 'eq')).toBe('_c_codeDepartement_eq')
    expect(conceptFilterKey('date', 'gte')).toBe('_c_date_gte')
    expect(conceptFilterKey('date', 'lte')).toBe('_c_date_lte')
  })
})
