import { test, expect } from '@playwright/test'
import {
  dateToIso,
  formatPeriod,
  isIsoDate,
  isoToDate,
  parsePeriod
} from '@/utils/period'

test.describe('isIsoDate', () => {
  test('accepte un format YYYY-MM-DD valide', () => {
    expect(isIsoDate('2026-01-01')).toBe(true)
    expect(isIsoDate('2025-12-31')).toBe(true)
  })

  test('refuse les valeurs invalides', () => {
    expect(isIsoDate(undefined)).toBe(false)
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate('2026-1-1')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(true) // regex only: structure
    expect(isIsoDate('2026-01-01T10:00:00.000Z')).toBe(false)
    expect(isIsoDate('2026/01/01')).toBe(false)
  })
})

test.describe('dateToIso', () => {
  test('formate une date locale sans décalage de fuseau', () => {
    expect(dateToIso(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dateToIso(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

test.describe('isoToDate', () => {
  test('parse une date YYYY-MM-DD en date locale (pas minuit UTC)', () => {
    const date = isoToDate('2026-01-05')
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(0)
    expect(date?.getDate()).toBe(5)
  })

  test('retourne undefined pour une valeur invalide', () => {
    expect(isoToDate(undefined)).toBeUndefined()
    expect(isoToDate('nope')).toBeUndefined()
    expect(isoToDate('2026-13-40')).toBeUndefined()
  })
})

test.describe('parsePeriod', () => {
  test('parse une plage complète', () => {
    expect(parsePeriod('2026-01-01,2026-12-31')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  test('interprète une date seule comme les deux bornes', () => {
    expect(parsePeriod('2026-01-01')).toEqual({ start: '2026-01-01', end: '2026-01-01' })
  })

  test('gère une valeur vide ou malformée', () => {
    expect(parsePeriod(undefined)).toEqual({})
    expect(parsePeriod('')).toEqual({})
    expect(parsePeriod('2026-01-01,')).toEqual({ start: '2026-01-01' })
    expect(parsePeriod(',2026-06-30')).toEqual({ end: '2026-06-30' })
    expect(parsePeriod(',')).toEqual({})
    expect(parsePeriod('garbage')).toEqual({})
  })
})

test.describe('formatPeriod', () => {
  test('sérialise une plage complète', () => {
    expect(formatPeriod('2026-01-01', '2026-12-31')).toBe('2026-01-01,2026-12-31')
  })

  test('tri les bornes pour que start soit la plus ancienne', () => {
    expect(formatPeriod('2026-12-31', '2026-01-01')).toBe('2026-01-01,2026-12-31')
  })

  test('retourne undefined si la plage est incomplète ou invalide', () => {
    expect(formatPeriod(undefined, undefined)).toBeUndefined()
    expect(formatPeriod('2026-01-01', undefined)).toBeUndefined()
    expect(formatPeriod(undefined, '2026-12-31')).toBeUndefined()
    expect(formatPeriod('', '2026-12-31')).toBeUndefined()
    expect(formatPeriod('2026-01-01', 'nope')).toBeUndefined()
  })
})
