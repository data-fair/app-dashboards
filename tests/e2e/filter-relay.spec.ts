import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, expect, embeddedVisusConsole } from './fixtures'

// Minimal d-frame child used by R2: it has the same URL-sync contract as a
// visu, without depending on a remote application build.
const dFrameContent = readFileSync('node_modules/@data-fair/frame/dist/d-frame-content.min.js', 'utf8')

/**
 * Relay of the filters emitted by an embedded visu (private channel per element).
 *
 * The visu writes a `_d_<datasetId>_<field>_<op>` filter in its URL (without
 * marker). Its keys go up namespaced (`<element key>_…`) then the
 * dashboard projects them into the clean `_c*`/`_d*` namespace according to the
 * element's `syncParams` mode:
 *  - « partage des filtres » (default): the key is published and reaches the other
 *    visus, which decide whether to treat it as a filter or a highlight;
 *  - « cloisonné »: the key stays in the emitter's private channel, nothing is
 *    shared;
 *  - « aucune synchronisation »: no channel, the visu's state is not kept.
 *
 * The real visu does not emit yet (visus work in progress): the test simulates the
 * click by writing the iframe URL, exactly what a visu does on selection.
 */

interface DevConfig {
  filters?: { labelField?: string; values?: string[] }[]
  staticFilters?: { field: string | { key: string } }[] | null
  datasets?: { id?: string; schema?: { key?: string }[] }[]
  sections?: { rows?: { elements?: ElementConfig[] }[] }[]
}

interface ElementConfig {
  type: string
  application?: { id?: string }
  syncParams?: string
  elements?: ElementConfig[]
}

const fieldKeyOf = (field: string | { key: string }): string => typeof field === 'string' ? field : field.key

const flattenElements = (elements: ElementConfig[]): ElementConfig[] =>
  elements.flatMap(el => el.type === 'column' ? flattenElements(el.elements || []) : [el])

const flatElements = (config: DevConfig): ElementConfig[] =>
  (config.sections || []).flatMap(section => (section.rows || []).flatMap(row => flattenElements(row.elements || [])))

const getDevConfig = async (page: Page): Promise<DevConfig> => {
  const res = await page.request.get('/config')
  expect(res.ok(), `GET /config doit répondre (dev-server up). ${res.status()}`).toBeTruthy()
  return res.json() as Promise<DevConfig>
}

/** Application id of a `/data-fair/app/<id>` src (optionally `%3A`-prefixed accessKey). */
const appIdOf = (src: string): string | undefined => {
  const match = src.match(/^\/data-fair\/app\/([^?]+)/)
  return match ? decodeURIComponent(match[1]).split(':').pop() : undefined
}

const frames = async (page: Page): Promise<{ src: string, query: Record<string, string>, appId?: string }[]> =>
  page.locator('d-frame').evaluateAll(els => els.map(el => {
    const src = el.getAttribute('src') || ''
    return {
      src,
      query: Object.fromEntries(new URLSearchParams(src.split('?')[1] || ''))
    }
  })).then(list => list.map(frame => ({ ...frame, appId: appIdOf(frame.src) })))

/** Changes the sync mode of the element carrying this application (draft config). */
const setSyncParams = async (page: Page, appId: string, syncParams: string): Promise<void> => {
  await page.evaluate(({ appId, syncParams }) => {
    const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
    const walk = (elements: any[]): void => {
      for (const el of elements) {
        if (el.application?.id === appId) el.syncParams = syncParams
        if (el.elements) walk(el.elements)
      }
    }
    for (const section of cfg.sections || []) for (const row of section.rows || []) walk(row.elements || [])
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { type: 'set-config', content: cfg }
    }))
  }, { appId, syncParams })
}

/** Simulates an emission in the visu: the filter key in its URL. */
const emitFilter = async (page: Page, appId: string, params: Record<string, string>): Promise<void> => {
  const frame = page.frames().find(f => f.url().includes(`/data-fair/app/${appId}`))
  expect(frame, `iframe de ${appId} introuvable`).toBeTruthy()
  await frame!.evaluate((params) => {
    const url = new URL(location.href)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    history.replaceState(history.state, '', url.toString())
  }, params)
}

// carto-stats 1.0 (vue-router 3) rejects, without catching it, a router.replace
// towards its current query sent in another key order by d-frame: a few during
// the mode switches. Counted below: a relay loop throws it by the hundreds.
const redundantNavigation = 'Avoided redundant navigation to current location'

test.describe('Relay of the filters emitted by a visu', () => {
  test.use({
    expectedConsole: [
      ...embeddedVisusConsole,
      redundantNavigation,
      'Failed to load resource: the server responded with a status of 400'
    ]
  })

  test('R1 — an emitted filter goes up and propagates according to the syncParams mode', async ({ page }) => {
    let redundantNavigations = 0
    page.on('pageerror', (err) => { if (err.message.includes(redundantNavigation)) redundantNavigations++ })
    await page.goto('/app/')
    const config = await getDevConfig(page)
    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    // Ingredients: a root dataset, an emitting visu (application) and
    // another visu with a field not used by the dashboard filters (the emitted
    // key must not be "owned").
    const rootDatasetId = config.datasets?.[0]?.id
    const usedFields = new Set([
      ...(config.filters || []).flatMap(f => [f.labelField, ...(f.values || [])]),
      ...(config.staticFilters || []).map(sf => fieldKeyOf(sf.field))
    ].filter(Boolean) as string[])
    const field = (config.datasets?.[0]?.schema || [])
      .map(f => f.key)
      .find(key => key && !usedFields.has(key))

    const elements = flatElements(config)
    const emitter = elements.find(el => el.type === 'application' && el.application?.id)
    const receiver = elements.find(el => el !== emitter && ((el.type === 'application' && el.application?.id) || el.type === 'tablePreview'))

    test.skip(!rootDatasetId || !field || !emitter || !receiver, 'config de dev sans visu émetteur/récepteur exploitable')

    await expect(page.locator('d-frame').first()).toBeVisible({ timeout: 20_000 })
    const emitterAppId = emitter!.application!.id!
    const key = `_d_${rootDatasetId}_${field}_in`
    const value = 'ValeurFiltre'

    // Key of the emitter's private state: `<scope>_<key>` (the scope encodes the
    // column path, e.g. `column-0-application-<id>`).
    const dashboardParams = async () => new URL(await page.evaluate(() => location.href)).searchParams
    const hasNamespaced = (params: URLSearchParams): boolean => [...params.keys()].some(k => k !== key && k.endsWith(`_${key}`))

    const receiverFrame = async () => {
      const all = await frames(page)
      return all.find(f => f.appId !== emitterAppId && (receiver!.type === 'application' ? f.appId : f.src.startsWith('/data-fair/embed/dataset/')))
    }

    // The emitting visu writes its filter in its own URL.
    await emitFilter(page, emitterAppId, { [key]: value })

    // 1) « partage des filtres » (default): the key is projected into the
    //    dashboard URL and reaches the receiver.
    await expect.poll(
      async () => Object.fromEntries((await dashboardParams()).entries()),
      { timeout: 10_000, message: 'le filtre émis doit être projeté dans l\'URL du dashboard' }
    ).toMatchObject({ [key]: value })
    expect(hasNamespaced(await dashboardParams()), 'le canal privé namespacé doit être conservé').toBe(true)
    await expect.poll(async () => (await receiverFrame())?.query[key], { timeout: 10_000, message: 'le récepteur doit recevoir la clé' }).toBe(value)

    // 2) No URL round trip: two spaced readings are identical.
    const first = await page.evaluate(() => location.search)
    await page.waitForTimeout(700)
    expect(await page.evaluate(() => location.search)).toBe(first)

    // 3) « cloisonné »: no more clean key in the dashboard URL, the
    //    receiver no longer gets it, the emitter keeps its state in its channel.
    await setSyncParams(page, emitterAppId, 'sandboxed')
    await expect.poll(
      async () => (await dashboardParams()).has(key),
      { timeout: 10_000, message: 'en mode cloisonné, la clé projetée doit disparaître de l\'URL' }
    ).toBe(false)
    await expect.poll(async () => (await receiverFrame())?.query[key], { timeout: 10_000, message: 'le récepteur ne doit plus recevoir la clé' }).toBeUndefined()
    expect(hasNamespaced(await dashboardParams()), 'le canal privé de l\'émetteur reste').toBe(true)

    // 4) « aucune synchronisation »: the private channel is purged.
    await setSyncParams(page, emitterAppId, 'none')
    await expect.poll(
      async () => hasNamespaced(await dashboardParams()),
      { timeout: 10_000, message: 'en mode none, le canal privé doit être purgé' }
    ).toBe(false)

    // 5) No relay loop: the echo of a withdrawn filter is not republished.
    expect(redundantNavigations, 'boucle de relais avec le récepteur').toBeLessThan(20)
  })

  test('R2 — compare view: the selection crosses over without changing the year filter', async ({ page }) => {
    const appId = 'test-emitter'
    const datasetId = 'nkgybhhtnhiufg4wtokjsmz-'
    const yearKey = `_d_${datasetId}_annee_in`
    const selectionKey = `_d_${datasetId}_id_unique_projet_eq`

    // Minimal d-frame child: it keeps the URL-sync contract of a visu and
    // exposes setSelection() to simulate a click without a remote app build.
    const stubScript = `<script>
      window.vIframeOptions = { reactiveParams: Object.fromEntries(new URL(location.href).searchParams) }
      window.setSelection = function (key, value) {
        const params = window.vIframeOptions.reactiveParams
        if (value == null) delete params[key]
        else params[key] = value
        const url = new URL(location.href)
        if (value == null) url.searchParams.delete(key)
        else url.searchParams.set(key, value)
        history.replaceState(history.state, '', url.toString())
      }
    </script>`
    await page.context().route(new RegExp(`/data-fair/app/${appId}`), route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <script>${dFrameContent}</script>
        ${stubScript}
      </body></html>`
    }))

    await page.goto(`/app/?view=compare&${yearKey}=2024&c${yearKey}=2025`)
    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    const config = {
      datasets: [{
        id: datasetId,
        href: `https://koumoul.com/data-fair/api/v1/datasets/${datasetId}`,
        title: 'Production annuelle de biométhane',
        finalizedAt: '2026-10-31T23:08:32.326Z',
        schema: [
          { key: 'annee', type: 'integer', title: 'Année', 'x-originalName': 'annee' },
          { key: 'id_unique_projet', type: 'integer', title: 'ID unique projet', 'x-originalName': 'id_unique_projet' },
          { key: '_id', type: 'string', title: 'Identifiant' }
        ]
      }],
      filters: [{ labelField: 'annee', values: ['annee'], multipleValues: false, showAllValues: true, slider: false }],
      allowDuplicate: true,
      sections: [{
        rows: [{
          elements: [{
            type: 'application',
            syncParams: 'shared-filters',
            application: { id: appId }
          }]
        }]
      }]
    }
    await page.evaluate((cfg) => {
      window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'set-config', content: cfg } }))
    }, config)

    const appFrames = () => page.frames().filter(f => f.url().includes(`/data-fair/app/${appId}`))
    const stateOf = async (index: number) => {
      try {
        return await appFrames()[index].evaluate(
          () => ((window as unknown as { vIframeOptions?: { reactiveParams?: Record<string, unknown> } }).vIframeOptions?.reactiveParams || {})
        )
      } catch {
        // The stub may be navigating to its updated src: retry on the next poll.
        return {}
      }
    }
    const yearOf = async (index: number) => String((await stateOf(index))[yearKey] ?? '').replaceAll('"', '')
    const projectOf = async (index: number) => (await stateOf(index))[selectionKey] ?? null

    await expect(page.locator('d-frame')).toHaveCount(2, { timeout: 30_000 })
    await expect.poll(() => appFrames().length, { timeout: 30_000 }).toBe(2)
    await expect.poll(async () => {
      try {
        const ready = await Promise.all(appFrames().map(frame => frame.evaluate(
          () => Boolean((window as unknown as { __d_frame__content?: { initialized?: boolean } }).__d_frame__content?.initialized)
        )))
        return ready.length === 2 && ready.every(Boolean)
      } catch {
        // The stub may be navigating to its updated src: retry on the next poll.
        return false
      }
    }, { timeout: 30_000 }).toBe(true)
    await expect.poll(async () => [await yearOf(0), await yearOf(1)], { timeout: 30_000 }).toEqual(['2024', '2025'])

    const setIn = (index: number, value: string | null) => appFrames()[index].evaluate(
      ({ selectionKey, value }) => {
        (window as unknown as { setSelection: (key: string, value: string | null) => void }).setSelection(selectionKey, value)
      },
      { selectionKey, value }
    )

    // The left click (2024) selects project 4; the 2025 column receives it
    // without losing its year.
    await setIn(0, '4')
    await expect.poll(async () => [await projectOf(0), await projectOf(1)], { timeout: 10_000 }).toEqual(['4', '4'])
    await expect.poll(async () => [await yearOf(0), await yearOf(1)], { timeout: 10_000 }).toEqual(['2024', '2025'])

    // The right click (2025) selects project 5; the 2024 column goes back to 5.
    await setIn(1, '5')
    await expect.poll(async () => [await projectOf(0), await projectOf(1)], { timeout: 10_000 }).toEqual(['5', '5'])
    await expect.poll(async () => [await yearOf(0), await yearOf(1)], { timeout: 10_000 }).toEqual(['2024', '2025'])

    // A clear propagates to both columns.
    await setIn(0, null)
    await expect.poll(async () => [await projectOf(0), await projectOf(1)], { timeout: 10_000 }).toEqual([null, null])
  })
})
