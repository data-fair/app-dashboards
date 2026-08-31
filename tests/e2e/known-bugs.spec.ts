import { test, expect, type Page } from '@playwright/test'

/**
 * Régressions / bugs connus du dashboard.
 *
 * Chaque test est écrit pour asserter le comportement ATTENDU.
 * Si le test échoue, c'est que la régression est de retour : il faut
 * corriger le code source puis relancer `npm run test:e2e`.
 *
 * ⚠️ Les attentes ne sont PLUS couplées à `.dev-config.json` : la config
 * live est lue depuis l'endpoint `GET /config` du dev-server, et toutes les
 * valeurs attendues en sont dérivées (nombre de filtres, d'éléments, dataset
 * racine, clés concept/static-filters). Les assertions qui nécessitent un
 * ingrédient absent de la config courante sont simplement sautées, si bien
 * que la suite reste verte sur n'importe quelle config valide.
 */

interface SchemaField {
  key: string
  'x-concept'?: { id: string }
}

interface DashboardElementConfig {
  type: string
  dataset?: { id: string }
  application?: { id: string; href?: string }
  valueMandatory?: boolean
  mandatoryFilters?: string[]
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

const flatElements = (config: DevConfig): DashboardElementConfig[] =>
  (config.sections || [])
    .flatMap(section => (section.rows || []).flatMap(row => row.elements || []))

/**
 * Éléments réellement montés dans le DOM : avec un groupement par onglets
 * (`tabs-*`), seul l'onglet actif (le premier) est rendu par le v-window ;
 * sinon tous les éléments des sections sont rendus.
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
 * Champs de filtres actifs au chargement : seuls les filtres dynamiques avec
 * une valeur par défaut (`startValue`) sont actifs avant toute interaction
 * (miroir de `initDefaultFilterValues`).
 */
const initialActiveFields = (config: DevConfig): string[] =>
  (config.filters || []).flatMap(f => (f.startValue && f.labelField ? [f.labelField] : []))

/**
 * Un élément `valueMandatory` ne se rend (ni embed ni barre d'actions) qu'une
 * fois tous ses filtres requis actifs (miroir de `computeMandatoryFilterIssues`).
 */
const mandatoryFiltersSatisfied = (el: DashboardElementConfig, activeFields: string[]): boolean => {
  if (!el.valueMandatory) return true
  return (el.mandatoryFilters || []).every(f => activeFields.includes(f))
}

/**
 * Éléments qui produisent réellement un `<d-frame>` : une `application` avec
 * un id, un `tablePreview` (dataset racine en fallback) et un `form` avec un
 * dataset. Un form sans dataset ne rend pas d'embed (état invalide), une
 * application sans id non plus, et un élément `valueMandatory` dont les
 * filtres requis ne sont pas actifs affiche un placeholder à la place.
 * `extraActiveFields` porte les champs activés par le test avant le décompte
 * (sélection dans un filtre dynamique).
 */
const expectedFrames = (config: DevConfig, extraActiveFields: string[] = []): { type: 'application' | 'table' | 'form' }[] => {
  const activeFields = [...new Set([...initialActiveFields(config), ...extraActiveFields])]
  return visibleElements(config)
    .filter(el => mandatoryFiltersSatisfied(el, activeFields))
    .map(el => {
      if (el.type === 'application') return el.application?.id ? { type: 'application' as const } : null
      if (el.type === 'tablePreview') return { type: 'table' as const }
      if (el.type === 'form') return el.dataset?.id ? { type: 'form' as const } : null
      return null
    })
    .filter((e): e is { type: 'application' | 'table' | 'form' } => !!e)
}

/**
 * Paramètres REST attendus pour un static filter (mêmes conventions que
 * `filters2params` de @data-fair/lib-utils : suffixes `_in/_nin/_gte/_lte/
 * _starts/_exists/_nexists`, valeur espace pour exists/nexists).
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

/** Suffixes REST ordonnés du plus long au plus court (split non ambigu). */
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
 * Sélectionne la première option du filtre dynamique non-slider d'indice
 * `index` (ordre de la config : un autocomplete par filtre non-slider, les
 * sliders rendent un range slider).
 */
const selectFirstFilterOption = async (page: Page, index: number): Promise<void> => {
  const autocomplete = page.locator('.v-autocomplete').nth(index)
  await autocomplete.click()
  const firstOption = page.locator('.v-list-item').first()
  await expect(firstOption).toBeVisible({ timeout: 5_000 })
  await firstOption.click()
}

const collectConsoleEvents = (page: Page): { type: string; text: string }[] => {
  const events: { type: string; text: string }[] = []
  page.on('console', (msg) => {
    events.push({ type: msg.type(), text: msg.text() })
  })
  return events
}

const assertNoInitIssue = (events: { type: string; text: string }[]) => {
  const inactiveScopeWarning = events.find((e) => e.text.includes('cannot run an inactive effect scope'))
  expect(
    inactiveScopeWarning,
    `Warning Vue inattendu : ${inactiveScopeWarning?.text ?? '(aucun)'}\n` +
    `Tous les messages console :\n${events.map(e => `[${e.type}] ${e.text}`).join('\n')}`
  ).toBeUndefined()
  const initError = events.find((e) => e.text.includes('Failed to initialize app'))
  expect(
    initError,
    `Erreur d'init inattendue : ${initError?.text ?? '(aucune)'}`
  ).toBeUndefined()
}

test.describe('Bugs connus (régressions)', () => {
  test('K1 — les filtres dynamiques (v-autocomplete) se rendent dans leurs v-col', async ({ page }) => {
    const consoleEvents = collectConsoleEvents(page)

    await page.goto('/app/')
    const config = await getDevConfig(page)

    // Marqueur de mount fiable, indépendant du contenu de la config.
    await expect(page.locator('.v-container').first()).toBeVisible({ timeout: 20_000 })

    // Un autocomplete par filtre dynamique déclaré dans la config (les filtres
    // slider rendent un range slider et non un autocomplete).
    const filters = config.filters || []
    if (filters.length) {
      const autocompleteCount = filters.filter(f => !(f as { slider?: boolean }).slider).length
      await expect(page.locator('.v-autocomplete')).toHaveCount(autocompleteCount, { timeout: 5_000 })
    }

    assertNoInitIssue(consoleEvents)
  })

  test('K2 — transmission des filtres aux embeds : dataset vs application, clés concept et dé-préfixage', async ({ page }) => {
    const consoleEvents = collectConsoleEvents(page)

    await page.goto('/app/')
    const config = await getDevConfig(page)

    const rootDatasetId = config.datasets?.[0]?.id
    const rootSchema = config.datasets?.[0]?.schema || []

    // Les éléments `valueMandatory` ne rendent leur embed qu'après sélection
    // de leurs filtres requis : on sélectionne d'abord une valeur dans le
    // premier filtre dynamique non-slider, comme en usage réel, puis on
    // calcule les frames attendues avec cette sélection active.
    const nonSliderFilters = (config.filters || []).filter(f => f.labelField && !f.slider)
    let unGateField: string | undefined
    if (nonSliderFilters.length) {
      await selectFirstFilterOption(page, 0)
      unGateField = nonSliderFilters[0].labelField
    }

    const frames = expectedFrames(config, unGateField ? [unGateField] : [])

    test.skip(frames.length === 0, 'La config courante n\'a aucun élément embarquable')

    // L'ordre des éléments dans le DOM suit l'ordre de la config.
    const allFrames = page.locator('d-frame')
    await expect(allFrames).toHaveCount(frames.length, { timeout: 20_000 })

    const firstAppFrame = allFrames.first()
    const tableFormIndex = frames.findIndex(f => f.type !== 'application')
    const firstTableFormFrame = tableFormIndex >= 0 ? allFrames.nth(tableFormIndex) : null

    // 1) Chaque élément rend le bon type d'embed, avec finalizedAt et d-frame.
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

    // 2) Les static filters sont propagés :
    //    - en clés dataset-scopées `<prefix>_d_<rootDatasetId>_<field>_<op>=`
    //      sur les embeds d'application ;
    //    - en clés dé-préfixées (`<field>_<op>=`) sur les vues dataset
    //      (l'embed REST API attend des noms de champs non préfixés) ;
    //    - en clés concept `_c_<conceptId>_<op>` sur les deux, quand le champ
    //      porte un concept (pour qu'une visu sur un AUTRE dataset les lise).
    const staticFilters = config.staticFilters || []
    if (staticFilters.length && rootDatasetId) {
      for (const sf of staticFilters) {
        const params = staticFilterParams(sf)
        const query = queryOf(await firstAppFrame.getAttribute('src') || '')
        for (const [restKey, value] of Object.entries(params)) {
          const scoped = findParam(query, new RegExp(`^c?_d_${rootDatasetId}_${restKey}$`))
          expect(
            scoped,
            `L'URL de l'application doit contenir la clé dataset-scopée _d_${rootDatasetId}_${restKey} (${sf.type}). src=${query}`
          ).toBe(value)
          const split = splitRestKey(restKey)
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
            expect(
              tableQuery.get(restKey),
              `L'URL de la vue table doit contenir la clé dé-préfixée ${restKey}. src=${tableQuery}`
            ).toBe(value)
          }
        }
      }
    }

    // 3) Sélection d'une valeur dans un filtre dynamique : la valeur résolue
    //    doit être transmise aux embeds (préfixée par le dataset racine pour
    //    les applications, dé-préfixée pour les vues dataset).
    //
    //    ⚠️ Le filtre sondé ne doit PAS être porté par un static filter (la
    //    clé serait déjà présente dans les src avant toute sélection et le
    //    poll passerait trivialement), ni être celui utilisé ci-dessus pour
    //    débloquer les éléments valueMandatory (le re-cliquer pourrait
    //    désélectionner la valeur). Sans candidat, l'étape est sautée.
    //
    //    Les clés émises suivent `collectFilterEmitFields` : les champs
    //    `values` associés au filtre quand ils existent (valeurs résolues via
    //    `/values/`), sinon le labelField lui-même. Un filtre slider émet des
    //    bornes `_gte`/`_lte`, pas de `_in` : on le saute.
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

    assertNoInitIssue(consoleEvents)
  })

  test('K3 — basculer un filtre slider en liste (draft) nettoie les bornes gte/lte de l\'URL et des embeds', async ({ page }) => {
    const consoleEvents = collectConsoleEvents(page)

    await page.goto('/app/')
    const config = await getDevConfig(page)

    const sliderFilter = (config.filters || []).find(f => (f as { slider?: boolean }).slider)
    const rootDatasetId = config.datasets?.[0]?.id
    const frames = expectedFrames(config)

    test.skip(!sliderFilter || !rootDatasetId || frames.length === 0, 'La config courante n\'a pas de filtre slider embarquable')

    // Pose une sélection de bornes dans l'URL puis vérifie qu\'elle est propagée aux embeds.
    const gteKey = `_d_${rootDatasetId}_${sliderFilter.labelField}_gte`
    const lteKey = `_d_${rootDatasetId}_${sliderFilter.labelField}_lte`
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

    // Bascule le filtre en liste (slider off) via le message set-config du draft.
    await page.evaluate(({ labelField }) => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      cfg.filters = (cfg.filters || []).map(f => f.labelField === labelField ? { ...f, slider: false } : { ...f })
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    }, { labelField: sliderFilter.labelField })

    // L'URL et les embeds ne doivent plus contenir les bornes gte/lte périmées.
    await expect.poll(
      async () => new URL(await page.evaluate(() => location.href)).searchParams.has(gteKey),
      { timeout: 10_000 }
    ).toBe(false)
    await expect.poll(
      async () => await firstFrame.getAttribute('src'),
      { timeout: 10_000 }
    ).not.toMatch(gteRegex)

    // Rebascule en slider : les bornes étant nettoyées, le slider revient sur la plage complète
    // et l'iframe ne doit pas recevoir de gte/lte orphelin.
    await page.evaluate(({ labelField }) => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      cfg.filters = (cfg.filters || []).map(f => f.labelField === labelField ? { ...f, slider: true } : { ...f })
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    }, { labelField: sliderFilter.labelField })

    await expect(page.locator('.v-range-slider')).toBeVisible({ timeout: 10_000 })
    await expect.poll(
      async () => await firstFrame.getAttribute('src'),
      { timeout: 10_000 }
    ).not.toMatch(gteRegex)

    assertNoInitIssue(consoleEvents)
  })

  test('K4 — la barre d\'actions reste dans sa ligne en hauteur automatique', async ({ page }) => {
    const consoleEvents = collectConsoleEvents(page)

    await page.goto('/app/')
    const config = await getDevConfig(page)

    // Comme en K2 : un élément application `valueMandatory` ne rend ni iframe
    // ni barre d'actions avant la sélection de ses filtres requis. On
    // sélectionne d'abord une valeur dans le premier filtre dynamique
    // non-slider, puis on dérive les champs actifs qui en résultent.
    const nonSliderFilters = (config.filters || []).filter(f => f.labelField && !f.slider)
    if (nonSliderFilters.length) {
      await selectFirstFilterOption(page, 0)
    }
    const activeFields = [...initialActiveFields(config), ...nonSliderFilters.slice(0, 1).flatMap(f => f.labelField ? [f.labelField] : [])]

    // Un barre d'actions n'apparaît que pour un élément application (boutons
    // embed/capture) ou une vue table (sources en fallback sur le dataset).
    const hasActionBarElement = visibleElements(config).some(el => {
      if (!mandatoryFiltersSatisfied(el, activeFields)) return false
      if (el.type === 'application') return !!el.application?.id && !!el.application.href
      if (el.type === 'tablePreview') return true
      return false
    })
    test.skip(!hasActionBarElement, 'La config courante n\'a aucun élément avec barre d\'actions rendu')

    // Force le mode auto (hauteurs -1) et l'affichage des actions : dans
    // l'état bugué, la barre d'actions d'un élément chevauche l'élément
    // suivant (hauteur:100% résolu sur une ligne flex wrap). Les trois flags
    // sont activés car la liste des sources d'une application peut être
    // illisible dans certains contextes (permission readConfig manquante) ;
    // les boutons capture/embed ne dépendent d'aucun fetch.
    await page.evaluate(() => {
      const cfg = JSON.parse(JSON.stringify(window.APPLICATION.configuration))
      cfg.showSources = true
      cfg.showEmbed = true
      cfg.showCapture = true
      ;(cfg.sections || []).forEach(s => (s.rows || []).forEach(r => { r.height = -1 }))
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { type: 'set-config', content: cfg }
      }))
    })

    // Une barre d'actions doit apparaître sous les éléments éligibles.
    await expect(
      page.locator('.v-card-actions').first()
    ).toBeVisible({ timeout: 20_000 })

    // Aucune barre d'actions ne doit intersecter le titre ou le d-frame d'un
    // AUTRE élément (sa propre barre suit exactement son iframe, sans
    // chevauchement : bar.top === frame.bottom).
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

    assertNoInitIssue(consoleEvents)
  })
})
