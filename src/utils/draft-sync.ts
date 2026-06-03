/**
 * Pure helpers to extract the references declared in a dashboard configuration.
 *
 * Used by the parent iframe sync (see `useParentSync`) so that DataFair knows
 * which applications and datasets the dashboard depends on.
 */
import type { DashboardConfig, DashboardElement, DashboardSection } from '@/config'

export type FlattenedElement = DashboardElement

const asArray = <T>(v: unknown): T[] => Array.isArray(v) ? (v as T[]) : []

export const flattenElements = (sections: DashboardSection[] | undefined): FlattenedElement[] => {
  if (!sections) return []
  const result: FlattenedElement[] = []
  for (const section of sections) {
    const rows = section.rows || []
    for (const row of rows) {
      const elements = asArray<DashboardElement>(row.elements)
      for (const el of elements) {
        const nested = (el as { elements?: unknown }).elements
        if (Array.isArray(nested)) {
          for (const inner of nested as DashboardElement[]) {
            result.push(inner)
          }
        } else {
          result.push(el)
        }
      }
    }
  }
  return result
}

export interface ApplicationRef { id: string; title: string }
export interface DatasetRef { id: string; title: string; href: string }

export const extractReferencedApplications = (elements: FlattenedElement[]): ApplicationRef[] => {
  const seen = new Set<string>()
  const result: ApplicationRef[] = []
  for (const el of elements) {
    if (el.type !== 'application') continue
    const app = (el as { application?: { id?: string; title?: string } }).application
    if (!app?.id || !app.title || seen.has(app.id)) continue
    seen.add(app.id)
    result.push({ id: app.id, title: app.title })
  }
  return result
}

export const extractReferencedDatasets = (
  elements: FlattenedElement[],
  filtersDataset: DatasetRef | undefined
): DatasetRef[] => {
  if (!filtersDataset) return []
  const refs: DatasetRef[] = []
  const seen = new Set<string>()
  for (const el of elements) {
    if (el.type !== 'tablePreview' && el.type !== 'form') continue
    const ds = (el as { dataset?: { id?: string; title?: string; href?: string } }).dataset
    if (!ds?.id || !ds.title || !ds.href) continue
    if (ds.id === filtersDataset.id || seen.has(ds.id)) continue
    seen.add(ds.id)
    refs.push({ id: ds.id, title: ds.title, href: ds.href })
  }
  refs.unshift(filtersDataset)
  return refs
}

const joinIds = <T extends { id: string }>(items: T[] | undefined): string => (items || []).map(i => i.id).join('-')

export interface SyncDeltas {
  applications?: ApplicationRef[]
  datasets?: DatasetRef[]
}

/**
 * Compute the deltas that should be sent to the parent iframe.
 * Returns undefined for a field if it didn't change.
 */
export const buildSyncDeltas = (prev: DashboardConfig, next: DashboardConfig): SyncDeltas => {
  const deltas: SyncDeltas = {}
  const elements = flattenElements(next.sections)
  const applications = extractReferencedApplications(elements)
  if (joinIds(prev.applications as ApplicationRef[] | undefined) !== joinIds(applications)) {
    deltas.applications = applications
  }
  const filtersDataset = next.datasets?.[0] as DatasetRef | undefined
  if (filtersDataset) {
    const datasets = extractReferencedDatasets(elements, filtersDataset)
    if (joinIds(prev.datasets as DatasetRef[] | undefined) !== joinIds(datasets)) {
      deltas.datasets = datasets
    }
  }
  return deltas
}

export const postConfigField = (field: string, value: unknown): void => {
  if (window.parent === window) return
  window.parent.postMessage({ type: 'set-config', content: { field, value } }, '*')
}
