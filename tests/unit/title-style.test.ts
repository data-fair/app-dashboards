import { describe, it, expect } from 'vitest'
import { pageTitleDefaults, sectionTitleDefaults } from '@/utils/title-style'

describe('title-style defaults', () => {
  it('définit les défauts du titre de page', () => {
    expect(pageTitleDefaults).toEqual({
      tag: 'h2',
      size: 'h4',
      center: true,
      bold: false,
      line: { position: 'none', color: 'primary' }
    })
  })

  it('définit les défauts du titre de section', () => {
    expect(sectionTitleDefaults).toEqual({
      tag: 'h3',
      size: 'h4',
      center: false,
      bold: false,
      line: { position: 'none', color: 'primary' }
    })
  })
})
