import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      // Le périmètre couvert : les utilitaires purs + les composables (le gros
      // de la logique). Les composants Vue (.vue) et le point d'entrée restent
      // hors périmètre pour l'instant (montage Vuetify lourd) — à noter en
      // follow-up, ils apparaissent à 0% si on les inclut.
      include: ['src/utils/**/*.ts', 'src/composables/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})