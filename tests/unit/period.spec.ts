import { test, expect } from '@playwright/test'
import {
  dateToIso,
  formatPeriod,
  isIsoDate,
  isoToDate,
  parsePeriod
} from '@/utils/period'

test.describe('isIsoDate', () => {
  test('accepts a valid YYYY-MM-DD format', () => {
    expect(isIsoDate('2026-01-01')).toBe(true)
    expect(isIsoDate('2025-12-31')).toBe(true)
  })

  test('rejects invalid values', () => {
    expect(isIsoDate(undefined)).toBe(false)
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate('2026-1-1')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(true) // regex only: structure
    expect(isIsoDate('2026-01-01T10:00:00.000Z')).toBe(false)
    expect(isIsoDate('2026/01/01')).toBe(false)
  })
})

test.describe('dateToIso', () => {
  test('formats a local date without timezone shift', () => {
    expect(dateToIso(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dateToIso(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

test.describe('isoToDate', () => {
  test('parses a YYYY-MM-DD date as a local date (not UTC midnight)', () => {
    const date = isoToDate('2026-01-05')
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(0)
    expect(date?.getDate()).toBe(5)
  })

  test('returns undefined for an invalid value', () => {
    expect(isoToDate(undefined)).toBeUndefined()
    expect(isoToDate('nope')).toBeUndefined()
    expect(isoToDate('2026-13-40')).toBeUndefined()
  })
})

test.describe('parsePeriod', () => {
  test('parses a complete range', () => {
    expect(parsePeriod('2026-01-01,2026-12-31')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  test('interprets a single date as both bounds', () => {
    expect(parsePeriod('2026-01-01')).toEqual({ start: '2026-01-01', end: '2026-01-01' })
  })

  test('handles an empty or malformed value', () => {
    expect(parsePeriod(undefined)).toEqual({})
    expect(parsePeriod('')).toEqual({})
    expect(parsePeriod('2026-01-01,')).toEqual({ start: '2026-01-01' })
    expect(parsePeriod(',2026-06-30')).toEqual({ end: '2026-06-30' })
    expect(parsePeriod(',')).toEqual({})
    expect(parsePeriod('garbage')).toEqual({})
  })
})

test.describe('formatPeriod', () => {
  test('serializes a complete range', () => {
    expect(formatPeriod('2026-01-01', '2026-12-31')).toBe('2026-01-01,2026-12-31')
  })

  test('sorts the bounds so that start is the earliest', () => {
    expect(formatPeriod('2026-12-31', '2026-01-01')).toBe('2026-01-01,2026-12-31')
  })

  test('returns undefined if the range is incomplete or invalid', () => {
    expect(formatPeriod(undefined, undefined)).toBeUndefined()
    expect(formatPeriod('2026-01-01', undefined)).toBeUndefined()
    expect(formatPeriod(undefined, '2026-12-31')).toBeUndefined()
    expect(formatPeriod('', '2026-12-31')).toBeUndefined()
    expect(formatPeriod('2026-01-01', 'nope')).toBeUndefined()
  })
})
