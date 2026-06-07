import { defineConfig, devices } from '@playwright/test'

// Tests E2E qui réutilisent le dev-server (df-dev-server) déjà en cours
// sur :5888, alimenté par .dev-config.json. Aucun build supplémentaire.
//
// Pour lancer les tests :
//   1. dans un terminal : npm run dev-server  (port 5888)
//   2. dans un autre     : npm run dev-app     (port 3000)
//   3. dans un 3e        : npm run test:e2e
//
// `reuseExistingServer: !process.env.CI` permet de réutiliser le serveur
// déjà lancé en local, et d'en démarrer un frais en CI si besoin.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './tests/output',
  use: {
    baseURL: 'http://localhost:5888',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev-server',
    url: 'http://localhost:5888/app/',
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
    stdout: 'ignore',
    stderr: 'pipe'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
