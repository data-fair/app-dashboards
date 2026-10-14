import { test, expect, type Page } from '@playwright/test'

/**
 * Relais des filtres et sélections émis par un visu embarqué (convention `_s_`).
 *
 * Le visu écrit dans son URL un filtre `_d_<datasetId>_<champ>_<op>` et, pour
 * une sélection, le marqueur `_s_<datasetId>_<champ>=app_<applicationId>`. Ses
 * clés remontent namespacées (`<clé d'élément>_…`) puis sont reprojetées par le
 * dashboard selon `propagation` :
 *  - « en filtre » (défaut) : les autres visus reçoivent le filtre sans le
 *    marqueur, et se restreignent ;
 *  - « en sélection » : ils reçoivent aussi le marqueur ;
 *  - « aucune » : rien ne sort (le visu garde son état dans son canal privé).
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
  ignoreFilters?: boolean
  propagation?: { selection?: string; filter?: boolean }
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

/** Change la propagation de l'élément portant cette application (config draft). */
const setPropagation = async (page: Page, appId: string, propagation: Record<string, unknown>): Promise<void> => {
  await page.evaluate(({ appId, propagation }) => {
    const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
    const walk = (elements: any[]): void => {
      for (const el of elements) {
        if (el.application?.id === appId) el.propagation = propagation
        if (el.elements) walk(el.elements)
      }
    }
    for (const section of cfg.sections || []) for (const row of section.rows || []) walk(row.elements || [])
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { type: 'set-config', content: cfg }
    }))
  }, { appId, propagation })
}

/** Simule une sélection dans la visu : la clé de filtre + son marqueur dans son URL. */
const emitSelection = async (page: Page, appId: string, params: Record<string, string>): Promise<void> => {
  const frame = page.frames().find(f => f.url().includes(`/data-fair/app/${appId}`))
  expect(frame, `iframe de ${appId} introuvable`).toBeTruthy()
  await frame!.evaluate((params) => {
    const url = new URL(location.href)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    history.replaceState(history.state, '', url.toString())
  }, params)
}

test.describe('Relais des filtres émis par un visu', () => {
  test('R1 — la sélection d\'un visu remonte et se propage selon sa configuration', async ({ page }) => {
    await page.goto('/app/')
    const config = await getDevConfig(page)
    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    // Ingrédients : un dataset racine, un visu émetteur (application) et un
    // autre visu qui n'ignore pas les filtres, avec un champ non utilisé par
    // les filtres du dashboard (la clé émise ne doit pas être « possédée »).
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
    const receiver = elements.find(el => el !== emitter && !el.ignoreFilters && ((el.type === 'application' && el.application?.id) || el.type === 'tablePreview'))

    test.skip(!rootDatasetId || !field || !emitter || !receiver, 'config de dev sans visu émetteur/récepteur exploitable')

    await expect(page.locator('d-frame').first()).toBeVisible({ timeout: 20_000 })
    const emitterAppId = emitter!.application!.id!
    const key = `_d_${rootDatasetId}_${field}_in`
    const marker = `_s_${rootDatasetId}_${field}`
    const value = 'ValeurSélection'
    const markerValue = `app_${emitterAppId}`

    // Le visu émetteur écrit sa sélection dans sa propre URL.
    await emitSelection(page, emitterAppId, { [key]: value, [marker]: markerValue })

    // 1) L'URL du dashboard reçoit le filtre ET le marqueur (projection).
    await expect.poll(
      async () => Object.fromEntries(new URL(await page.evaluate(() => location.href)).searchParams.entries()),
      { timeout: 10_000, message: 'le filtre émis doit être projeté dans l\'URL du dashboard' }
    ).toMatchObject({ [key]: value, [marker]: markerValue })
    // …et le canal privé de l'émetteur conserve son état.
    const dashboardUrl = new URL(await page.evaluate(() => location.href))
    expect([...dashboardUrl.searchParams.keys()].some(k => k.includes('__d_' + rootDatasetId)), 'le canal privé namespacé doit être conservé').toBe(true)

    // 2) Le récepteur se restreint (défaut « en filtre ») : filtre sans marqueur.
    const checkRelay = async (expectMarker: boolean) => {
      const all = await frames(page)
      const receiverFrame = all.find(f => f.appId !== emitterAppId && (receiver!.type === 'application' ? f.appId : f.src.startsWith('/data-fair/embed/dataset/')))
      expect(receiverFrame, 'iframe réceptrice introuvable').toBeTruthy()
      expect(receiverFrame!.query[key], 'le filtre émis doit atteindre le récepteur').toBe(value)
      if (expectMarker) expect(receiverFrame!.query[marker]).toBe(markerValue)
      else expect(receiverFrame!.query[marker]).toBeUndefined()
      const emitterFrame = all.find(f => f.appId === emitterAppId)
      expect(emitterFrame!.query[marker], 'l\'émetteur garde son propre marqueur').toBe(markerValue)
    }
    await expect.poll(async () => (await frames(page)).some(f => f.query[key] === value), { timeout: 10_000 }).toBe(true)
    await checkRelay(false)

    // 3) Aucun aller-retour d'URL : deux relevés espacés sont identiques.
    const first = await page.evaluate(() => location.search)
    await page.waitForTimeout(700)
    expect(await page.evaluate(() => location.search)).toBe(first)

    // 4) Sélection propagée en sélection : le marqueur suit.
    await setPropagation(page, emitterAppId, { selection: 'selection' })
    await expect.poll(async () => {
      const all = await frames(page)
      return all.filter(f => f.appId !== emitterAppId).some(f => f.query[marker] === markerValue)
    }, { timeout: 10_000, message: 'en mode sélection, le marqueur doit atteindre les autres visus' }).toBe(true)
    await checkRelay(true)

    // 5) Aucune propagation : plus rien dans l'URL du dashboard, l'émetteur
    //    garde son état dans son canal privé.
    await setPropagation(page, emitterAppId, { selection: 'none' })
    await expect.poll(
      async () => new URL(await page.evaluate(() => location.href)).searchParams.has(key),
      { timeout: 10_000, message: 'en mode « aucune », la clé projetée doit disparaître de l\'URL' }
    ).toBe(false)
    const afterNone = new URL(await page.evaluate(() => location.href))
    expect(afterNone.searchParams.has(marker)).toBe(false)
  })
})
