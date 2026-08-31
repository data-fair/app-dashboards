import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { useEmbedCode } from '@/composables/useEmbedCode'
import type { DashboardElement } from '@/config'

const { useConfigMock, useUiNotifMock } = vi.hoisted(() => ({
  useConfigMock: vi.fn(),
  useUiNotifMock: vi.fn()
}))
vi.mock('@/composables/config', () => ({ useConfig: () => useConfigMock() }))
vi.mock('@data-fair/lib-vue/ui-notif.js', () => ({
  useUiNotif: () => useUiNotifMock(),
  getErrorMsg: (err: unknown) => (typeof err === 'string' ? err : (err as Error)?.message ?? String(err))
}))

const appElement = (): DashboardElement => ({
  type: 'application',
  application: { id: 'sankey', title: 'Sankey', href: 'https://demo/data-fair/app/sankey' }
}) as DashboardElement

const setup = (element: DashboardElement, accessKey: string | null = null) => {
  const sendUiNotif = vi.fn()
  useConfigMock.mockReturnValue({
    application: { exposedUrl: 'https://host/data-fair/app/abc' },
    accessKey: ref(accessKey)
  })
  useUiNotifMock.mockReturnValue({ sendUiNotif })
  const api = useEmbedCode(ref(element), (key: string) => `translated:${key}`)
  return { ...api, sendUiNotif }
}

describe('useEmbedCode', () => {
  afterEach(() => {
    delete (navigator as any).clipboard
  })

  it('buildCode produit l\'iframe embed sur l\'hôte exposé', () => {
    const { buildCode } = setup(appElement())
    expect(buildCode()).toBe(
      '<iframe src="https://host/data-fair/app/sankey?embed=true" width="100%" height="500px" style="background-color: transparent; border: none;"></iframe>'
    )
  })

  it('buildCode préfixe l\'accessKey', () => {
    const { buildCode } = setup(appElement(), 'KEY')
    expect(buildCode()).toContain('https://host/data-fair/app/KEY%3Asankey?embed=true')
  })

  it('buildCode renvoie undefined pour un élément non-application', () => {
    const { buildCode } = setup({ type: 'text', content: 'x' } as DashboardElement)
    expect(buildCode()).toBeUndefined()
  })

  it('copyToClipboard copie et notifie en cas de succès', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardWrite }, configurable: true })
    const { copyToClipboard, sendUiNotif } = setup(appElement())
    await copyToClipboard()
    expect(clipboardWrite).toHaveBeenCalledWith(expect.stringContaining('https://host/data-fair/app/sankey?embed=true'))
    expect(sendUiNotif).toHaveBeenCalledWith({ msg: 'translated:embed.copied', type: 'info' })
  })

  it('copyToClipboard notifie en erreur quand l\'écriture échoue', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    const { copyToClipboard, sendUiNotif } = setup(appElement())
    await copyToClipboard()
    expect(sendUiNotif).toHaveBeenCalledWith({ msg: 'denied', type: 'error' })
  })
})
