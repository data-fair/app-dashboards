<script setup>
import { messageDisplay, messageType, messageContent } from '@/messages'
</script>

<template>
  <v-snackbar
    v-model="messageDisplay"
    :timeout="10000"
    :color="messageType"
  >
    <div>
      {{ messageContent }}
    </div>
  </v-snackbar>
</template>
