import type { Page } from '@playwright/test'
import { test, expect, embeddedVisusConsole } from './fixtures'

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

test.describe('Relais des filtres émis par un visu', () => {
  test.use({ expectedConsole: embeddedVisusConsole })

  test('R1 — un filtre émis remonte et se propage selon le mode syncParams', async ({ page }) => {
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
  })
})
