<script setup>
const application = window.APPLICATION
const setError = (error) => {
  console.error(error)
  $fetch(application.href + '/error', { method: 'POST', body: { message: error.message || error } })
}

const incompleteConfiguration = !application.configuration.concept || !application.configuration.masterData
if (incompleteConfiguration) {
  setError('configuration incomplète')
}

const conceptValue = ref(null)
</script>

<template>
  <v-container v-if="!incompleteConfiguration">
    <concept-filter :concept="application.configuration.concept" :master-data="application.configuration.masterData" @update:model-value="value => conceptValue = value" />
    <dashboard-section v-for="(section,i) of (application.configuration.sections || [])" :key="i" :section="section" />
  </v-container>
</template>
