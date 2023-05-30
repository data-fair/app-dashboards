// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  app: {
    // cdnURL: process.env.PUBLIC_URL + '/_nuxt/',
    head: {
      title: 'Dashboards'
    }
  }
})
