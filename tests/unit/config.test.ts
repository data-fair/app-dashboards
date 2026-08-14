import { describe, it, expect } from 'vitest'
import { setByPath, parseAccessKey, computeConfigError } from '@/utils/config'
import type { DashboardConfig } from '@/config'

describe('setByPath', () => {
  it('définit une valeur sur un chemin imbriqué existant', () => {
    const obj = { chart: { colors: ['#fff'] } }
    setByPath(obj, 'chart.colors.0', '#000')
    expect(obj).toEqual({ chart: { colors: ['#000'] } })
  })

  it('crée les objets intermédiaires manquants', () => {
    const obj: Record<string, unknown> = {}
    setByPath(obj, 'a.b.c', 42)
    expect(obj).toEqual({ a: { b: { c: 42 } } })
  })

  it('ne mute pas l\'objet d\'origine le long du chemin', () => {
    const original = { chart: { colors: ['#fff'], type: 'line' } }
    const clone = JSON.parse(JSON.stringify(original))
    setByPath(clone, 'chart.colors.0', '#000')
    expect(clone.chart.colors[0]).toBe('#000')
    expect(original.chart.colors[0]).toBe('#fff')
    expect(original.chart.type).toBe('line')
    expect(clone.chart.type).toBe('line')
  })

  it('écrase une feuille existante', () => {
    const obj: Record<string, unknown> = { title: 'A' }
    setByPath(obj, 'title', 'B')
    expect(obj.title).toBe('B')
  })
})

describe('parseAccessKey', () => {
  it('extrait la clé d\'une URL exposée partagée', () => {
    expect(parseAccessKey('https://host/app/abc123%3Asankey')).toBe('abc123')
    expect(parseAccessKey('https://host/app/abc123%3Asankey?view=compare')).toBe('abc123')
  })

  it('renvoie null sans clé (%3A absent)', () => {
    expect(parseAccessKey('https://host/app/sankey')).toBeNull()
    expect(parseAccessKey(undefined)).toBeNull()
    expect(parseAccessKey('')).toBeNull()
  })

  it('renvoie null quand l\'URL contient plusieurs %3A', () => {
    expect(parseAccessKey('https://host/app/a%3Ab%3Ac')).toBeNull()
  })
})

describe('computeConfigError', () => {
  it('renvoie un message par état invalide, null si valide', () => {
    expect(computeConfigError(undefined)).toBe('Il n\'y a pas de configuration définie')
    expect(computeConfigError({} as DashboardConfig)).toBe('Veuillez choisir une source de données pour le filtre commun')
    expect(computeConfigError({ datasets: [{} as any] } as DashboardConfig)).toBe('La source de données n\'a pas de schéma')
    expect(computeConfigError({ datasets: [{ schema: [] }] } as DashboardConfig)).toBeNull()
  })
})
