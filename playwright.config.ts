import { defineConfig, devices } from '@playwright/test'

// Tests E2E contre le dev-server (df-dev-server), alimenté par .dev-config.json.
//
// Les ports viennent du .env généré par df-dev-env (npm run dev / test-e2e
// préfixent `df-dev-env && dotenv --`) : plus aucun port en dur.
//
// Pour lancer les tests :
//   1. dans un terminal : npm run dev        (ouvre zellij : vite + dev-server)
//      — ou au minimum : npm run dev-app && npm run dev-server
//   2. dans un autre    : npm run test-e2e
//
// `reuseExistingServer: !process.env.CI` permet de réutiliser le dev-server
// déjà lancé en local, et d'en démarrer un frais en CI si besoin.
const PORT = Number(process.env.DEV_SERVER_PORT ?? 5888)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './tests/output',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev-server',
    url: `${BASE_URL}/app/`,
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
