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
