/**
 * Send validation errors to the parent DataFair instance when running in draft mode.
 */
import { watch, type Ref } from 'vue'
import { ofetch } from 'ofetch'
import { getErrorMsg } from '@data-fair/lib-vue/ui-notif.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'

export const useErrorReporting = (error: Ref<string | null>) => {
  if (reactiveSearchParams.draft !== 'true' || !window.parent || window.parent === window) return

  watch(error, (message) => {
    if (!message) return
    ofetch(`${window.APPLICATION.href}/error`, { body: { message }, method: 'POST' })
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error('Failed to send error to backend', getErrorMsg(e) || e)
      })
  }, { immediate: true })
}
