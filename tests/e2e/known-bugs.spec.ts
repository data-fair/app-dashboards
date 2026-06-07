import { test, expect } from '@playwright/test'

/**
 * Régressions / bugs connus du dashboard.
 *
 * Chaque test est écrit pour asserter le comportement ATTENDU.
 * Si le test échoue, c'est que la régression est de retour : il faut
 * corriger le code source puis relancer `npm run test:e2e`.
 *
 * Config de référence utilisée par le dev-server : `.dev-config.json`
 * (2 filtres dynamiques : `int` et `equipement`).
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
})
