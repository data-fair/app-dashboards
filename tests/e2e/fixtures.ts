// tests/e2e/fixtures.ts — shared base of the e2e suite: console guard. Specs import `test`
// and `expect` from here, never from '@playwright/test', so that the guard applies to every test.
// No session / window.APPLICATION mocks: this suite runs against df-dev-server, which serves
// the live configuration (see playwright.config.ts).
import { test as base, expect } from '@playwright/test'

export const test = base.extend<{ consoleGuard: void, expectedConsole: string[] }>({
  // messages (console or page errors) a test provokes on purpose (a failing request), named one by one:
  //   test.use({ expectedConsole: ['status of 500'] })
  // substrings, not RegExp: fixture options are serialized and a RegExp would not survive
  expectedConsole: [[], { option: true }],
  consoleGuard: [async ({ page, expectedConsole }, use) => {
    const messages: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error' && msg.type() !== 'warning') return
      if (expectedConsole.some(text => msg.text().includes(text))) return
      messages.push(`[${msg.type()}] ${msg.text()}`)
    })
    page.on('pageerror', (err) => {
      if (expectedConsole.some(text => err.message.includes(text))) return
      messages.push(`[pageerror] ${err.message}`)
    })
    await use()
    expect(messages, 'console must stay clean').toEqual([])
  }, { auto: true }]
})
export { expect }

// Noise of third-party visus embedded by the dev configuration, named by the specs that load it
// (test.use({ expectedConsole: embeddedVisusConsole })):
// - WebGL performance message of Chrome headless' software GPU (SwiftShader), raised by any map;
// - carto-stats' tileserver style is CORS-allowed for http://localhost:5888 only, while the e2e
//   dev-server runs on E2E_PORT: the blocked request, its failed resource and the rejected fetch.
export const embeddedVisusConsole = [
  'GPU stall due to ReadPixels',
  'tileserver-koumoul/proxy/styles/cadastre/style.json',
  'net::ERR_FAILED',
  'apps/carto-stats/'
]
