import { describe, it, expect } from 'vitest'
import { datasetFilterKey, conceptFilterKey } from '@/utils/dataset-filter'

describe('datasetFilterKey', () => {
  it('build la clé dataset-scopée', () => {
    expect(datasetFilterKey('ds1', 'an')).toBe('_d_ds1_an_in')
  })

  it('ajoute le préfixe de colonne', () => {
    expect(datasetFilterKey('ds1', 'an', 'c')).toBe('c_d_ds1_an_in')
  })

  it('tolère un datasetId vide', () => {
    expect(datasetFilterKey('', 'an')).toBe('_d__an_in')
  })
})

describe('conceptFilterKey', () => {
  it('build la clé concept avec op par défaut in', () => {
    expect(conceptFilterKey('codeDepartement')).toBe('_c_codeDepartement_in')
  })

  it('supporte les autres opérateurs', () => {
    expect(conceptFilterKey('codeDepartement', 'nin')).toBe('_c_codeDepartement_nin')
    expect(conceptFilterKey('codeDepartement', 'eq')).toBe('_c_codeDepartement_eq')
    expect(conceptFilterKey('date', 'gte')).toBe('_c_date_gte')
    expect(conceptFilterKey('date', 'lte')).toBe('_c_date_lte')
  })
})
