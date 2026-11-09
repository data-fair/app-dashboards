import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect, embeddedVisusConsole } from './fixtures'

// Minimal d-frame child used by R2: it has the same URL-sync contract as a
// visu, without depending on a remote application build.
const dFrameContent = readFileSync('node_modules/@data-fair/frame/dist/d-frame-content.min.js', 'utf8')

/**
 * Relais des filtres émis par un visu embarqué (canal privé par élément).
 *
 * Le visu écrit dans son URL un filtre `_d_<datasetId>_<champ>_<op>` (sans
 * marqueur). Ses clés remontent namespacées (`<clé d'élément>_…`) puis le
 * dashboard les reprojette vers le namespace propre `_c*`/`_d*` selon le mode
 * `syncParams` de l'élément :
 *  - « partage des filtres » (défaut) : la clé est publiée et atteint les autres
 *    visus, qui décident de la traiter en filtre ou en mise en évidence ;
 *  - « cloisonné » : la clé reste dans le canal privé de l'émetteur, rien n'est
 *    partagé ;
 *  - « aucune synchronisation » : aucun canal, l'état du visu n'est pas conservé.
 *
 * La visu réelle n'émet pas encore (chantier visus) : le test simule le clic en
 * écrivant l'URL de l'iframe, ce que fait exactement une visu à la sélection.
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

/** Id d'application d'une src `/data-fair/app/<id>` (accessKey `%3A`-préfixée en option). */
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

/** Change le mode de sync de l'élément portant cette application (config draft). */
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

/** Simule une émission dans la visu : la clé de filtre dans son URL. */
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

test.describe('Relais des filtres émis par un visu', () => {
  test.use({
    expectedConsole: [
      ...embeddedVisusConsole,
      redundantNavigation,
      'Failed to load resource: the server responded with a status of 400'
    ]
  })

  test('R1 — un filtre émis remonte et se propage selon le mode syncParams', async ({ page }) => {
    let redundantNavigations = 0
    page.on('pageerror', (err) => { if (err.message.includes(redundantNavigation)) redundantNavigations++ })
    await page.goto('/app/')
    const config = await getDevConfig(page)
    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    // Ingrédients : un dataset racine, un visu émetteur (application) et un
    // autre visu avec un champ non utilisé par les filtres du dashboard (la clé
    // émise ne doit pas être « possédée »).
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

    // Clé de l'état privé de l'émetteur : `<scope>_<clé>` (le scope encode le
    // chemin de colonnes, ex. `column-0-application-<id>`).
    const dashboardParams = async () => new URL(await page.evaluate(() => location.href)).searchParams
    const hasNamespaced = (params: URLSearchParams): boolean => [...params.keys()].some(k => k !== key && k.endsWith(`_${key}`))

    const receiverFrame = async () => {
      const all = await frames(page)
      return all.find(f => f.appId !== emitterAppId && (receiver!.type === 'application' ? f.appId : f.src.startsWith('/data-fair/embed/dataset/')))
    }

    // Le visu émetteur écrit son filtre dans sa propre URL.
    await emitFilter(page, emitterAppId, { [key]: value })

    // 1) « partage des filtres » (défaut) : la clé est projetée dans l'URL du
    //    dashboard et atteint le récepteur.
    await expect.poll(
      async () => Object.fromEntries((await dashboardParams()).entries()),
      { timeout: 10_000, message: 'le filtre émis doit être projeté dans l\'URL du dashboard' }
    ).toMatchObject({ [key]: value })
    expect(hasNamespaced(await dashboardParams()), 'le canal privé namespacé doit être conservé').toBe(true)
    await expect.poll(async () => (await receiverFrame())?.query[key], { timeout: 10_000, message: 'le récepteur doit recevoir la clé' }).toBe(value)

    // 2) Aucun aller-retour d'URL : deux relevés espacés sont identiques.
    const first = await page.evaluate(() => location.search)
    await page.waitForTimeout(700)
    expect(await page.evaluate(() => location.search)).toBe(first)

    // 3) « cloisonné » : plus de clé propre dans l'URL du dashboard, le
    //    récepteur ne la reçoit plus, l'émetteur garde son état dans son canal.
    await setSyncParams(page, emitterAppId, 'sandboxed')
    await expect.poll(
      async () => (await dashboardParams()).has(key),
      { timeout: 10_000, message: 'en mode cloisonné, la clé projetée doit disparaître de l\'URL' }
    ).toBe(false)
    await expect.poll(async () => (await receiverFrame())?.query[key], { timeout: 10_000, message: 'le récepteur ne doit plus recevoir la clé' }).toBeUndefined()
    expect(hasNamespaced(await dashboardParams()), 'le canal privé de l\'émetteur reste').toBe(true)

    // 4) « aucune synchronisation » : le canal privé est purgé.
    await setSyncParams(page, emitterAppId, 'none')
    await expect.poll(
      async () => hasNamespaced(await dashboardParams()),
      { timeout: 10_000, message: 'en mode none, le canal privé doit être purgé' }
    ).toBe(false)

    // 5) Pas de boucle de relais : l'écho d'un filtre retiré n'est pas republié.
    expect(redundantNavigations, 'boucle de relais avec le récepteur').toBeLessThan(20)
  })

  test('R2 — mode comparaison : la sélection croise sans changer le filtre d\'année', async ({ page }) => {
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

    // Le clic gauche (2024) sélectionne le projet 4 ; la colonne 2025 le reçoit
    // sans perdre son année.
    await setIn(0, '4')
    await expect.poll(async () => [await projectOf(0), await projectOf(1)], { timeout: 10_000 }).toEqual(['4', '4'])
    await expect.poll(async () => [await yearOf(0), await yearOf(1)], { timeout: 10_000 }).toEqual(['2024', '2025'])

    // Le clic droit (2025) sélectionne le projet 5 ; la colonne 2024 revient à 5.
    await setIn(1, '5')
    await expect.poll(async () => [await projectOf(0), await projectOf(1)], { timeout: 10_000 }).toEqual(['5', '5'])
    await expect.poll(async () => [await yearOf(0), await yearOf(1)], { timeout: 10_000 }).toEqual(['2024', '2025'])

    // Un effacement se propage aux deux colonnes.
    await setIn(0, null)
    await expect.poll(async () => [await projectOf(0), await projectOf(1)], { timeout: 10_000 }).toEqual([null, null])
  })
})
