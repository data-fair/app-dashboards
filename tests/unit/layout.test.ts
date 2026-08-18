import { describe, it, expect } from 'vitest'
import { computeSectionBreakpoints, dedupeKeys, elementKey } from '@/utils/layout'
import type { DashboardElement, DashboardRow } from '@/config'

const el = (type: DashboardElement['type'], width?: 1 | 2 | 3): DashboardElement =>
  ({ type, ...(width ? { width } : {}) }) as DashboardElement

const row = (height: number, ...elements: DashboardElement[]): DashboardRow => ({ height, elements })

const widthsOf = (rows: ReturnType<typeof computeSectionBreakpoints>, index: number) => {
  const layout = rows[0].layouts[index]
  return { sm: layout.sm, md: layout.md, lg: layout.lg, xl: layout.xl }
}

describe('computeSectionBreakpoints', () => {
  it('renvoie [] sans rows', () => {
    expect(computeSectionBreakpoints(undefined)).toEqual([])
    expect(computeSectionBreakpoints([])).toEqual([])
  })

  it('traite une row sans éléments', () => {
    const rows = computeSectionBreakpoints([{ height: 0, elements: undefined } as unknown as DashboardRow])
    expect(rows).toHaveLength(1)
    expect(rows[0].elements).toEqual([])
    expect(rows[0].layouts).toEqual([])
  })

  it('un seul élément par défaut (largeur 2) occupe les 12 colonnes partout', () => {
    const rows = computeSectionBreakpoints([row(300, el('application'))])
    expect(widthsOf(rows, 0)).toEqual({ sm: 12, md: 12, lg: 12, xl: 12 })
    expect(rows[0].height).toBe(300)
  })

  it('deux éléments de largeur 2 : md partagé, lg/xl mis à l\'échelle', () => {
    const rows = computeSectionBreakpoints([row(0, el('application'), el('text'))])
    expect(widthsOf(rows, 0)).toEqual({ sm: 12, md: 6, lg: 6, xl: 6 })
    expect(widthsOf(rows, 1)).toEqual({ sm: 12, md: 6, lg: 6, xl: 6 })
  })

  it('trois éléments de largeur 2 : wrap sur sm/md, une seule ligne sur lg/xl', () => {
    const rows = computeSectionBreakpoints([row(0, el('application'), el('application'), el('tablePreview'))])
    // sm/md : le 3e déborde (12+12 et 6+6+6 > 12) → nouvelle ligne, span 12
    expect(widthsOf(rows, 0)).toEqual({ sm: 12, md: 6, lg: 4, xl: 4 })
    expect(widthsOf(rows, 1)).toEqual({ sm: 12, md: 6, lg: 4, xl: 4 })
    expect(widthsOf(rows, 2)).toEqual({ sm: 12, md: 12, lg: 4, xl: 4 })
  })

  it('largeurs 1 et 3 côte à côte : spans proportionnels à la ligne', () => {
    const rows = computeSectionBreakpoints([row(0, el('text', 1), el('application', 3))])
    // xl : 2 + 6 = 8 ≤ 12 → spans arrondis 3 et 9
    expect(widthsOf(rows, 0).xl).toBe(3)
    expect(widthsOf(rows, 1).xl).toBe(9)
  })

  it('une ligne pleine de trois largeurs (1+2+3) tient sur xl', () => {
    const rows = computeSectionBreakpoints([row(0, el('text', 1), el('text', 2), el('application', 3))])
    // xl : 2 + 3 + 6 = 11 ≤ 12 → cpt=11, spans floor(0.3+12*2/11)=2, floor(0.3+12*3/11)=3, floor(0.3+12*6/11)=6
    expect(widthsOf(rows, 0).xl).toBe(2)
    expect(widthsOf(rows, 1).xl).toBe(3)
    expect(widthsOf(rows, 2).xl).toBe(6)
  })

  it('les éléments text sont classés order-first', () => {
    const rows = computeSectionBreakpoints([row(0, el('text'), el('tablePreview'))])
    const textLayout = rows[0].layouts[0]
    const otherLayout = rows[0].layouts[1]
    expect(textLayout.class).toContain('order-first')
    // ⚠️ Comportement actuel : `layouts[k].class` est réaffecté à chaque
    // breakpoint → seule la classe du DERNIER breakpoint (xl) subsiste.
    // Les classes order-{sm|md|lg}-* théoriques sont écrasées (bug latent).
    expect(textLayout.class).toEqual(['order-first', 'order-xl-1'])
    expect(otherLayout.class).toEqual(['order-xl-2'])
  })

  it('traite chaque row indépendamment', () => {
    const rows = computeSectionBreakpoints([row(100, el('application')), row(200, el('tablePreview', 1), el('tablePreview', 1))])
    expect(rows).toHaveLength(2)
    expect(rows[0].height).toBe(100)
    expect(rows[1].height).toBe(200)
    // md : 4 + 4 = 8 ≤ 12 → spans 6/6
    expect(rows[1].layouts[0].md).toBe(6)
    expect(rows[1].layouts[1].md).toBe(6)
  })
})

describe('elementKey', () => {
  it('identifie les éléments par leur dataset/application plutôt que par l\'index', () => {
    expect(elementKey({ type: 'tablePreview', dataset: { id: 'a' } } as DashboardElement, 0)).toBe('tablePreview-a')
    expect(elementKey({ type: 'form', dataset: { id: 'b' } } as DashboardElement, 5)).toBe('form-b')
    expect(elementKey({ type: 'application', application: { id: 'x' } } as DashboardElement, 9)).toBe('application-x')
  })

  it('retombe sur l\'index pour les éléments racine (source root) et sans identité', () => {
    expect(elementKey({ type: 'tablePreview' } as DashboardElement, 2)).toBe('tablePreview-root')
    expect(elementKey({ type: 'text', content: 'c' } as DashboardElement, 3)).toBe('text-c')
    expect(elementKey({ type: 'text' } as DashboardElement, 4)).toBe('text-4')
    expect(elementKey({ type: 'column' } as DashboardElement, 1)).toBe('column-1')
  })
})

describe('dedupeKeys', () => {
  it('garde le premier exemplaire et suffixe les doublons', () => {
    expect(dedupeKeys(['a', 'a', 'b', 'a'])).toEqual(['a', 'a#1', 'b', 'a#2'])
  })
})
