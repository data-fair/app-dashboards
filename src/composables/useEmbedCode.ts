/**
 * Builds the iframe embed snippet for an application element and copies it
 * to the clipboard. Centralizes the notif feedback.
 *
 * The translation function is injected by the calling component: a
 * composable must not call `useI18n()` itself (formatters live in the
 * component layer).
 */
import type { Ref } from 'vue'
import { useConfig } from './config'
import { useUiNotif, getErrorMsg } from '@data-fair/lib-vue/ui-notif.js'
import { embedCode } from '@/utils/element-url'
import type { DashboardElement } from '@/config'

export const useEmbedCode = (element: Ref<DashboardElement>, t: (key: string) => string) => {
  const { application, accessKey } = useConfig()
  const { sendUiNotif } = useUiNotif()

  const buildCode = (): string | undefined => embedCode(element.value, application.exposedUrl, accessKey.value)

  const copyToClipboard = async (): Promise<void> => {
    const code = buildCode()
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      sendUiNotif({ msg: t('embed.copied'), type: 'info' })
    } catch (err) {
      sendUiNotif({ msg: getErrorMsg(err) || String(err), type: 'error' })
    }
  }

  return { buildCode, copyToClipboard }
}
