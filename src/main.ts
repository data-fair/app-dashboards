import { createApp } from 'vue'
// global.scss REPLACES 'vuetify/styles' — never both.
// It compiles Vuetify with $body-font-family: var(--d-body-font-family), a variable
// set by _theme.css: this is what applies the site font to the visualization.
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

// Lets the v-iframe-compat shim (injected by DataFair when the app is
// embedded via d-frame) apply updateSrc without reloading the iframe.
// Must be set at module level, BEFORE createApp().
window.vIframeOptions = { reactiveParams: reactiveSearchParams }

async function init () {
  // The _public.js <script> of index.html sets window.__PUBLIC_SITE_INFO, read
  // without fetch; the siteInfo option triggers the deprecated refreshSiteInfo and
  // is only a fallback if the script was not served. vuetifySessionOptions throws if
  // the session lacks its site info: createSession must therefore be awaited.
  const session = await createSession({
    directoryUrl: '/simple-directory',
    siteInfo: !window.__PUBLIC_SITE_INFO
  })

  // createI18n AFTER the session, with the final locale; app.use(i18n)
  // before mount(). Never reassign i18n.global.locale.value: a language
  // change reloads the document. fallbackLocale: 'en' is mandatory —
  // simple-directory serves six languages, lib-vuetify messages only have
  // fr and en; without a fallback, a session in another language shows raw keys.
  // escapeParameterHtml sanitizes interpolated parameters (field labels,
  // ...) while the messages' HTML (e.g. <strong>) is kept.
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
  // Unblocks the capture service even when initialization fails
  // (otherwise each capture waits for the full df:capture-delay).
  window.triggerCapture?.()
})
