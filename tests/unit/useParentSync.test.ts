import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useParentSync } from '@/composables/useParentSync'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardConfig } from '@/config'

const baseConfig = (): DashboardConfig => ({
  applications: [{ id: 'a', title: 'A' }],
  datasets: [{ id: 'root', title: 'Root', href: '/root' }],
  sections: [{ rows: [{ height: 0, elements: [{ type: 'application', application: { id: 'a', title: 'A' } } as any] }] }]
}) as DashboardConfig

// reactiveSearchParams (module singleton) observe son état et appelle
// `updateUrl` qui lit window.location/history/document : le window stub doit
// donc les exposer pour éviter un crash quand on touche à l'état.
const windowStub = (postMessage: ReturnType<typeof vi.fn>, parent: unknown = null) => ({
  postMessage,
  parent,
  location: { search: '', pathname: '/' },
  history: { replaceState: vi.fn(), state: null },
  document: { title: '' }
})

describe('useParentSync', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete reactiveSearchParams.draft
  })

  it('ne branche rien hors mode draft', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', windowStub(postMessage, { postMessage }))
    const config = ref<DashboardConfig>(baseConfig())
    useParentSync(config)
    const next = JSON.parse(JSON.stringify(config.value))
    next.sections[0].rows[0].elements.push({ type: 'application', application: { id: 'b', title: 'B' } })
    config.value = next
    await nextTick()
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('poste les deltas d\'applications au parent en mode draft', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', windowStub(postMessage, { postMessage }))
    reactiveSearchParams.draft = 'true'
    const config = ref<DashboardConfig>(baseConfig())
    useParentSync(config)
    const next = JSON.parse(JSON.stringify(config.value))
    next.sections[0].rows[0].elements.push({ type: 'application', application: { id: 'b', title: 'B' } })
    config.value = next
    await nextTick()
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'set-config', content: { field: 'applications', value: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] } },
      '*'
    )
  })

  it('ne poste rien quand l\'app est la page racine', async () => {
    const postMessage = vi.fn()
    const win: any = windowStub(postMessage)
    win.parent = win
    vi.stubGlobal('window', win)
    reactiveSearchParams.draft = 'true'
    const config = ref<DashboardConfig>(baseConfig())
    useParentSync(config)
    const next = JSON.parse(JSON.stringify(config.value))
    next.sections[0].rows[0].elements.push({ type: 'application', application: { id: 'b', title: 'B' } })
    config.value = next
    await nextTick()
    expect(postMessage).not.toHaveBeenCalled()
  })
})
