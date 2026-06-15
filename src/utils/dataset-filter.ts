/**
 * Build the search-param key used to store a dynamic filter value for a given dataset.
 *
 * Pattern: `${prefix}_d_${datasetId}_${field}_in`
 *
 * The `_d_${id}_` prefix scopes the parameter to a specific dataset so that several
 * datasets with the same field name do not collide in the URL.
 */
export const datasetFilterKey = (datasetId: string, field: string, prefix = ''): string => {
  return `${prefix}_d_${datasetId || ''}_${field}_in`
}

export const datasetFilterKeyRegex = /^(.*?)_d_(.+?)_(.+)_in$/

/**
 * Build the concept-scoped search-param key used to broadcast a filter value
 * to a child visu, regardless of the child's dataset.
 *
 * Pattern: `_c_<conceptId>_<op>`
 *
 * This key is recognized by the data-fair REST embed API (which translates it
 * to a field-level filter by looking up the field carrying the concept in
 * the target dataset's schema) and by the `useConceptFilters` helper
 * (`@data-fair/lib-vue/concept-filters.js`) used by child applications.
 *
 * The key is **not** prefixed with `<prefix>_` (compare-view column index):
 * each iframe is attached to a single column, and the dashboard builds a
 * separate broadcast object per column. This matches the existing convention
 * for `_c_date_match` and `_c_geo_distance`.
 */
export const conceptFilterKey = (conceptId: string, op: 'in' | 'nin' | 'eq' | 'gte' | 'lte' = 'in'): string => {
  return `_c_${conceptId}_${op}`
}
