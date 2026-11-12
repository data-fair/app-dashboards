import { test, expect } from '@playwright/test'
import { pageTitleDefaults, sectionTitleDefaults } from '@/utils/title-style'

test.describe('title-style defaults', () => {
  test('defines the page title defaults', () => {
    expect(pageTitleDefaults).toEqual({
      tag: 'h2',
      size: 'h4',
      center: true,
      bold: false,
      line: { position: 'none', color: 'primary' }
    })
  })

  test('defines the section title defaults', () => {
    expect(sectionTitleDefaults).toEqual({
      tag: 'h3',
      size: 'h4',
      center: false,
      bold: false,
      line: { position: 'none', color: 'primary' }
    })
  })
})
