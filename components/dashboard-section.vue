<script setup>
defineProps({
  section: { type: Object, required: true },
  paramFields: { type: Array, required: true },
  conceptValues: { type: [Object, null], required: true }
})

const widths = {
  sm: {
    small: 6,
    medium: 12,
    large: 12,
    full: 12
  },
  lg: {
    small: 4,
    medium: 6,
    large: 8,
    full: 12
  },
  xl: {
    small: 3,
    medium: 4,
    large: 6,
    full: 12
  }
}
</script>

<template>
  <h2 class="text-h5 mt-8">
    {{ section.title }}
  </h2>
  <p v-if="section.description" class="mt-4">
    {{ section.description }}
  </p>
  <v-row>
    <v-col
      v-for="(element,i) of (section.elements || [])"
      :key="i"
      :cols="12"
      :sm="widths.sm[element.width]"
      :lg="widths.lg[element.width]"
      :xl="widths.xl[element.width]"
    >
      <v-alert v-if="element.valueMandatory && (!conceptValues || !conceptValues[element.concept.key])" type="info" variant="outlined">
        <h4>Veuillez sélectionner une valeur dans la liste</h4>
      </v-alert>
      <element v-else :element="element" :paramFields="paramFields" :height="section.height" />
    </v-col>
  </v-row>
</template>
