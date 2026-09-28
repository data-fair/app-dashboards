// DOM harness for the Playwright unit tests: specs run in Node, but the
// composables under test mount Vue apps and read window/location, and some
// modules (reactive-search-params-global) touch window at import time. This
// module installs the jsdom globals BEFORE the modules under test are imported
// (a spec therefore always imports this file first). Idempotent: specs of the
// same worker share the same instance.
import { createRequire } from 'node:module'

type GlobalWithDom = typeof globalThis & Record<string, unknown>
const g = globalThis as GlobalWithDom

if (!g.__jsdomInstalled) {
  // jsdom cannot go through Playwright's transformer (CJS dynamic import):
  // load it with createRequire, outside of the bundling.
  const require = createRequire(import.meta.url)
  const { JSDOM } = require('jsdom') as typeof import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost:3000/',
    pretendToBeVisual: true
  })

  const define = (key: string, value: unknown) => {
    Object.defineProperty(g, key, { value, configurable: true, writable: true })
  }

  define('window', dom.window)
  define('document', dom.window.document)
  // navigator is a non-assignable getter in Node 21+: defineProperty bypasses it.
  define('navigator', dom.window.navigator)
  define('location', dom.window.location)

  // Event constructors: Node already exposes its own (undici) but they do not
  // accept the same options as the DOM ones (e.g. source: window), so the
  // jsdom versions are forced.
  const overrideKeys = ['MessageEvent', 'Event', 'CustomEvent', 'EventTarget']
  const optionalKeys = [
    'HTMLElement', 'Element', 'Node', 'NodeList', 'SVGElement',
    'getComputedStyle', 'DOMParser', 'XMLSerializer', 'MutationObserver',
    'history', 'localStorage', 'sessionStorage'
  ]
  for (const key of [...overrideKeys, ...optionalKeys]) {
    try {
      if (overrideKeys.includes(key) || g[key] === undefined) {
        const value = dom.window[key as keyof Window & string]
        if (value !== undefined) define(key, value)
      }
    } catch {
      // property not exposed by jsdom: the specs do not use it
    }
  }

  // jsdom does not implement fetch: window.fetch relays to Node's global
  // fetch, which the FetchStub helper replaces when needed.
  dom.window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)) as typeof fetch

  g.__jsdomInstalled = true
}

declare global {
  var __jsdomInstalled: boolean | undefined
}
