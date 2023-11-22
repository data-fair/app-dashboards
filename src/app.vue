<script setup>
import dashboard from './components/dashboard.vue'
</script>

<template>
  <v-app>
    <v-main>
      <Suspense>
        <dashboard />
      </Suspense>
    </v-main>
  </v-app>
</template>
