import type { Recorder } from './helpers/spy'
import './helpers/dom'
import { test, expect } from '@playwright/test'
import { ref, nextTick } from 'vue'
import { useErrorReporting } from '@/composables/useErrorReporting'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import { FetchStub } from './helpers/fetch-mock'
import { fn, settle, stubGlobal, unstubAllGlobals } from './helpers/spy'

const fetchStub = new FetchStub()

const windowStub = (postMessage: Recorder, parent: unknown = null) => ({
  postMessage,
  parent,
  APPLICATION: { href: 'https://host/data-fair/app/dash' },
  location: { search: '', pathname: '/' },
  history: { replaceState: fn(), state: null },
  document: { title: '' }
})

test.describe('useErrorReporting', () => {
  test.beforeEach(() => {
    fetchStub.reset()
    fetchStub.install()
  })

  test.afterEach(() => {
    unstubAllGlobals()
    fetchStub.restore()
    delete reactiveSearchParams.draft
  })

  test('posts nothing outside draft mode', async () => {
    const postMessage = fn()
    stubGlobal('window', windowStub(postMessage, { postMessage }))
    const error = ref('erreur')
    useErrorReporting(error)
    error.value = 'autre erreur'
    await nextTick()
    await settle()
    expect(fetchStub.calls).toHaveLength(0)
  })

  test('posts the error to the backend in draft mode (immediate watch)', async () => {
    const postMessage = fn()
    stubGlobal('window', windowStub(postMessage, { postMessage }))
    reactiveSearchParams.draft = 'true'
    const error = ref('config invalide')
    useErrorReporting(error)
    await nextTick()
    await settle()
    expect(fetchStub.calls).toHaveLength(1)
    expect(fetchStub.calls[0].url).toBe('https://host/data-fair/app/dash/error')
    expect(fetchStub.calls[0].method).toBe('POST')
    expect(fetchStub.calls[0].json()).toEqual({ message: 'config invalide' })
  })

  test('does not post when the error is empty', async () => {
    const postMessage = fn()
    stubGlobal('window', windowStub(postMessage, { postMessage }))
    reactiveSearchParams.draft = 'true'
    const error = ref<string | null>(null)
    useErrorReporting(error)
    await nextTick()
    await settle()
    expect(fetchStub.calls).toHaveLength(0)
  })

  test('logs the error to the console when sending fails', async () => {
    const postMessage = fn()
    stubGlobal('window', windowStub(postMessage, { postMessage }))
    reactiveSearchParams.draft = 'true'
    fetchStub.on('/error', () => { throw new Error('network down') })
    const consoleError = fn()
    const originalConsoleError = console.error
    console.error = consoleError
    try {
      const error = ref('boom')
      useErrorReporting(error)
      await nextTick()
      await settle()
    } finally {
      console.error = originalConsoleError
    }
    expect(consoleError.calls).toContainEqual(['Failed to send error to backend', expect.stringContaining('network down')])
  })
})
