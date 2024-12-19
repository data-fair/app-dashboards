import { createApp } from 'vue'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { defaultOptions } from '@data-fair/lib-vuetify'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import App from './app.vue'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

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

const app = createApp(App)

app.use(createVuetify(options))

app.mount('#app')
