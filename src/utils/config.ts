/**
 * Pure config helpers extracted from `composables/config.ts` to be testable
 * in isolation.
 */
import type { DashboardConfig } from '@/config'

/**
 * Set a value at `path` (dot-separated) in `obj`, cloning the intermediate
 * objects/arrays along the path so the original object is not mutated.
 */
export const setByPath = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const keys = path.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    } else {
      current[key] = Array.isArray(current[key]) ? [...current[key]] : { ...current[key] }
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}

/**
 * Extract the accessKey from an exposed shared link URL
 * (`.../<accessKey>%3A<appId>`).
 */
export const parseAccessKey = (exposedUrl: string | undefined): string | null => {
  const last = exposedUrl?.split('/').pop()
  const toks = last?.split('%3A')
  return (toks?.length === 2) ? toks[0] : null
}

/**
 * Validation message of a dashboard configuration, or null when valid.
 */
export const computeConfigError = (config: DashboardConfig | undefined): string | null => {
  if (!config) return 'Il n\'y a pas de configuration définie'
  if (!config.datasets?.length) return 'Veuillez choisir une source de données pour le filtre commun'
  if (!config.datasets?.[0]?.schema) return 'La source de données n\'a pas de schéma'
  return null
}
