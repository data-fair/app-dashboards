// Dashboard configuration types
//
// NOTE: Types here are defined manually rather than re-exported from
// src/config/.type/index.d.ts because the generator (json-schema-to-typescript)
// produces overly loose types (`[k: string]: unknown` on every variant) which
// make property access in code return `unknown`.
//
// The schema in src/config/schema.json remains the source of truth for the
// VJSF form; regenerate public/config-schema.json and the .type/ directory
// with `npm run build-types` if the schema changes, then update the
// interfaces below to stay in sync.

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
}

export interface DashboardStaticFilter {
  type: 'in' | 'interval' | 'nin'
  field: string
  values?: string[]
  minValue?: string
  maxValue?: string
}

export type DashboardElementType = 'tablePreview' | 'application' | 'text' | 'form' | 'column'

export type DashboardElementWidth = 1 | 2 | 3

export type DashboardDescriptionPosition = 'none' | 'left' | 'right'

export type TitleTag = 'h1' | 'h2' | 'h3' | 'h4'
export type TitleSize = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
export type TitleColor = 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'error' | 'warning'
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

export interface TablePreviewElement extends BaseElement {
  type: 'tablePreview'
  source?: 'root' | 'external'
  dataset?: DashboardDataset
  fields?: string[]
  display?: 'table' | 'table-dense' | 'list'
  noInteractions?: boolean
  ignoreFilters?: boolean
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
  ignoreFilters?: boolean
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
  ignoreFilters?: boolean
}

export type DashboardElement =
  | TablePreviewElement
  | ApplicationElement
  | TextElement
  | FormElement
  | ({ type: 'column' } & Omit<BaseElement, 'type'> & { elements?: DashboardElement[] })

export interface DashboardRow {
  height: number
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
export const isApplicationElement = (e: DashboardElement): e is ApplicationElement => e.type === 'application'
export const isTextElement = (e: DashboardElement): e is TextElement => e.type === 'text'
export const isFormElement = (e: DashboardElement): e is FormElement => e.type === 'form'
export const isColumnElement = (e: DashboardElement): e is { type: 'column' } & Omit<BaseElement, 'type'> & { elements?: DashboardElement[] } => e.type === 'column'

// Re-export generated types for code that wants to introspect the schema.
// Not used as the main type source due to the generator's loose typing.
export type {
  ConfigResolved,
  Filtres,
  Sections,
  Autres,
  FiltresPredefinis,
  FiltresDynamiquesDuTableauDeBord
} from './.type/index.js'
