import type { Page } from '@playwright/test'
import { test, expect, embeddedVisusConsole } from './fixtures'

/**
 * Known regressions / bugs of the dashboard.
 *
 * Each test is written to assert the EXPECTED behavior.
 * If a test fails, the regression is back: fix the source code
 * and run `npm run test-e2e` again.
 *
 * ⚠️ The expectations are NO LONGER coupled to `.dev-config.json`: the live
 * config is read from the dev-server's `GET /config` endpoint, and every
 * expected value is derived from it (number of filters, of elements, root
 * dataset, concept/static-filters keys). Assertions that need an
 * ingredient missing from the current config are simply skipped, so
 * that the suite stays green on any valid config.
 */

interface SchemaField {
  key: string
  'x-concept'?: { id: string }
}

interface DashboardElementConfig {
  type: string
  dataset?: { id: string }
  application?: { id: string; href?: string }
  syncParams?: string
  valueMandatory?: boolean
  mandatoryFilters?: string[]
  elements?: DashboardElementConfig[]
}

type StaticFilter =
  | { type: 'in' | 'nin'; field: string | { key: string }; values?: string[] }
  | { type: 'interval'; field: string | { key: string }; minValue?: string; maxValue?: string }
  | { type: 'starts'; field: string | { key: string }; value?: string }
  | { type: 'exists' | 'notExists'; field: string | { key: string } }

interface DevConfig {
  filters?: { labelField?: string; values?: string[]; slider?: boolean; startValue?: string; multipleValues?: boolean; forceOneValue?: boolean }[]
  staticFilters?: StaticFilter[] | null
  sectionsGroup?: string
  datasets?: { id?: string; schema?: SchemaField[] }[]
  sections?: { rows?: { elements?: DashboardElementConfig[] }[] }[]
}

const fieldKeyOf = (f: StaticFilter['field']): string => (typeof f === 'string' ? f : f.key)

/** A `column` is not an embed: only its children are rendered in the DOM. */
const flattenElements = (elements: DashboardElementConfig[]): DashboardElementConfig[] =>
  elements.flatMap(el => el.type === 'column' ? flattenElements(el.elements || []) : [el])

const flatElements = (config: DevConfig): DashboardElementConfig[] =>
  (config.sections || [])
    .flatMap(section => (section.rows || []).flatMap(row => flattenElements(row.elements || [])))

/**
 * Elements actually mounted in the DOM: with tab grouping
 * (`tabs-*`), only the active tab (the first one) is rendered by the v-window;
 * otherwise every element of the sections is rendered.
 */
const visibleElements = (config: DevConfig): DashboardElementConfig[] => {
  const sections = config.sections || []
  if (sections.length <= 1) return flatElements(config)
  if ((config.sectionsGroup || '').includes('tabs')) {
    return flatElements({ sections: [sections[0]] })
  }
  return flatElements(config)
}

/**
 * Filter fields active on load: only the dynamic filters with
 * a default value (`startValue`) are active before any interaction
 * (mirror of `initDefaultFilterValues`).
 */
const initialActiveFields = (config: DevConfig): string[] =>
  (config.filters || []).flatMap(f => (f.startValue && f.labelField ? [f.labelField] : []))

/**
 * A `valueMandatory` element only renders (neither embed nor actions bar) once
 * all its required filters are active (mirror of `computeMandatoryFilterIssues`).
 */
const mandatoryFiltersSatisfied = (el: DashboardElementConfig, activeFields: string[]): boolean => {
  if (!el.valueMandatory) return true
  return (el.mandatoryFilters || []).every(f => activeFields.includes(f))
}

/**
 * Elements that actually produce a `<d-frame>`: an `application` with
 * an id, a `tablePreview` or `download` (root dataset as fallback) and a
 * `form` with a dataset. A form without dataset renders no embed (invalid state),
 * nor does an application without id, and a `valueMandatory` element whose
 * required filters are not active shows a placeholder instead.
 * `extraActiveFields` carries the fields activated by the test before counting
 * (selection in a dynamic filter).
 */
const expectedFrames = (config: DevConfig, extraActiveFields: string[] = []): { type: 'application' | 'table' | 'download' | 'form' }[] => {
  const activeFields = [...new Set([...initialActiveFields(config), ...extraActiveFields])]
  return visibleElements(config)
    .filter(el => mandatoryFiltersSatisfied(el, activeFields))
    .map(el => {
      if (el.type === 'application') return el.application?.id ? { type: 'application' as const } : null
      if (el.type === 'tablePreview') return { type: 'table' as const }
      if (el.type === 'download') return { type: 'download' as const }
      if (el.type === 'form') return el.dataset?.id ? { type: 'form' as const } : null
      return null
    })
    .filter((e): e is { type: 'application' | 'table' | 'download' | 'form' } => !!e)
}

/**
 * Expected REST params for a static filter (same conventions as
 * `filters2params` of @data-fair/lib-utils: `_in/_nin/_gte/_lte/
 * _starts/_exists/_nexists` suffixes, space value for exists/nexists).
 */
const staticFilterParams = (sf: StaticFilter): Record<string, string> => {
  const key = fieldKeyOf(sf.field)
  switch (sf.type) {
    case 'in':
      return sf.values?.length ? { [`${key}_in`]: sf.values.join(',') } : {}
    case 'nin':
      return sf.values?.length ? { [`${key}_nin`]: sf.values.join(',') } : {}
    case 'interval': {
      const params: Record<string, string> = {}
      if (sf.minValue != null && sf.minValue !== '') params[`${key}_gte`] = String(sf.minValue)
      if (sf.maxValue != null && sf.maxValue !== '') params[`${key}_lte`] = String(sf.maxValue)
      return params
    }
    case 'starts':
      return sf.value != null && sf.value !== '' ? { [`${key}_starts`]: sf.value } : {}
    case 'exists':
      return { [`${key}_exists`]: ' ' }
    case 'notExists':
      return { [`${key}_nexists`]: ' ' }
  }
}

/** REST suffixes ordered from longest to shortest (unambiguous split). */
const REST_OPS = ['_nexists', '_starts', '_exists', '_nin', '_lte', '_gte', '_in'] as const

const splitRestKey = (key: string): { field: string; op: string } | null => {
  for (const op of REST_OPS) {
    if (key.endsWith(op)) return { field: key.slice(0, -op.length), op: op.slice(1) }
  }
  return null
}

const queryOf = (src: string): URLSearchParams => new URLSearchParams(src.split('?')[1] || '')

const findParam = (query: URLSearchParams, pattern: RegExp): string | undefined => {
  for (const key of query.keys()) {
    if (pattern.test(key)) return query.get(key) ?? undefined
  }
  return undefined
}

const getDevConfig = async (page: Page): Promise<DevConfig> => {
  const res = await page.request.get('/config')
  expect(res.ok(), `GET /config doit répondre (dev-server up). ${res.status()}`).toBeTruthy()
  return res.json() as Promise<DevConfig>
}

/**
 * Selects the first option of the non-slider dynamic filter at
 * `index` (config order: one autocomplete per non-slider filter,
 * sliders render a range slider).
 */
const selectFirstFilterOption = async (page: Page, index: number): Promise<void> => {
  const autocomplete = page.locator('.v-autocomplete').nth(index)
  await autocomplete.click()
  const firstOption = page.locator('.v-list-item').first()
  await expect(firstOption).toBeVisible({ timeout: 5_000 })
  await firstOption.click()
}

test.describe('Known bugs (regressions)', () => {
  test.use({ expectedConsole: embeddedVisusConsole })

  test('K1 — dynamic filters (v-autocomplete) render in their v-col', async ({ page }) => {
    await page.goto('/app/')
    const config = await getDevConfig(page)

    // Reliable mount marker, independent of the config content.
    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    // One autocomplete per dynamic filter declared in the config (slider
    // filters render a range slider, not an autocomplete).
    const filters = config.filters || []
    if (filters.length) {
      const autocompleteCount = filters.filter(f => !(f as { slider?: boolean }).slider).length
      await expect(page.locator('.v-autocomplete')).toHaveCount(autocompleteCount, { timeout: 5_000 })
    }
  })

  test('K2 — filters forwarded to embeds: dataset vs application, concept keys and unprefixing', async ({ page }) => {
    await page.goto('/app/')
    const config = await getDevConfig(page)

    const rootDatasetId = config.datasets?.[0]?.id
    const rootSchema = config.datasets?.[0]?.schema || []

    // `valueMandatory` elements only render their embed after their required
    // filters are selected: first select a value in the
    // first non-slider dynamic filter, as in real use, then
    // compute the expected frames with this selection active.
    const nonSliderFilters = (config.filters || []).filter(f => f.labelField && !f.slider)
    let unGateField: string | undefined
    if (nonSliderFilters.length) {
      await selectFirstFilterOption(page, 0)
      unGateField = nonSliderFilters[0].labelField
    }

    const frames = expectedFrames(config, unGateField ? [unGateField] : [])

    test.skip(frames.length === 0, 'La config courante n\'a aucun élément embarquable')

    // The order of the elements in the DOM follows the config order.
    const allFrames = page.locator('d-frame')
    await expect(allFrames).toHaveCount(frames.length, { timeout: 20_000 })

    const firstAppFrame = allFrames.first()
    const tableFormIndex = frames.findIndex(f => f.type !== 'application')
    const firstTableFormFrame = tableFormIndex >= 0 ? allFrames.nth(tableFormIndex) : null

    // 1) Each element renders the right embed type, with finalizedAt and d-frame.
    for (let i = 0; i < frames.length; i++) {
      const frame = allFrames.nth(i)
      await expect(frame).toBeVisible({ timeout: 20_000 })
      const src = await frame.getAttribute('src')
      expect(src, `Le src du d-frame #${i} doit être défini`).toBeTruthy()
      if (frames[i].type === 'application') {
        expect(src, "L'application doit être servie via /data-fair/app/").toMatch(/^\/data-fair\/app\//)
        expect(src, "L'application ne doit PAS être servie via /data-fair/embed/dataset/").not.toMatch(/^\/data-fair\/embed\/dataset\//)
      } else {
        expect(src, 'La vue dataset doit être servie via /data-fair/embed/dataset/').toMatch(/^\/data-fair\/embed\/dataset\//)
      }
      expect(src, 'finalizedAt doit être forwardé').toMatch(/[?&]finalizedAt=/)
      expect(src, 'd-frame=true doit être présent').toMatch(/[?&]d-frame=true/)
    }

    // 2) The static filters are propagated:
    //    - as dataset-scoped keys `<prefix>_d_<rootDatasetId>_<field>_<op>=`
    //      on the application embeds;
    //    - as unprefixed keys (`<field>_<op>=`) on the dataset views
    //      (the embed REST API expects unprefixed field names);
    //    - as concept keys `_c_<conceptId>_<op>` on both, when the field
    //      carries a concept (so that a visu on ANOTHER dataset reads them).
    const staticFilters = config.staticFilters || []
    const activeDynamicFields = new Set(unGateField ? [unGateField] : [])
    if (staticFilters.length && rootDatasetId) {
      for (const sf of staticFilters) {
        const params = staticFilterParams(sf)
        const query = queryOf(await firstAppFrame.getAttribute('src') || '')
        for (const [restKey, value] of Object.entries(params)) {
          const split = splitRestKey(restKey)
          if (split && activeDynamicFields.has(split.field)) continue
          const scoped = findParam(query, new RegExp(`^c?_d_${rootDatasetId}_${restKey}$`))
          expect(
            scoped,
            `L'URL de l'application doit contenir la clé dataset-scopée _d_${rootDatasetId}_${restKey} (${sf.type}). src=${query}`
          ).toBe(value)
          const conceptId = split ? rootSchema.find(f => f.key === split.field)?.['x-concept']?.id : undefined
          if (conceptId) {
            expect(
              query.get(`_c_${conceptId}_${split!.op}`),
              `L'URL de l'application doit contenir la clé concept _c_${conceptId}_${split!.op}. src=${query}`
            ).toBe(value)
          }
        }
      }
      if (firstTableFormFrame) {
        const tableQuery = queryOf(await firstTableFormFrame.getAttribute('src') || '')
        for (const sf of staticFilters) {
          for (const [restKey, value] of Object.entries(staticFilterParams(sf))) {
            const split = splitRestKey(restKey)
            if (split && activeDynamicFields.has(split.field)) continue
            expect(
              tableQuery.get(restKey),
              `L'URL de la vue table doit contenir la clé dé-préfixée ${restKey}. src=${tableQuery}`
            ).toBe(value)
          }
        }
      }
    }

    // 3) Selecting a value in a dynamic filter: the resolved value
    //    must be forwarded to the embeds (prefixed by the root dataset for
    //    applications, unprefixed for dataset views).
    //
    //    ⚠️ The probed filter must NOT be carried by a static filter (the
    //    key would already be in the srcs before any selection and the
    //    poll would pass trivially), nor be the one used above to
    //    unlock the valueMandatory elements (clicking it again could
    //    deselect the value). Without a candidate, the step is skipped.
    //
    //    The emitted keys follow `collectFilterEmitFields`: the
    //    `values` fields associated with the filter when they exist (values resolved via
    //    `/values/`), otherwise the labelField itself. A slider filter emits
    //    `_gte`/`_lte` bounds, no `_in`: it is skipped.
    const staticFields = new Set((config.staticFilters || []).map(sf => fieldKeyOf(sf.field)))
    const probeFilter = nonSliderFilters.find(f =>
      f.labelField && !staticFields.has(f.labelField) && f.labelField !== unGateField
    )
    if (probeFilter?.labelField && rootDatasetId) {
      const emitFields = probeFilter.values?.length ? probeFilter.values : [probeFilter.labelField]
      await selectFirstFilterOption(page, nonSliderFilters.indexOf(probeFilter))

      for (const emitField of emitFields) {
        const scopedKeyRegex = new RegExp(`(?:^|[?&])c?_d_${rootDatasetId}_${emitField}_in=`)
        await expect.poll(
          async () => await firstAppFrame.getAttribute('src'),
          { timeout: 10_000, message: `L'iframe de l'application doit recevoir le filtre résolu préfixé par le dataset racine (${emitField})` }
        ).toMatch(scopedKeyRegex)

        if (firstTableFormFrame) {
          const deprefixedKeyRegex = new RegExp(`(?:^|[?&])${emitField}_in=`)
          await expect.poll(
            async () => await firstTableFormFrame.getAttribute('src'),
            { timeout: 10_000, message: `L'iframe de la vue dataset doit recevoir le filtre dé-préfixé (${emitField})` }
          ).toMatch(deprefixedKeyRegex)
        }
      }
    }
  })

  test('K3 — switching a slider filter to a list (draft) clears the gte/lte bounds from the URL and the embeds', async ({ page }) => {
    await page.goto('/app/')
    const config = await getDevConfig(page)

    const sliderFilter = (config.filters || []).find(f => (f as { slider?: boolean }).slider)
    const rootDatasetId = config.datasets?.[0]?.id
    const frames = expectedFrames(config)

    test.skip(!sliderFilter || !rootDatasetId || frames.length === 0, 'La config courante n\'a pas de filtre slider embarquable')

    // Sets a bounds selection in the URL then checks it is propagated to the embeds.
    const gteKey = `_d_${rootDatasetId}_${sliderFilter!.labelField}_gte`
    const lteKey = `_d_${rootDatasetId}_${sliderFilter!.labelField}_lte`
    await page.evaluate(({ gteKey, lteKey }) => {
      const url = new URL(location.href)
      url.searchParams.set(gteKey, '5')
      url.searchParams.set(lteKey, '60')
      history.pushState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, { gteKey, lteKey })

    const firstFrame = page.locator('d-frame').first()
    const gteRegex = new RegExp(`(?:^|[?&])${gteKey}=`)
    await expect.poll(async () => await firstFrame.getAttribute('src'), { timeout: 10_000 }).toMatch(gteRegex)

    // Switches the filter to a list (slider off) via the draft set-config message.
    await page.evaluate(({ labelField }) => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      cfg.filters = (cfg.filters || []).map((f: { labelField: string }) => f.labelField === labelField ? { ...f, slider: false } : { ...f })
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    }, { labelField: sliderFilter!.labelField })

    // The URL and the embeds must no longer contain the stale gte/lte bounds.
    await expect.poll(
      async () => new URL(await page.evaluate(() => location.href)).searchParams.has(gteKey),
      { timeout: 10_000 }
    ).toBe(false)
    await expect.poll(
      async () => await firstFrame.getAttribute('src'),
      { timeout: 10_000 }
    ).not.toMatch(gteRegex)

    // Switch back to slider: the bounds being cleared, the slider returns to the full range
    // and the iframe must not receive an orphan gte/lte.
    await page.evaluate(({ labelField }) => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      cfg.filters = (cfg.filters || []).map((f: { labelField: string }) => f.labelField === labelField ? { ...f, slider: true } : { ...f })
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    }, { labelField: sliderFilter!.labelField })

    await expect(page.locator('.v-range-slider')).toBeVisible({ timeout: 10_000 })
    await expect.poll(
      async () => await firstFrame.getAttribute('src'),
      { timeout: 10_000 }
    ).not.toMatch(gteRegex)
  })

  test('K4 — the actions bar stays in its row with automatic height', async ({ page }) => {
    await page.goto('/app/')
    const config = await getDevConfig(page)

    // As in K2: a `valueMandatory` application element renders neither iframe
    // nor actions bar before its required filters are selected. We
    // first select a value in the first non-slider dynamic
    // filter, then derive the resulting active fields.
    const nonSliderFilters = (config.filters || []).filter(f => f.labelField && !f.slider)
    if (nonSliderFilters.length) {
      await selectFirstFilterOption(page, 0)
    }
    const activeFields = [...initialActiveFields(config), ...nonSliderFilters.slice(0, 1).flatMap(f => f.labelField ? [f.labelField] : [])]

    // An actions bar only appears for an application element (embed/capture
    // buttons) or a table view (sources falling back on the dataset).
    const hasActionBarElement = visibleElements(config).some(el => {
      if (!mandatoryFiltersSatisfied(el, activeFields)) return false
      if (el.type === 'application') return !!el.application?.id && !!el.application.href
      if (el.type === 'tablePreview') return true
      return false
    })
    test.skip(!hasActionBarElement, 'La config courante n\'a aucun élément avec barre d\'actions rendu')

    // Forces auto mode (heights -1) and the display of actions: in the
    // buggy state, the actions bar of an element overlaps the next
    // element (height:100% resolved on a flex wrap row). The three flags
    // are enabled because the sources list of an application can be
    // unreadable in some contexts (missing readConfig permission);
    // the capture/embed buttons depend on no fetch.
    await page.evaluate(() => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      cfg.showSources = true
      cfg.showEmbed = true
      cfg.showCapture = true
      ;(cfg.sections || []).forEach((s: { rows?: { height?: number }[] }) => (s.rows || []).forEach(r => { r.height = -1 }))
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    })

    // An actions bar must appear below the eligible elements.
    await expect(
      page.locator('.v-card-actions').first()
    ).toBeVisible({ timeout: 20_000 })

    // No actions bar may intersect the title or the d-frame of
    // ANOTHER element (its own bar follows its iframe exactly, without
    // overlap: bar.top === frame.bottom).
    await expect.poll(async () => {
      const boxes = await page.evaluate(() => {
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect()
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        }
        return {
          frames: [...document.querySelectorAll('d-frame')].map(rect),
          titles: [...document.querySelectorAll('h4')].map(rect),
          bars: [...document.querySelectorAll('.v-card-actions')].map(rect)
        }
      })
      const intersects = (a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }) =>
        a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
      for (const bar of boxes.bars) {
        if (boxes.frames.some(frame => intersects(bar, frame))) return false
        if (boxes.titles.some(title => intersects(bar, title))) return false
      }
      return true
    }, {
      timeout: 20_000,
      message: 'La barre d\'actions (sources) chevauche un autre élément (régression hauteur automatique)'
    }).toBe(true)
  })

  test('K5 — compare view: filters forwarded to embeds are unprefixed', async ({ page }) => {
    // The compare view is driven by the URL (`view=compare`): the switch
    // is only visible with `allowDuplicate`, but the URL is enough to render the
    // two columns (column prefix `c` on the right).
    await page.goto('/app/?view=compare')
    const config = await getDevConfig(page)

    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    // Unlocks the `valueMandatory` elements in BOTH columns: one
    // autocomplete per non-slider filter and per column (the left column's
    // filters precede the right column's in the DOM).
    const nonSliderFilters = (config.filters || []).filter(f => f.labelField && !f.slider)
    let unGateField: string | undefined
    if (nonSliderFilters.length) {
      await selectFirstFilterOption(page, 0)
      await selectFirstFilterOption(page, nonSliderFilters.length)
      unGateField = nonSliderFilters[0].labelField
    }

    const virtualFrames = expectedFrames(config, unGateField ? [unGateField] : [])
    test.skip(virtualFrames.length === 0, 'La config courante n\'a aucun élément embarquable')

    const allFrames = page.locator('d-frame')
    await expect(allFrames).toHaveCount(virtualFrames.length * 2, { timeout: 20_000 })
    const srcs = await allFrames.evaluateAll(els => els.map(el => el.getAttribute('src') || ''))

    // 1) No embed may carry a key prefixed by the compare column
    //    (`c_d_...`): applications read the `_d_<datasetId>_...` format
    //    (`getConceptFilters`) and dataset views are unprefixed by
    //    `stripDatasetScope`.
    for (const src of srcs) {
      const query = queryOf(src)
      for (const key of query.keys()) {
        expect(key, `Aucun embed ne doit porter une clé c_d_* (mode comparaison). src=${query}`).not.toMatch(/^c_d_/)
      }
    }

    // 2) The static filters are forwarded to the applications of both columns
    //    as `_d_<rootDatasetId>_<field>_<op>` (fields whose
    //    dynamic filter is active win and are skipped).
    const rootDatasetId = config.datasets?.[0]?.id
    const staticFilters = config.staticFilters || []
    const hasFilteredApp = visibleElements(config).some(el => el.type === 'application' && !!el.application?.id)
    if (staticFilters.length && rootDatasetId && hasFilteredApp) {
      const activeFields = new Set([...initialActiveFields(config), ...(unGateField ? [unGateField] : [])])
      for (const src of srcs.filter(s => s.includes('/data-fair/app/'))) {
        const query = queryOf(src)
        for (const sf of staticFilters) {
          for (const [restKey, value] of Object.entries(staticFilterParams(sf))) {
            const split = splitRestKey(restKey)
            if (split && activeFields.has(split.field)) continue
            expect(
              findParam(query, new RegExp(`^_d_${rootDatasetId}_${restKey}$`)),
              `L'application doit recevoir le static filter dé-préfixé _d_${rootDatasetId}_${restKey}. src=${query}`
            ).toBe(value)
          }
        }
      }
    }
  })

  test('K6 — d-frame sizing: fixed height honored (even with df:overflow) and aspect ratio as fallback', async ({ page }) => {
    await page.goto('/app/')
    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    const firstFrame = page.locator('d-frame').first()
    await expect(firstFrame).toBeVisible({ timeout: 20_000 })

    // 1) With fixed height (800px), the d-frame must carry an explicit height and no aspect-ratio
    await page.evaluate(() => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      if (cfg.sections?.[0]?.rows?.[0]) {
        cfg.sections[0].rows[0].height = 800
      }
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    })

    await expect(firstFrame).toHaveAttribute('style', /height:\s*\d+px/)
    expect(await firstFrame.getAttribute('aspect-ratio')).toBeNull()

    // 2) With auto (undefined) height, the d-frame must carry aspect-ratio="" for the responsive fallback
    await page.evaluate(() => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      if (cfg.sections?.[0]?.rows?.[0]) {
        delete cfg.sections[0].rows[0].height
      }
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    })

    await expect(firstFrame).toHaveAttribute('aspect-ratio', '')
    const autoStyle = (await firstFrame.getAttribute('style')) || ''
    expect(autoStyle).not.toContain('height:')
  })

  test('K7 — height per breakpoint: fixed from md up, auto fallback on mobile', async ({ page }) => {
    await page.goto('/app/')
    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    const frames = page.locator('d-frame')
    await expect(frames.first()).toBeVisible({ timeout: 20_000 })

    // Every row switches to per-breakpoint height: the test stays
    // independent of the structure (columns split the row height
    // among their children, so a d-frame there does not carry the md value).
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate(() => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      ;(cfg.sections || []).forEach((s: { rows?: { height?: number, heights?: unknown }[] }) => (s.rows || []).forEach(r => {
        r.heights = { default: -1, md: 800 }
        delete r.height
      }))
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    })

    const frameStyles = () => frames.evaluateAll(els => els.map(el => ({
      style: el.getAttribute('style') || '',
      aspectRatio: el.getAttribute('aspect-ratio')
    })))
    // Desktop (lg): the md value applies by cascade, each embed has an explicit height.
    await expect.poll(async () => (await frameStyles()).every(f => /height:\s*\d+px/.test(f.style) && f.aspectRatio === null)).toBe(true)

    // Mobile (xs): default -1 → automatic height and fallback on the aspect ratio.
    await page.setViewportSize({ width: 390, height: 800 })
    await expect.poll(async () => (await frameStyles()).every(f => f.aspectRatio === '' && !f.style.includes('height:'))).toBe(true)
  })
})

test.describe('Search in filters', () => {
  // carto-stats (vue-router 3) rejects a redundant router.replace, uncaught, when a filter changes.
  test.use({ expectedConsole: [...embeddedVisusConsole, 'Avoided redundant navigation to current location'] })

  test('K8 — filter search: the API response is not filtered again (accents, hyphens), showAllValues mode ignores accents', async ({ page }) => {
    await page.route('**/values-labels/**', route => route.fulfill({
      json: [{ value: 'Nîmes', label: 'Nîmes' }, { value: 'Saint-Étienne', label: 'Saint-Étienne' }],
      headers: { 'access-control-allow-origin': '*' }
    }))
    await page.goto('/app/')
    const config = await getDevConfig(page)
    const autocomplete = page.locator('.v-autocomplete input:not([type=hidden])').first()
    test.skip(!(config.filters || []).some(f => !(f as { slider?: boolean }).slider), 'La config courante n\'a pas de filtre liste')
    await expect(autocomplete).toBeVisible({ timeout: 20_000 })

    // Server search: the API already found the value, yet the label does
    // not contain the typed text.
    const option = (name: string) => page.locator('.v-list-item').filter({ hasText: name })
    await autocomplete.fill('nimes')
    await expect(option('Nîmes')).toBeVisible({ timeout: 5_000 })
    await autocomplete.fill('saint etienne')
    await expect(option('Saint-Étienne')).toBeVisible({ timeout: 5_000 })

    // showAllValues: no server search, the filter stays client-side.
    await autocomplete.fill('')
    await page.evaluate(() => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      for (const filter of cfg.filters) filter.showAllValues = true
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    })
    await autocomplete.fill('nimes')
    await expect(option('Nîmes')).toBeVisible({ timeout: 5_000 })
    await expect(option('Saint-Étienne')).toHaveCount(0)
  })
})
