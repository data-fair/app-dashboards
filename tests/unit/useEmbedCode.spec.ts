import type { DashboardElement } from '@/config'
import './helpers/dom'
import { test, expect } from '@playwright/test'
import { ref } from 'vue'
import { uiNotifKey } from '@data-fair/lib-vue/ui-notif.js'
import { useEmbedCode } from '@/composables/useEmbedCode'
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

  test('buildCode produces the iframe embed on the exposed host', () => {
    const { buildCode } = setup(appElement())
    expect(buildCode()).toBe(
      '<iframe src="https://host/data-fair/app/sankey?embed=true" width="100%" height="500px" style="background-color: transparent; border: none;"></iframe>'
    )
  })

  test('buildCode prefixes the accessKey', () => {
    const { buildCode } = setup(appElement(), 'KEY')
    expect(buildCode()).toContain('https://host/data-fair/app/KEY%3Asankey?embed=true')
  })

  test('buildCode returns undefined for a non-application element', () => {
    const { buildCode } = setup({ type: 'text', content: 'x' } as DashboardElement)
    expect(buildCode()).toBeUndefined()
  })

  test('copyToClipboard copies and notifies on success', async () => {
    const clipboardWrite = fn(async (_text: string) => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardWrite }, configurable: true })
    const { copyToClipboard, sendUiNotif } = setup(appElement())
    await copyToClipboard()
    expect(clipboardWrite.calls).toContainEqual([expect.stringContaining('https://host/data-fair/app/sankey?embed=true')])
    expect(sendUiNotif.calls).toContainEqual([{ msg: 'translated:embed.copied', type: 'info' }])
  })

  test('copyToClipboard notifies an error when the write fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied') } }, configurable: true })
    const { copyToClipboard, sendUiNotif } = setup(appElement())
    await copyToClipboard()
    expect(sendUiNotif.calls).toContainEqual([{ msg: 'denied', type: 'error' }])
  })
})
