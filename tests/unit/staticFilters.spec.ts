import { describe, it, expect } from 'vitest'
import { normalizeStaticFilters } from '@/utils/staticFilters'

describe('normalizeStaticFilters', () => {
  it('convertit field string en objet { key }', () => {
    expect(normalizeStaticFilters([{ type: 'in', field: 'dep', values: ['75'] }])).toEqual([
      { type: 'in', field: { key: 'dep' }, values: ['75'] }
    ])
  })

  it('mappe le type legacy nin vers out', () => {
    expect(normalizeStaticFilters([{ type: 'nin', field: 'dep', values: ['75'] }])).toEqual([
      { type: 'out', field: { key: 'dep' }, values: ['75'] }
    ])
  })

  it('laisse passer un field objet et les nouveaux types', () => {
    const filters = [
      { type: 'starts', field: { key: 'dep' }, value: '75' },
      { type: 'exists', field: { key: 'dep' } },
      { type: 'notExists', field: { key: 'dep' } }
    ]
    expect(normalizeStaticFilters(filters as any)).toEqual(filters)
  })

  it('retourne [] sans filtre ou avec des entrées invalides', () => {
    expect(normalizeStaticFilters(undefined)).toEqual([])
    expect(normalizeStaticFilters([])).toEqual([])
    expect(normalizeStaticFilters([null, { type: 'in' }] as any)).toEqual([])
  })
})
