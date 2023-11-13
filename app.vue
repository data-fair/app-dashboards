<script setup>
const application = window.APPLICATION
const config = application.configuration
const setError = (error) => {
  console.error(error)
  $fetch(application.href + '/error', { method: 'POST', body: { message: error.message || error } })
}

const incompleteConfiguration = !config.datasets || !config.datasets.length
if (incompleteConfiguration) {
  setError('configuration incomplète')
}
const dataset = await $fetch(config.datasets[0].href)
const labelField = dataset.schema.find(f => f.key === config.labelField || f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label')
const route = useRoute()
const router = useRouter()
if (!route.query[labelField.key] && config.startValue) {
  const newQuery = { ...route.query }
  newQuery[labelField.key] = config.startValue
  router.replace({ path: route.path, query: newQuery })
}

const conceptsFields = [].concat(...config.sections.map(s => [].concat(...s.elements.filter(e => e.concept).map(e => e.concept)))).filter((e1, i, s) => s.findIndex(e2 => e1.key === e2.key) === i)
const paramFields = [labelField.key].concat(conceptsFields.map(f => `_c_${f['x-concept'].id}_eq`))
const conceptValues = ref(null)
const tab = ref(null)
</script>

<template>
  <v-container v-if="dataset && labelField">
    <h2 v-if="config.title" class="text-h4 text-center">
      {{ config.title }}
    </h2>
    <p v-if="config.description" class="mt-2">
      {{ config.description }}
    </p>
    <v-row class="mt-3">
      <v-spacer />
      <v-col v-if="conceptsFields" cols="auto">
        <concept-filter :dataset="dataset" :label-field="labelField" :concepts-fields="conceptsFields" :config="config" @update:model-value="value => conceptValues = value" />
      </v-col>
      <v-spacer />
    </v-row>
    <template v-if="config.sectionsGroup === 'tabs'">
      <v-tabs
        v-model="tab"
        class="mb-3"
        grow
      >
        <v-tab
          v-for="(section, i) of (config.sections || [])"
          :key="i"
          :value="i"
        >
          <template v-if="section.icon">
            <v-icon>
              mdi-{{ section.icon.name }}
            </v-icon>
            &nbsp;
          </template>
          {{ section.title }}
        </v-tab>
      </v-tabs>

      <v-window v-model="tab">
        <v-window-item
          v-for="(section, i) of (config.sections || [])"
          :key="i"
          :value="i"
        >
          <dashboard-section :section="section" :param-fields="paramFields" :concept-values="conceptValues" hide-title />
        </v-window-item>
      </v-window>
    </template>
    <dashboard-section
      v-for="(section, i) of (config.sections || [])"
      v-else
      :key="i"
      :section="section"
      :param-fields="paramFields"
      :concept-values="conceptValues"
    />
  </v-container>
</template>
