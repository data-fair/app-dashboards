import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { settingsPath } from '@data-fair/lib-vuetify/vite.js'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Vite ne peuple pas process.env depuis un .env : passer par loadEnv.
  // Le .env est généré une fois par df-dev-env (ports libres consécutifs).
  const env = loadEnv(mode, process.cwd(), '')
  const port = Number(env.APP_PORT ?? 3000)
  return {
    base: env.PUBLIC_URL ?? '/app/',
    plugins: [
      vue({
        template: {
          transformAssetUrls,
          compilerOptions: { isCustomElement: (tag: string) => ['d-frame'].includes(tag) }
        }
      }),
      VueI18nPlugin({ strictMessage: false }),
      // https://github.com/vuetifyjs/vuetify-loader/tree/next/packages/vite-plugin
      vuetify({
        autoImport: true,
        styles: { configFile: settingsPath }
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
      extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue']
    },
    server: {
      port,
      strictPort: !!env.APP_PORT,
      // hmr suit le port du serveur : un websocket resté sur un autre port fait
      // tenir deux ports à l'application et annule le ports générés.
      hmr: { port, protocol: 'ws' }
    },
    // Préchauffe le graphe de modules au démarrage : sans lui le serveur ne
    // transforme les modules qu'à la première requête et la suite e2e court
    // contre un démarrage à froid (échecs trompeurs type "Failed to fetch
    // dynamically imported module").
    warmup: {
      clientFiles: ['./src/main.ts', './src/**/*.vue']
    }
  }
})
