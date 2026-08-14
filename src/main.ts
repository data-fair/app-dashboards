import { createApp } from 'vue'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { createI18n } from 'vue-i18n'
import { createSession } from '@data-fair/lib-vue/session.js'
import { vuetifySessionOptions } from '@data-fair/lib-vuetify'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { createLocaleDayjs } from '@data-fair/lib-vue/locale-dayjs.js'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import '@data-fair/frame/lib/d-frame'
import App from './app.vue'
import { createConfig } from '@/composables/config'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'

window.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

// L'instance i18n DOIT être créée au niveau module, avant l'évaluation des
// composants de @data-fair/lib-vuetify qui appellent useI18n() (ui-notif,
// layout-empty-state, ...), sinon ils reçoivent une instance non initialisée.
const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'en' })

// Permet au shim v-iframe-compat (injecté par DataFair quand l'app est
// embarquée via d-frame) d'appliquer les updateSrc sans recharger l'iframe.
window.vIframeOptions = { reactiveParams: reactiveSearchParams }

async function init () {
  const session = await createSession({ directoryUrl: '/simple-directory', siteInfo: true })

  const vuetifyOptions = vuetifySessionOptions(session)
  vuetifyOptions.icons = {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi }
  }

  i18n.global.locale.value = session.lang.value

  const app = createApp(App)
  app.use(i18n)
  app.use(createVuetify(vuetifyOptions))
  app.use(session)
  app.use(createLocaleDayjs(session.lang.value))
  app.use(createUiNotif())
  app.use(createConfig())
  app.mount('#app')
}

init().catch((e) => {
  console.error('Failed to initialize app', e)
  // Débloque le service de capture même en cas d'échec d'initialisation
  // (sinon chaque capture attend le délai complet de df:capture-delay).
  window.triggerCapture?.()
})
