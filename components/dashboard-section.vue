<script setup>
defineProps({
  section: { type: Object, required: true }
})
</script>

<template>
  <h2 class="text-h5 mt-8">
    {{ section.title }}
  </h2>
  <p v-if="section.description" class="mt-4">
    {{ section.description }}
  </p>
  <v-row>
    <v-col v-for="(element,i) of (section.elements || [])" :key="i" sm="12" md="6" lg="4">
      <v-iframe v-if="element.type === 'tablePreview'" :src="`/data-fair/embed/dataset/${element.dataset.id}/table`" />
      <v-iframe v-if="element.type === 'application'" :src="`/data-fair/app/${element.application.id}`" :sync-state="true" />
    </v-col>
  </v-row>
</template>
