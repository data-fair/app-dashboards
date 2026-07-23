import { test, expect } from '@playwright/test'

/**
 * Régressions / bugs connus du dashboard.
 *
 * Chaque test est écrit pour asserter le comportement ATTENDU.
 * Si le test échoue, c'est que la régression est de retour : il faut
 * corriger le code source puis relancer `npm run test:e2e`.
 *
 * Config de référence utilisée par le dev-server : `.dev-config.json`
 * (2 filtres dynamiques : `int` et `equipement`, dataset racine
 * `accidents-velos`, élément `application` Sankey).
 */
test.describe('Bugs connus (régressions)', () => {
  test('K1 — les filtres dynamiques (v-autocomplete) se rendent dans leurs v-col', async ({ page }) => {
    // Capture tous les messages console pour pouvoir diagnostiquer les
    // régressions futures (warnings Vue suspects, erreurs d'init, etc.).
    const consoleEvents: { type: string; text: string }[] = []
    page.on('console', (msg) => {
      consoleEvents.push({ type: msg.type(), text: msg.text() })
    })

    await page.goto('/app/')

    // On attend que le dashboard ait fini de monter : l'iframe de la visu
    // sankey est le marqueur le plus fiable d'un mount complet.
    await expect(page.locator('iframe').first()).toBeVisible({ timeout: 20_000 })

    // 2 filtres dans .dev-config.json → 2 v-autocomplete attendus.
    // Si le filtre est vide (`filtersState[labelField]` undefined) le
    // `v-if` du template tombe à false et la v-col est vide.
    await expect(page.locator('.v-autocomplete')).toHaveCount(2, { timeout: 5_000 })

    // Aucun warning Vue sur l'inactive effect scope : ce warning survient
    // quand un `effectScope.stop()` est suivi d'un `scope.run()` sur le
    // même scope. Le pattern propre est de créer un nouveau scope à
    // chaque changement de la liste de filtres, ou de ne pas utiliser
    // d'effectScope du tout.
    const inactiveScopeWarning = consoleEvents.find(
      (e) => e.text.includes('cannot run an inactive effect scope')
    )
    expect(
      inactiveScopeWarning,
      `Warning Vue inattendu : ${inactiveScopeWarning?.text ?? '(aucun)'}\n` +
      `Tous les messages console :\n${consoleEvents.map(e => `[${e.type}] ${e.text}`).join('\n')}`
    ).toBeUndefined()

    // L'app doit avoir démarré sans exception (sinon Suspense résout avec
    // l'erreur catchée par main.ts et le DOM reste vide).
    const initError = consoleEvents.find(
      (e) => e.text.includes('Failed to initialize app')
    )
    expect(
      initError,
      `Erreur d'init inattendue : ${initError?.text ?? '(aucune)'}`
    ).toBeUndefined()
  })

  test('K2 — distinction embed dataset vs application pour la transmission des filtres', async ({ page }) => {
    const consoleEvents: { type: string; text: string }[] = []
    page.on('console', (msg) => {
      consoleEvents.push({ type: msg.type(), text: msg.text() })
    })

    await page.goto('/app/')

    // La config de dev référence un élément `application` (Sankey) puis
    // un élément `tablePreview` (vue table embarquée du dataset racine).
    // L'ordre des éléments dans le DOM suit l'ordre de la config.
    const allFrames = page.locator('d-frame')
    await expect(allFrames).toHaveCount(2, { timeout: 20_000 })

    // 1) Élément `application` → /data-fair/app/<id>
    const appFrame = allFrames.nth(0)
    await expect(appFrame).toBeVisible({ timeout: 20_000 })
    const appSrc = await appFrame.getAttribute('src')
    expect(appSrc, 'Le src de la visu application doit être défini').toBeTruthy()
    expect(
      appSrc,
      "L'application doit être servie via /data-fair/app/"
    ).toMatch(/^\/data-fair\/app\//)
    expect(
      appSrc,
      "L'application ne doit PAS être servie via /data-fair/embed/dataset/"
    ).not.toMatch(/^\/data-fair\/embed\/dataset\//)

    // 2) Élément `tablePreview` → /data-fair/embed/dataset/<id>/table
    const tableFrame = allFrames.nth(1)
    await expect(tableFrame).toBeVisible({ timeout: 20_000 })
    const tableSrc = await tableFrame.getAttribute('src')
    expect(tableSrc, 'Le src de la vue table doit être défini').toBeTruthy()
    expect(
      tableSrc,
      'La vue table doit être servie via /data-fair/embed/dataset/'
    ).toMatch(/^\/data-fair\/embed\/dataset\/[^/]+\/table/)

    // 3) finalizedAt est forwardé dans les deux URLs, même quand aucun
    //    filtre n'est sélectionné.
    expect(
      appSrc,
      `L'URL de l'application doit contenir finalizedAt. src=${appSrc}`
    ).toMatch(/[?&]finalizedAt=/)
    expect(
      tableSrc,
      `L'URL de la vue table doit contenir finalizedAt. src=${tableSrc}`
    ).toMatch(/[?&]finalizedAt=/)

    // 4) Sélection d'une valeur dans le 1er filtre (`int`) : on vérifie
    //    la transmission des filtres résolus à l'app et à la table.
    const firstAutocomplete = page.locator('.v-autocomplete').nth(0)
    await firstAutocomplete.click()
    const firstOption = page.locator('.v-list-item').first()
    await expect(firstOption).toBeVisible({ timeout: 5_000 })
    await firstOption.click()
    // Attendre que les iframes rechargent avec les nouveaux filtres.
    // On poll l'attribut `src` du sankey (resolve /values/ asynchrone + re-render).
    // ⚠️ La regex cible explicitement le filtre dynamique `int` : une regex
    // générique `\w+_in` matcherait immédiatement le static filter
    // `_d_<datasetId>_dep_in` déjà présent et le poll passerait avant la
    // mise à jour des src (race condition).
    const rootDatasetIdForPoll = 'accidents-velos'
    await expect.poll(
      async () => await appFrame.getAttribute('src'),
      {
        timeout: 10_000,
        message: 'L\'iframe de l\'application doit recevoir le filtre préfixé par le dataset racine'
      }
    ).toMatch(new RegExp(`(?:^|[?&])\\d*_d_${rootDatasetIdForPoll}_int_in=`))

    // Idem pour la vue table : on attend que le filtre dé-préfixé `int_in=`
    // soit bien propagé avant de lire les src pour les assertions suivantes.
    await expect.poll(
      async () => await tableFrame.getAttribute('src'),
      {
        timeout: 10_000,
        message: 'L\'iframe de la vue table doit recevoir le filtre int_in= après dé-préfixage'
      }
    ).toMatch(/[?&]int_in=/)

    const appSrcAfter = await appFrame.getAttribute('src')
    const tableSrcAfter = await tableFrame.getAttribute('src')
    expect(appSrcAfter, "Le src de l'application doit être défini après le filtre").toBeTruthy()
    expect(tableSrcAfter, 'Le src de la table doit être défini après le filtre').toBeTruthy()

    // 5) Transmission des filtres après sélection
    //    - L'application DOIT recevoir les filtres dynamiques résolus
    //      (codes, résolus via /values/) préfixés par le dataset racine
    //      du dashboard (cf. useFiltersValues.applicationValues et
    //      useElementUrls.applicationDFrameSrc). Une application qui
    //      utilise un autre dataset ignore ces paramètres.
    //    - La vue table embarquée est servie sur le dataset racine : on
    //      dé-préfixe les filtres dynamiques (`<prefix>_d_<datasetId>_`)
    //      avant de les forwarder, l'embed REST API attendant des noms
    //      de champs non-préfixés.
    const rootDatasetId = 'accidents-velos'
    const prefixedFilterRegex = new RegExp(`(?:^|[?&])\\d*_d_${rootDatasetId}_\\w+_in=`)
    expect(
      appSrcAfter,
      `L'URL de l'application doit contenir des filtres préfixés par le dataset racine (${rootDatasetId}) ` +
      'pour que les valeurs résolues soient transmises. ' +
      `src=${appSrcAfter}`
    ).toMatch(prefixedFilterRegex)
    const tablePrefixedFilterRegex = new RegExp(`(?:^|[?&])\\d*_d_${rootDatasetId}_\\w+_in=`)
    expect(
      tableSrcAfter,
      `L'URL de la vue table ne doit PAS contenir de filtres préfixés par le dataset racine (${rootDatasetId}). ` +
      `src=${tableSrcAfter}`
    ).not.toMatch(tablePrefixedFilterRegex)
    expect(
      tableSrcAfter,
      'L\'URL de la vue table doit contenir le filtre int_in= après dé-préfixage. ' +
      `src=${tableSrcAfter}`
    ).toMatch(/[?&]int_in=/)
    expect(
      tableSrcAfter,
      `L'URL de la vue table doit être servie pour le dataset racine ${rootDatasetId}. ` +
      `src=${tableSrcAfter}`
    ).toMatch(new RegExp(`/embed/dataset/[^/]*${rootDatasetId}/`))

    // 6) Les deux iframes doivent avoir le flag d-frame=true
    expect(appSrcAfter, "d-frame=true doit être présent dans l'URL de l'application").toMatch(/[?&]d-frame=true/)
    expect(tableSrcAfter, "d-frame=true doit être présent dans l'URL de la vue table").toMatch(/[?&]d-frame=true/)

    // 7) Pas d'erreur d'init
    const initError = consoleEvents.find(
      (e) => e.text.includes('Failed to initialize app')
    )
    expect(
      initError,
      `Erreur d'init inattendue : ${initError?.text ?? '(aucune)'}`
    ).toBeUndefined()
  })

  test('K3 — propagation des filtres via concepts pour les visus sur dataset tiers', async ({ page }) => {
    // La config de dev déclare un static filter sur `dep` (concept
    // `codeDepartement`). Les deux iframes (application Sankey + table
    // embarquée) doivent recevoir la clé cross-dataset `_c_codeDepartement_in`
    // dans leur URL, en plus de la clé dataset-scopée
    // `d_<rootDatasetId>_dep_in=75,92`. Une visu enfant sur un autre
    // dataset lisant `useConceptFilters` peut ainsi récupérer le filtre
    // via la clé `_c_*` même si son `datasetId` ne correspond pas à celui
    // du dataset racine du dashboard.
    const consoleEvents: { type: string; text: string }[] = []
    page.on('console', (msg) => {
      consoleEvents.push({ type: msg.type(), text: msg.text() })
    })

    await page.goto('/app/')

    const allFrames = page.locator('d-frame')
    await expect(allFrames).toHaveCount(2, { timeout: 20_000 })

    const appFrame = allFrames.nth(0)
    const tableFrame = allFrames.nth(1)
    await expect(appFrame).toBeVisible({ timeout: 20_000 })
    await expect(tableFrame).toBeVisible({ timeout: 20_000 })

    const appSrc = await appFrame.getAttribute('src')
    const tableSrc = await tableFrame.getAttribute('src')
    expect(appSrc, "Le src de l'application doit être défini").toBeTruthy()
    expect(tableSrc, 'Le src de la table doit être défini').toBeTruthy()

    // 1) Clé concept-aliased présente dans l'URL de l'application.
    //    Format : _c_<conceptId>_<op>=<valeur>. Pas de préfixe
    //    (compare-view) — chaque iframe est attachée à une seule colonne
    //    et reçoit la valeur de cette colonne.
    const conceptFilterRegex = /[?&]_c_codeDepartement_in=75%2C92/
    expect(
      appSrc,
      'L\'URL de l\'application doit contenir la clé concept _c_codeDepartement_in=75,92. ' +
      `src=${appSrc}`
    ).toMatch(conceptFilterRegex)

    // 2) Clé concept-aliased présente dans l'URL de la table embarquée.
    expect(
      tableSrc,
      'L\'URL de la table doit contenir la clé concept _c_codeDepartement_in=75,92. ' +
      `src=${tableSrc}`
    ).toMatch(conceptFilterRegex)

    // 3) Non-régression : la clé dataset-scopée reste présente pour
    //    l'application (utilisée par les apps qui partagent le dataset
    //    racine) et strippée pour la table (l'embed REST API utilise le
    //    nom de champ direct).
    const rootDatasetId = 'accidents-velos'
    const prefixedDepRegex = new RegExp(`(?:^|[?&])\\d*_d_${rootDatasetId}_dep_in=`)
    expect(
      appSrc,
      'L\'URL de l\'application doit toujours contenir la clé dataset-scopée ' +
      `<prefix>_d_${rootDatasetId}_dep_in=. src=${appSrc}`
    ).toMatch(prefixedDepRegex)

    // 4) Pas d'erreur d'init
    const initError = consoleEvents.find(
      (e) => e.text.includes('Failed to initialize app')
    )
    expect(
      initError,
      `Erreur d'init inattendue : ${initError?.text ?? '(aucune)'}`
    ).toBeUndefined()
  })
})
