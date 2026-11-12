import type { DashboardElement, DashboardRow } from '@/config'
import { test, expect } from '@playwright/test'
import { computeSectionBreakpoints, dedupeKeys, elementKey, resolveRowHeight } from '@/utils/layout'

const el = (type: DashboardElement['type'], width?: 1 | 2 | 3): DashboardElement =>
  ({ type, ...(width ? { width } : {}) }) as DashboardElement

const row = (height: number, ...elements: DashboardElement[]): DashboardRow => ({ height, elements })

const widthsOf = (rows: ReturnType<typeof computeSectionBreakpoints>, index: number) => {
  const layout = rows[0].layouts[index]
  return { sm: layout.sm, md: layout.md, lg: layout.lg, xl: layout.xl }
}

test.describe('computeSectionBreakpoints', () => {
  test('returns [] without rows', () => {
    expect(computeSectionBreakpoints(undefined)).toEqual([])
    expect(computeSectionBreakpoints([])).toEqual([])
  })

  test('handles a row without elements', () => {
    const rows = computeSectionBreakpoints([{ height: 0, elements: undefined } as unknown as DashboardRow])
    expect(rows).toHaveLength(1)
    expect(rows[0].elements).toEqual([])
    expect(rows[0].layouts).toEqual([])
  })

  test('a single default element (width 2) spans the 12 columns everywhere', () => {
    const rows = computeSectionBreakpoints([row(300, el('application'))])
    expect(widthsOf(rows, 0)).toEqual({ sm: 12, md: 12, lg: 12, xl: 12 })
    expect(rows[0].height).toBe(300)
  })

  test('two width-2 elements: md shared, lg/xl scaled', () => {
    const rows = computeSectionBreakpoints([row(0, el('application'), el('text'))])
    expect(widthsOf(rows, 0)).toEqual({ sm: 12, md: 6, lg: 6, xl: 6 })
    expect(widthsOf(rows, 1)).toEqual({ sm: 12, md: 6, lg: 6, xl: 6 })
  })

  test('three width-2 elements: wrap on sm/md, a single line on lg/xl', () => {
    const rows = computeSectionBreakpoints([row(0, el('application'), el('application'), el('tablePreview'))])
    // sm/md: the 3rd overflows (12+12 and 6+6+6 > 12) → new line, span 12
    expect(widthsOf(rows, 0)).toEqual({ sm: 12, md: 6, lg: 4, xl: 4 })
    expect(widthsOf(rows, 1)).toEqual({ sm: 12, md: 6, lg: 4, xl: 4 })
    expect(widthsOf(rows, 2)).toEqual({ sm: 12, md: 12, lg: 4, xl: 4 })
  })

  test('widths 1 and 3 side by side: spans proportional to the row', () => {
    const rows = computeSectionBreakpoints([row(0, el('text', 1), el('application', 3))])
    // xl: 2 + 6 = 8 ≤ 12 → rounded spans 3 and 9
    expect(widthsOf(rows, 0).xl).toBe(3)
    expect(widthsOf(rows, 1).xl).toBe(9)
  })

  test('a full row of three widths (1+2+3) fits on xl', () => {
    const rows = computeSectionBreakpoints([row(0, el('text', 1), el('text', 2), el('application', 3))])
    // xl: 2 + 3 + 6 = 11 ≤ 12 → cpt=11, spans floor(0.3+12*2/11)=2, floor(0.3+12*3/11)=3, floor(0.3+12*6/11)=6
    expect(widthsOf(rows, 0).xl).toBe(2)
    expect(widthsOf(rows, 1).xl).toBe(3)
    expect(widthsOf(rows, 2).xl).toBe(6)
  })

  test('text elements are classed order-first at each breakpoint', () => {
    const rows = computeSectionBreakpoints([row(0, el('text'), el('tablePreview'))])
    const textLayout = rows[0].layouts[0]
    const otherLayout = rows[0].layouts[1]
    expect(textLayout.class).toContain('order-first')
    // The order-{sm|md|lg|xl}-* classes are accumulated: the text is
    // order-first on sm (it fills the row alone) then goes back to 1st
    // position on md/lg/xl when it shares the row with the table.
    expect(textLayout.class).toEqual([
      'order-first', 'order-sm-first', 'order-md-1', 'order-lg-1', 'order-xl-1'
    ])
    expect(otherLayout.class).toEqual(['order-sm-2', 'order-md-2', 'order-lg-2', 'order-xl-2'])
  })

  test('handles each row independently', () => {
    const rows = computeSectionBreakpoints([row(100, el('application')), row(200, el('tablePreview', 1), el('tablePreview', 1))])
    expect(rows).toHaveLength(2)
    expect(rows[0].height).toBe(100)
    expect(rows[1].height).toBe(200)
    // md: 4 + 4 = 8 ≤ 12 → spans 6/6
    expect(rows[1].layouts[0].md).toBe(6)
    expect(rows[1].layouts[1].md).toBe(6)
  })

  test('keeps height and heights for the per-breakpoint resolution', () => {
    const rows = computeSectionBreakpoints([{ height: 400, heights: { md: 800 }, elements: [] }])
    expect(rows[0].height).toBe(400)
    expect(rows[0].heights).toEqual({ md: 800 })
  })
})

test.describe('resolveRowHeight', () => {
  test('without per-breakpoint height, returns the single height or undefined', () => {
    expect(resolveRowHeight({ height: 400 }, 'md')).toBe(400)
    expect(resolveRowHeight({}, 'md')).toBeUndefined()
  })

  test('default covers xs/sm, md and above take the defined value', () => {
    const row = { heights: { default: -1, md: 717 } }
    expect(resolveRowHeight(row, 'xs')).toBe(-1)
    expect(resolveRowHeight(row, 'sm')).toBe(-1)
    expect(resolveRowHeight(row, 'md')).toBe(717)
    expect(resolveRowHeight(row, 'lg')).toBe(717)
    expect(resolveRowHeight(row, 'xl')).toBe(717)
  })

  test('mobile-first cascade: sm applies to md if md is missing', () => {
    const row = { heights: { sm: 300, lg: 500 } }
    expect(resolveRowHeight(row, 'xs')).toBeUndefined()
    expect(resolveRowHeight(row, 'sm')).toBe(300)
    expect(resolveRowHeight(row, 'md')).toBe(300)
    expect(resolveRowHeight(row, 'lg')).toBe(500)
    expect(resolveRowHeight(row, 'xl')).toBe(500)
  })

  test('the single height is the fallback when heights has no default', () => {
    const row = { height: 400, heights: { md: 800 } }
    expect(resolveRowHeight(row, 'xs')).toBe(400)
    expect(resolveRowHeight(row, 'sm')).toBe(400)
    expect(resolveRowHeight(row, 'md')).toBe(800)
  })

  test('heights.default takes precedence over the single height and xxl equals xl', () => {
    const row = { height: 400, heights: { default: -1, xl: 900 } }
    expect(resolveRowHeight(row, 'xs')).toBe(-1)
    expect(resolveRowHeight(row, 'xxl')).toBe(900)
  })
})

test.describe('elementKey', () => {
  test('identifies elements by their dataset/application rather than by index', () => {
    expect(elementKey({ type: 'tablePreview', dataset: { id: 'a' } } as DashboardElement, 0)).toBe('tablePreview-a')
    expect(elementKey({ type: 'download', dataset: { id: 'a' } } as DashboardElement, 0)).toBe('download-a')
    expect(elementKey({ type: 'form', dataset: { id: 'b' } } as DashboardElement, 5)).toBe('form-b')
    expect(elementKey({ type: 'application', application: { id: 'x' } } as DashboardElement, 9)).toBe('application-x')
  })

  test('falls back on the index for root elements (root source) and without identity', () => {
    expect(elementKey({ type: 'tablePreview' } as DashboardElement, 2)).toBe('tablePreview-root')
    expect(elementKey({ type: 'text', content: 'c' } as DashboardElement, 3)).toBe('text-c')
    expect(elementKey({ type: 'text' } as DashboardElement, 4)).toBe('text-4')
    expect(elementKey({ type: 'column' } as DashboardElement, 1)).toBe('column-1')
  })
})

test.describe('dedupeKeys', () => {
  test('keeps the first copy and suffixes the duplicates', () => {
    expect(dedupeKeys(['a', 'a', 'b', 'a'])).toEqual(['a', 'a#1', 'b', 'a#2'])
  })
})
