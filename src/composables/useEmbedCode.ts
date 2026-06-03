/**
 * Builds the iframe embed snippet for an application element and copies it
 * to the clipboard. Centralizes the notif feedback.
 */
import type { Ref } from 'vue'
import { useConfig } from './config'
import { useUiNotif, getErrorMsg } from '@data-fair/lib-vue/ui-notif.js'
import { embedCode } from '@/utils/element-url'
import type { DashboardElement } from '@/config'

export const useEmbedCode = (element: Ref<DashboardElement>) => {
  const { application, accessKey } = useConfig()
  const { sendUiNotif } = useUiNotif()

  const buildCode = (): string | undefined => embedCode(element.value, application.exposedUrl, accessKey.value)

  const copyToClipboard = async (): Promise<void> => {
    const code = buildCode()
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      sendUiNotif({ msg: "Le code d'intégration a été mis dans votre presse-papier", type: 'info' })
    } catch (err) {
      sendUiNotif({ msg: getErrorMsg(err) || String(err), type: 'error' })
    }
  }

  return { buildCode, copyToClipboard }
}
