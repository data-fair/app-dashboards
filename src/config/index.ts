// Types manuels pour la configuration du dashboard
// Générés à partir de src/config/schema.json

export interface DashboardDataset {
  id: string
  href: string
  title: string
  slug?: string
  schema?: any[]
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

export interface DashboardElement {
  type: 'tablePreview' | 'application' | 'text' | 'form' | 'column'
  title?: string
  width?: 1 | 2 | 3
  height?: number
  source?: 'root' | 'external'
  dataset?: DashboardDataset
  application?: {
    id: string
    title: string
    href: string
    baseApp: { meta: Record<string, unknown> }
  }
  fields?: string[]
  display?: string
  noInteractions?: boolean
  ignoreFilters?: boolean
  valueMandatory?: boolean
  mandatoryFilters?: string[]
  description?: 'none' | 'left' | 'right'
  content?: string
  elements?: DashboardElement[]
}

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

export interface DashboardConfig {
  datasets?: DashboardDataset[]
  staticFilters?: DashboardStaticFilter[]
  filters?: DashboardFilter[]
  periodFilter?: boolean
  addressFilter?: boolean
  sections?: DashboardSection[]
  sectionsGroup?: 'accordion' | 'tabs-tab' | 'tabs-button' | 'flow'
  showSources?: boolean
  showEmbed?: boolean
  showCapture?: boolean
  title?: string
  description?: string
  allowDuplicate?: boolean
  applications?: { id: string; title: string }[]
}
