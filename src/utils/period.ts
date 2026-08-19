/**
 * Pure helpers for the period filter serialization.
 *
 * The period is stored in the URL (`reactiveSearchParams.period`) and
 * broadcast to embeds as `_c_date_match` using the `YYYY-MM-DD,YYYY-MM-DD`
 * format expected by the data-fair REST API (see
 * `data-fair/api/src/datasets/es/commons.ts`). Only complete ranges are
 * emitted: an incomplete or malformed selection is dropped (the URL param is
 * removed) instead of producing broken values like `2026-01-01,` or
 * `,2026-06-30`.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface PeriodRange {
  start?: string
  end?: string
}

/** True when the value is a valid `YYYY-MM-DD` string. */
export const isIsoDate = (value: string | undefined): value is string => !!value && DATE_RE.test(value)

/**
 * Format a Date to a local `YYYY-MM-DD` string. Uses the local date
 * components so the result never shifts a day due to timezone conversion.
 */
export const dateToIso = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Parse a `YYYY-MM-DD` string into a local Date. Invalid values return
 * `undefined` (and are never interpreted as a UTC midnight, which could shift
 * the displayed day depending on the browser timezone).
 */
export const isoToDate = (iso: string | undefined): Date | undefined => {
  if (!isIsoDate(iso)) return undefined
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return undefined
  // Reject rollover dates like 2026-13-40, which JS Date silently normalizes.
  return dateToIso(date) === iso ? date : undefined
}

/**
 * Parse a serialized period (`start,end`) into its two bounds. A single date
 * is interpreted as both bounds, matching the data-fair `date_match` behavior.
 */
export const parsePeriod = (value?: string): PeriodRange => {
  const parts = (value || '').split(',')
  return {
    start: isIsoDate(parts[0]) ? parts[0] : undefined,
    end: isIsoDate(parts[parts.length - 1]) ? parts[parts.length - 1] : undefined
  }
}

/**
 * Build the serialized `start,end` period string. Returns `undefined` unless
 * both bounds are valid `YYYY-MM-DD` dates, so incomplete selections never
 * reach the URL. The bounds are sorted so `start` is always the earliest.
 */
export const formatPeriod = (start?: string, end?: string): string | undefined => {
  if (!isIsoDate(start) || !isIsoDate(end)) return undefined
  return start! <= end! ? `${start},${end}` : `${end},${start}`
}
