<script setup>
import element from './element.vue'

defineProps({
  section: { type: Object, required: true },
  conceptValues: { type: [Object, null], required: true },
  hideTitle: { type: Boolean, default: false }
})

const widths = {
  sm: {
    small: 6,
    medium: 12,
    large: 12,
    full: 12
  },
  md: {
    small: 4,
    medium: 6,
    large: 8,
    full: 12
  },
  lg: {
    small: 3,
    medium: 4,
    large: 6,
    full: 12
  },
  xl: {
    small: 2,
    medium: 3,
    large: 6,
    full: 12
  }
}
</script>

<template>
  <h3
    v-if="!hideTitle"
    class="text-h5 mt-8"
  >
    <template v-if="section.icon">
      <v-icon>
        mdi-{{ section.icon.name }}
      </v-icon>
      &nbsp;
    </template>
    {{ section.title }}
  </h3>
  <p
    v-if="section.description"
    class="mt-4"
  >
    {{ section.description }}
  </p>
  <v-row>
    <v-col
      v-for="(element,i) of (section.elements || [])"
      :key="i"
      :cols="12"
      :sm="widths.sm[element.width]"
      :md="widths.md[element.width]"
      :lg="widths.lg[element.width]"
      :xl="widths.xl[element.width]"
    >
      <h4
        v-if="element.title"
        class="text-h6 mt-4"
      >
        {{ element.title }}
      </h4>
      <v-alert
        v-if="element.valueMandatory && (!conceptValues || !conceptValues[element.concept.key])"
        type="info"
        variant="outlined"
      >
        <h4>Veuillez sélectionner une valeur dans la liste</h4>
      </v-alert>
      <element
        v-else
        :element="element"
        :height="section.height"
      />
    </v-col>
  </v-row>
</template>
