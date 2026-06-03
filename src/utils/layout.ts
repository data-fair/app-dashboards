/**
 * Pure layout helpers used by `dashboard-section.vue`.
 *
 * The section is laid out in a 12-column grid across four breakpoints (sm, md,
 * lg, xl). Each element declares a width class (1 = thin, 2 = medium, 3 =
 * wide) and the algorithm packs elements row by row at each breakpoint,
 * scaling their column span proportionally when the row is narrower than
 * the requested widths would suggest.
 *
 * The function returns a parallel structure mapping each element index to
 * its computed layout, so we don't have to mutate the `DashboardElement`
 * type (which is a discriminated union and can't be extended directly).
 */
import type { DashboardElement, DashboardRow, DashboardElementWidth } from '@/config'

const widths: Record<'sm' | 'md' | 'lg' | 'xl', number[]> = {
  sm: [6, 12, 12],
  md: [4, 6, 8],
  lg: [3, 4, 6],
  xl: [2, 3, 6]
}

export type Breakpoint = keyof typeof widths

export interface ElementLayout {
  sm: number
  md: number
  lg: number
  xl: number
  class: string[]
}

export interface ProcessedRow {
  height: number
  elements: DashboardElement[]
  layouts: ElementLayout[]
}

const elementWidth = (el: DashboardElement): DashboardElementWidth => el.width || 2

const computeRowLayout = (row: DashboardRow): ProcessedRow => {
  const elements = row.elements || []
  const layouts: ElementLayout[] = elements.map(() => ({ sm: 12, md: 12, lg: 12, xl: 12, class: [] }))

  for (const breakpoint of Object.keys(widths) as Breakpoint[]) {
    let i = 0
    while (i < elements.length) {
      let j = i
      let cpt = 0
      while (j < elements.length && cpt + widths[breakpoint][elementWidth(elements[j]) - 1] <= 12) {
        cpt += widths[breakpoint][elementWidth(elements[j]) - 1]
        j += 1
      }
      for (let k = i; k < j; k++) {
        const el = elements[k]
        const baseWidth = widths[breakpoint][elementWidth(el) - 1]
        layouts[k][breakpoint] = Math.floor(0.3 + 12 * baseWidth / cpt)
        const isText = el.type === 'text'
        layouts[k].class = isText ? ['order-first'] : []
        if (isText && layouts[k][breakpoint] === 12) {
          layouts[k].class.push(`order-${breakpoint}-first`)
        } else {
          layouts[k].class.push(`order-${breakpoint}-${k + 1}`)
        }
      }
      i = j
    }
  }

  return { height: row.height, elements, layouts }
}

export const computeSectionBreakpoints = (rows: DashboardRow[] | undefined): ProcessedRow[] => {
  return (rows || []).map(computeRowLayout)
}
