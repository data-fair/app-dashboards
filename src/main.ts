import { createApp } from 'vue'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { createSession } from '@data-fair/lib-vue/session.js'
import { vuetifySessionOptions } from '@data-fair/lib-vuetify'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { createLocaleDayjs } from '@data-fair/lib-vue/locale-dayjs.js'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import '@data-fair/frame/lib/d-frame'
import App from './app.vue'
import { createConfig } from '@/composables/config'

window.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

async function init () {
  const session = await createSession({ directoryUrl: '/simple-directory', siteInfo: true })

  const vuetifyOptions = vuetifySessionOptions(session)
  vuetifyOptions.icons = {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi }
  }

  const app = createApp(App)
  app.use(createVuetify(vuetifyOptions))
  app.use(session)
  app.use(createLocaleDayjs(session.lang.value))
  app.use(createUiNotif())
  app.use(createConfig())
  app.mount('#app')
}

init().catch((e) => {
  console.error('Failed to initialize app', e)
})
