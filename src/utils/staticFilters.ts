/**
 * Normalize the dashboard's `staticFilters` config entries to the canonical
 * `Filter` shape expected by `@data-fair/lib-utils/filters`.
 *
 * The dashboard historically stores `field` as a plain string (field key) and
 * uses `nin` as the type name for exclusion, while the canonical type uses a
 * `field: { key }` object and the `out` type name (producing the same `_nin`
 * REST suffix). Both legacy forms are mapped here so existing configs keep
 * working.
 */
import type { Filter } from '@data-fair/lib-utils/filters/index.js'
import type { DashboardStaticFilter } from '@/config'

export const normalizeStaticFilters = (filters: DashboardStaticFilter[] | undefined): Filter[] => {
  return (filters || [])
    .filter(sf => !!sf && !!sf.field)
    .map(sf => ({
      ...sf,
      type: sf.type === 'nin' ? 'out' : sf.type,
      field: typeof sf.field === 'string' ? { key: sf.field } : sf.field
    })) as unknown as Filter[]
}
