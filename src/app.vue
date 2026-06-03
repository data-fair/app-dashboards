<script setup lang="ts">
/**
 * Root component. Initializes the parent-DataFair sync and the
 * configuration error reporting in draft mode, and mounts the dashboard.
 */
import dashboard from './components/dashboard.vue'
import DfUiNotif from '@data-fair/lib-vuetify/ui-notif.vue'
import { useConfig } from '@/composables/config'
import { useParentSync } from '@/composables/useParentSync'
import { useErrorReporting } from '@/composables/useErrorReporting'

const { config, error } = useConfig()
useParentSync(config)
useErrorReporting(error)
</script>

<template>
  <v-app>
    <v-main>
      <Suspense>
        <dashboard />
      </Suspense>
      <df-ui-notif />
    </v-main>
  </v-app>
</template>
