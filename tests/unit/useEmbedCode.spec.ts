import './helpers/dom'
import { test, expect } from '@playwright/test'
import { ref } from 'vue'
import { uiNotifKey } from '@data-fair/lib-vue/ui-notif.js'
import { useEmbedCode } from '@/composables/useEmbedCode'
import type { DashboardElement } from '@/config'
import { fn } from './helpers/spy'
import { probe, unmountProbes } from './helpers/probe'

const appElement = (): DashboardElement => ({
  type: 'application',
  application: { id: 'sankey', title: 'Sankey', href: 'https://demo/data-fair/app/sankey' }
}) as DashboardElement

const setup = (element: DashboardElement, accessKey: string | null = null) => {
  const sendUiNotif = fn()
  const api = probe(() => useEmbedCode(ref(element), (key: string) => `translated:${key}`), (app) => {
    app.provide('data-fair-app-config', {
      application: { exposedUrl: 'https://host/data-fair/app/abc' },
      accessKey: ref(accessKey)
    })
    app.provide(uiNotifKey, { sendUiNotif })
  })
  return { ...api, sendUiNotif }
}

test.describe('useEmbedCode', () => {
  test.afterEach(() => {
    unmountProbes()
    delete (navigator as any).clipboard
  })

  test('buildCode produit l\'iframe embed sur l\'hôte exposé', () => {
    const { buildCode } = setup(appElement())
    expect(buildCode()).toBe(
      '<iframe src="https://host/data-fair/app/sankey?embed=true" width="100%" height="500px" style="background-color: transparent; border: none;"></iframe>'
    )
  })

  test('buildCode préfixe l\'accessKey', () => {
    const { buildCode } = setup(appElement(), 'KEY')
    expect(buildCode()).toContain('https://host/data-fair/app/KEY%3Asankey?embed=true')
  })

  test('buildCode renvoie undefined pour un élément non-application', () => {
    const { buildCode } = setup({ type: 'text', content: 'x' } as DashboardElement)
    expect(buildCode()).toBeUndefined()
  })

  test('copyToClipboard copie et notifie en cas de succès', async () => {
    const clipboardWrite = fn(async (_text: string) => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardWrite }, configurable: true })
    const { copyToClipboard, sendUiNotif } = setup(appElement())
    await copyToClipboard()
    expect(clipboardWrite.calls).toContainEqual([expect.stringContaining('https://host/data-fair/app/sankey?embed=true')])
    expect(sendUiNotif.calls).toContainEqual([{ msg: 'translated:embed.copied', type: 'info' }])
  })

  test('copyToClipboard notifie en erreur quand l\'écriture échoue', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied') } }, configurable: true })
    const { copyToClipboard, sendUiNotif } = setup(appElement())
    await copyToClipboard()
    expect(sendUiNotif.calls).toContainEqual([{ msg: 'denied', type: 'error' }])
  })
})
