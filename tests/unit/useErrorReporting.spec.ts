import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useErrorReporting } from '@/composables/useErrorReporting'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'

const { ofetchMock } = vi.hoisted(() => ({
  ofetchMock: vi.fn()
}))
vi.mock('ofetch', () => ({ ofetch: ofetchMock }))

const windowStub = (postMessage: ReturnType<typeof vi.fn>, parent: unknown = null) => ({
  postMessage,
  parent,
  APPLICATION: { href: 'https://host/data-fair/app/dash' },
  location: { search: '', pathname: '/' },
  history: { replaceState: vi.fn(), state: null },
  document: { title: '' }
})

describe('useErrorReporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    ofetchMock.mockReset()
    delete reactiveSearchParams.draft
  })

  it('ne poste rien hors mode draft', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', windowStub(postMessage, { postMessage }))
    const error = ref('erreur')
    useErrorReporting(error)
    error.value = 'autre erreur'
    await nextTick()
    expect(ofetchMock).not.toHaveBeenCalled()
  })

  it('poste l\'erreur au backend en mode draft (watch immédiat)', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', windowStub(postMessage, { postMessage }))
    reactiveSearchParams.draft = 'true'
    ofetchMock.mockResolvedValue(undefined)
    const error = ref('config invalide')
    useErrorReporting(error)
    await nextTick()
    expect(ofetchMock).toHaveBeenCalledWith('https://host/data-fair/app/dash/error', {
      body: { message: 'config invalide' },
      method: 'POST'
    })
  })

  it('ne poste pas quand l\'erreur est vide', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', windowStub(postMessage, { postMessage }))
    reactiveSearchParams.draft = 'true'
    const error = ref<string | null>(null)
    useErrorReporting(error)
    await nextTick()
    expect(ofetchMock).not.toHaveBeenCalled()
  })

  it('log l\'erreur en console quand l\'envoi échoue', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', windowStub(postMessage, { postMessage }))
    reactiveSearchParams.draft = 'true'
    ofetchMock.mockRejectedValue(new Error('network down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = ref('boom')
    useErrorReporting(error)
    await nextTick()
    await nextTick()
    expect(consoleError).toHaveBeenCalledWith('Failed to send error to backend', expect.stringContaining('network down'))
  })
})
