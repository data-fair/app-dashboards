// Dashboard configuration types
//
// NOTE: Types here are defined manually rather than re-exported from
// src/config/.type/index.d.ts because the generator (json-schema-to-typescript)
// produces overly loose types (`[k: string]: unknown` on every variant) which
// make property access in code return `unknown`.
//
// The schema in public/config-schema.json remains the source of truth for the
// VJSF form; regenerate the .type/ directory with `npm run build-types` if the
// schema changes, then update the interfaces below to stay in sync.
//
// Dataset selector prerequisites: the root `datasets` selector is intentionally
// open — this dashboard must accept any dataset for its filters, so no
// `bbox`/`concepts` prerequisite is declared. The selector URL relies on the
// host-provided `${context.datasetFilter}` (VJSF layout context) to constrain
// the proposed datasets (portal scope, additional filters); if the host does
// not provide it, the selector lists all finalized datasets.
//
// Nested columns: the runtime (`dashboard-column.vue`) and `flattenElements`
// support a `column` element, but the schema only exposes columns at row
// level (no nested-column form variant); a nested column can only come from
// hand-edited configuration.

export interface DashboardDataset {
  id: string
  href: string
  title: string
  slug?: string
  schema?: Record<string, unknown>[]
  timePeriod?: { startDate: string; endDate: string }
  bbox?: number[]
  finalizedAt?: string
}

export interface DashboardFilter {
  labelField: string
  values?: string[]
  multipleValues?: boolean
  forceOneValue?: boolean
  startValue?: string
  showAllValues?: boolean
  /** Rend le filtre comme un range slider (champ numérique uniquement). */
  slider?: boolean
}

export interface DashboardStaticFilter {
  /** `nin` est la forme historique de `out`, normalisée au runtime. */
  type: 'in' | 'interval' | 'out' | 'nin' | 'starts' | 'exists' | 'notExists'
  field: string
  values?: string[]
  minValue?: string
  maxValue?: string
  value?: string
}

export type DashboardElementType = 'tablePreview' | 'download' | 'application' | 'text' | 'form' | 'column'

export type DashboardElementWidth = 1 | 2 | 3

/**
 * Synchronisation d'un élément avec le dashboard et les autres visus, alignée
 * sur les modes `syncParams` d'une page de portail :
 *  - `shared-filters` (défaut) : ses filtres/sélections sont reprojetés dans le
 *    namespace propre (`_c*`/`_d*`) et relayés aux autres visus ;
 *  - `sandboxed` : il garde son état dans son canal privé, rien n'est partagé ;
 *  - `none` : aucun canal privé, son état n'est pas conservé, rien n'est partagé.
 * Dans tous les cas il reçoit les filtres du dashboard (`ignoreFilters` n'existe
 * plus).
 */
export type SyncParams = 'none' | 'sandboxed' | 'shared-filters'

export type DashboardDescriptionPosition = 'none' | 'left' | 'right' | 'top' | 'bottom'

export type TitleTag = 'h1' | 'h2' | 'h3' | 'h4'
export type TitleSize = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
export type TitleColor = 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'error' | 'warning' | null
export type TitleLinePosition = 'none' | 'left' | 'bottom-small' | 'bottom-medium' | 'bottom-large'

export interface TitleStyle {
  tag?: TitleTag
  size?: TitleSize
  center?: boolean
  bold?: boolean
  color?: TitleColor
  line?: {
    position?: TitleLinePosition
    color?: TitleColor
  }
}

export interface BaseElement {
  type: DashboardElementType
  title?: string
  width?: DashboardElementWidth
  height?: number
}

/**
 * Interactions de la vue table intégrée (`/embed/dataset/<id>/table`) que
 * l'on peut interdire. Alignées sur `allInteractions` de data-fair ; `agent`
 * et `fullscreen` en sont absents car jamais rendus dans un embed.
 */
export type TableInteraction = 'count' | 'search' | 'filters' | 'pagination' | 'sort' | 'cells' | 'select-cols' | 'fix-cols' | 'display' | 'download'

export interface TablePreviewElement extends BaseElement {
  type: 'tablePreview'
  source?: 'root' | 'external'
  dataset?: DashboardDataset
  fields?: string[]
  display?: 'table' | 'table-dense' | 'list'
  /** Déprécié : prioritaire sur `hideInteractions`, conservé pour les configs existantes. */
  noInteractions?: boolean
  hideInteractions?: TableInteraction[]
  pagination?: boolean
  syncParams?: SyncParams
  valueMandatory?: boolean
  mandatoryFilters?: string[]
}

export interface DownloadElement extends BaseElement {
  type: 'download'
  source?: 'root' | 'external'
  dataset?: DashboardDataset
  fields?: string[]
  header?: boolean
  valueMandatory?: boolean
  mandatoryFilters?: string[]
}

export interface ApplicationElement extends BaseElement {
  type: 'application'
  source?: 'root' | 'external'
  application?: {
    id: string
    title: string
    href: string
    baseApp: { meta: Record<string, unknown> }
  }
  syncParams?: SyncParams
  valueMandatory?: boolean
  mandatoryFilters?: string[]
  description?: DashboardDescriptionPosition
}

export interface TextElement extends BaseElement {
  type: 'text'
  content?: string
}

export interface FormElement extends BaseElement {
  type: 'form'
  dataset?: DashboardDataset
  syncParams?: SyncParams
}

export type DashboardElement =
  | TablePreviewElement
  | DownloadElement
  | ApplicationElement
  | TextElement
  | FormElement
  | ({ type: 'column' } & Omit<BaseElement, 'type'> & { elements?: DashboardElement[] })

export interface DashboardRowHeights {
  default?: number
  sm?: number
  md?: number
  lg?: number
  xl?: number
}

export interface DashboardRow {
  height?: number
  heights?: DashboardRowHeights
  elements: DashboardElement[]
}

export interface DashboardSection {
  title?: string
  description?: string
  icon?: { name: string; svg: string; svgPath: string }
  rows: DashboardRow[]
}

export type DashboardSectionsGroup = 'accordion' | 'tabs-tab' | 'tabs-button' | 'flow'

export interface ApplicationRef { id: string; title: string }
export interface DatasetRef { id: string; title: string; href: string }

export interface DashboardConfig {
  datasets?: DashboardDataset[]
  staticFilters?: DashboardStaticFilter[]
  filters?: DashboardFilter[]
  periodFilter?: boolean
  addressFilter?: boolean
  sections?: DashboardSection[]
  sectionsGroup?: DashboardSectionsGroup
  showSources?: boolean
  showEmbed?: boolean
  showCapture?: boolean
  title?: string
  titleStyle?: TitleStyle
  sectionsTitleStyle?: TitleStyle
  description?: string
  allowDuplicate?: boolean
  applications?: ApplicationRef[]
}

// Type guard helpers (handy with the discriminated union)
export const isTablePreviewElement = (e: DashboardElement): e is TablePreviewElement => e.type === 'tablePreview'
export const isDownloadElement = (e: DashboardElement): e is DownloadElement => e.type === 'download'
export const isApplicationElement = (e: DashboardElement): e is ApplicationElement => e.type === 'application'
export const isTextElement = (e: DashboardElement): e is TextElement => e.type === 'text'
export const isFormElement = (e: DashboardElement): e is FormElement => e.type === 'form'
