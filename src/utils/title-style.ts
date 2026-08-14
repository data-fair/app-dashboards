/**
 * Shared default title styles, mirroring the `titleStyle` config definition
 * (see `src/config/schema.json`). Used as fallbacks by `d-title` when a
 * configured style omits some fields.
 */
import type { TitleStyle } from '@/config'

export const pageTitleDefaults: TitleStyle = {
  tag: 'h2',
  size: 'h4',
  center: true,
  bold: false,
  line: { position: 'none', color: 'primary' }
}

export const sectionTitleDefaults: TitleStyle = {
  tag: 'h3',
  size: 'h4',
  center: false,
  bold: false,
  line: { position: 'none', color: 'primary' }
}
