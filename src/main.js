import { createApp } from 'vue'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { defaultOptions } from '@data-fair/lib-vuetify'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import App from './app.vue'
import { createConfig } from '@/composables/config'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { ofetch } from 'ofetch'
import '@data-fair/frame/lib/d-frame'

window.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

const options = defaultOptions(reactiveSearchParams)
options.icons = {
  defaultSet: 'mdi',
  aliases,
  sets: {
    mdi
  }
}
delete options.defaults

try {
  const app = createApp(App)
  app.use(createVuetify(options)).use(createConfig())
  app.mount('#app')
} catch (e) {
  ofetch(window.APPLICATION.href + '/error', { body: { message: e.message || e }, method: 'POST' })
}
