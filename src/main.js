import { createApp } from 'vue'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { defaultOptions } from '@data-fair/lib/vuetify.js'
import App from './app.vue'

window.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

const app = createApp(App)

app.use(createVuetify(defaultOptions))

app.mount('#app')
