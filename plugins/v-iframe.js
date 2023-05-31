import VIframe from '@koumoul/v-iframe'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component('VIframe', VIframe)
})
