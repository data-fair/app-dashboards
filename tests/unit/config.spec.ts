import type { DashboardConfig } from '@/config'
import { test, expect } from '@playwright/test'
import { setByPath, parseAccessKey, computeConfigError } from '@/utils/config'

test.describe('setByPath', () => {
  test('sets a value on an existing nested path', () => {
    const obj = { chart: { colors: ['#fff'] } }
    setByPath(obj, 'chart.colors.0', '#000')
    expect(obj).toEqual({ chart: { colors: ['#000'] } })
  })

  test('creates the missing intermediate objects', () => {
    const obj: Record<string, unknown> = {}
    setByPath(obj, 'a.b.c', 42)
    expect(obj).toEqual({ a: { b: { c: 42 } } })
  })

  test('does not mutate the original object along the path', () => {
    const original = { chart: { colors: ['#fff'], type: 'line' } }
    const clone = JSON.parse(JSON.stringify(original))
    setByPath(clone, 'chart.colors.0', '#000')
    expect(clone.chart.colors[0]).toBe('#000')
    expect(original.chart.colors[0]).toBe('#fff')
    expect(original.chart.type).toBe('line')
    expect(clone.chart.type).toBe('line')
  })

  test('overwrites an existing leaf', () => {
    const obj: Record<string, unknown> = { title: 'A' }
    setByPath(obj, 'title', 'B')
    expect(obj.title).toBe('B')
  })
})

test.describe('parseAccessKey', () => {
  test('extracts the key from a shared exposed URL', () => {
    expect(parseAccessKey('https://host/app/abc123%3Asankey')).toBe('abc123')
    expect(parseAccessKey('https://host/app/abc123%3Asankey?view=compare')).toBe('abc123')
  })

  test('returns null without key (no %3A)', () => {
    expect(parseAccessKey('https://host/app/sankey')).toBeNull()
    expect(parseAccessKey(undefined)).toBeNull()
    expect(parseAccessKey('')).toBeNull()
  })

  test('returns null when the URL contains several %3A', () => {
    expect(parseAccessKey('https://host/app/a%3Ab%3Ac')).toBeNull()
  })
})

test.describe('computeConfigError', () => {
  test('returns a message per invalid state, null if valid', () => {
    expect(computeConfigError(undefined)).toBe('Il n\'y a pas de configuration définie')
    expect(computeConfigError({} as DashboardConfig)).toBe('Veuillez choisir une source de données pour le filtre commun')
    expect(computeConfigError({ datasets: [{} as any] } as DashboardConfig)).toBe('La source de données n\'a pas de schéma')
    expect(computeConfigError({ datasets: [{ schema: [] }] } as unknown as DashboardConfig)).toBeNull()
  })
})
