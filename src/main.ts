import { createApp } from 'vue'
// global.scss REMPLACE 'vuetify/styles' — jamais les deux.
// Il compile Vuetify avec $body-font-family: var(--d-body-font-family), variable
// posée par _theme.css : c'est ce qui applique la police du site à la visualisation.
import '@data-fair/lib-vuetify/style/global.scss'
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
import fr from './locales/fr'
import en from './locales/en'

window.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

// Permet au shim v-iframe-compat (injecté par DataFair quand l'app est
// embarquée via d-frame) d'appliquer les updateSrc sans recharger l'iframe.
// À poser au niveau module, AVANT createApp().
window.vIframeOptions = { reactiveParams: reactiveSearchParams }

async function init () {
  // Le <script> _public.js d'index.html pose window.__PUBLIC_SITE_INFO, lu sans
  // fetch ; l'option siteInfo déclenche refreshSiteInfo, déprécié, et ne reste
  // qu'en repli si le script n'a pas été servi. vuetifySessionOptions lève si la
  // session n'a pas ses infos de site : createSession doit donc être await.
  const session = await createSession({
    directoryUrl: '/simple-directory',
    siteInfo: !window.__PUBLIC_SITE_INFO
  })

  // createI18n APRÈS la session, avec la locale définitive ; app.use(i18n)
  // avant mount(). Ne jamais réassigner i18n.global.locale.value : un changement
  // de langue recharge le document. fallbackLocale: 'en' obligatoire —
  // simple-directory sert six langues, les messages de lib-vuetify n'ont que
  // fr et en ; sans repli, une session d'une autre langue affiche les clés brutes.
  // escapeParameterHtml assainit les paramètres interpolés (labels de champs,
  // ...) tandis que le HTML des messages (ex. <strong>) est conservé.
  const i18n = createI18n({
    legacy: false,
    locale: session.lang.value as 'fr' | 'en',
    fallbackLocale: 'en',
    messages: { fr, en },
    escapeParameterHtml: true
  })

  const vuetify = createVuetify({
    ...vuetifySessionOptions(session),
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } }
  })

  const app = createApp(App)
  app.use(vuetify)
    .use(session)
    .use(i18n)
    .use(createLocaleDayjs(session.lang.value))
    .use(createUiNotif())
    .use(createConfig())
  app.mount('#app')
}

init().catch((e) => {
  console.error('Failed to initialize app', e)
  // Débloque le service de capture même en cas d'échec d'initialisation
  // (sinon chaque capture attend le délai complet de df:capture-delay).
  window.triggerCapture?.()
})
