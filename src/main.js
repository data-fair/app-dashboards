import { createApp } from 'vue'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { defaultOptions } from '@data-fair/lib/vuetify.js'
import App from './app.vue'

const app = createApp(App)

console.log(defaultOptions)
app.use(createVuetify(defaultOptions))

app.mount('#app')
