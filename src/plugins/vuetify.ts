import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

const params = new URLSearchParams(window.location.search)

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    ssr: false,
    icons: {
      defaultSet: 'mdi',
      aliases,
      sets: {
        mdi
      }
    },
    theme: {
      defaultTheme: 'myCustomTheme',
      themes: {
        myCustomTheme: {
          colors: {
            primary: params.get('primary') || '#1E88E5'
          }
        }
      }
    }
  })
  nuxtApp.vueApp.use(vuetify)
})
