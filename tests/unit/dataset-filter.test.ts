import { describe, it, expect } from 'vitest'
import { datasetFilterKey, datasetFilterKeyRegex, conceptFilterKey } from '@/utils/dataset-filter'

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

describe('datasetFilterKeyRegex', () => {
  it('capture prefix, datasetId et champ', () => {
    const match = 'c_d_ds1_an_in'.match(datasetFilterKeyRegex)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('c')
    expect(match![2]).toBe('ds1')
    expect(match![3]).toBe('an')
  })

  it('ne matche pas une clé non dataset-scopée', () => {
    expect('_c_date_match'.match(datasetFilterKeyRegex)).toBeNull()
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
