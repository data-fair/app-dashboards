<script setup>
import { ofetch } from 'ofetch'
import { ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params.js'
import 'iframe-resizer/js/iframeResizer'
import conceptFilter from './concept-filter.vue'

const application = window.APPLICATION
const config = application.configuration
const setError = (error) => {
  console.error(error)
  ofetch(application.href + '/error', { method: 'POST', body: { message: error.message || error } })
}

const incompleteConfiguration = !config.datasets || !config.datasets.length
if (incompleteConfiguration) {
  setError('configuration incomplète')
}
const dataset = await ofetch(config.datasets[0].href)
const labelField = dataset.schema.find(f => f.key === config.labelField || f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label')
if (!reactiveSearchParams[labelField.key] && config.startValue) {
  reactiveSearchParams[labelField.key] = config.startValue
}
const conceptsFields = [].concat(...config.sections.map(s => [].concat(...s.elements.filter(e => e.concept).map(e => e.concept)))).filter((e1, i, s) => s.findIndex(e2 => e1.key === e2.key) === i)
const paramFields = [labelField.key].concat(conceptsFields.map(f => `_c_${f['x-concept'].id}_eq`))
const conceptValues = ref(null)
const tab = ref(null)
</script>

<template>
  <v-container
    v-if="dataset && labelField"
    fluid
  >
    <h2
      v-if="config.title"
      class="text-h4 text-center"
    >
      {{ config.title }}
    </h2>
    <p
      v-if="config.description"
      class="mt-2"
    >
      {{ config.description }}
    </p>
    <v-row class="mt-3">
      <v-spacer />
      <v-col
        v-if="conceptsFields"
        cols="auto"
      >
        <concept-filter
          :dataset="dataset"
          :label-field="labelField"
          :concepts-fields="conceptsFields"
          :config="config"
          @update:model-value="value => conceptValues = value"
        />
      </v-col>
      <v-spacer />
    </v-row>
    <dashboard-section
      v-if="config.sections.length === 1"
      :section="config.sections[0]"
      :param-fields="paramFields"
      :concept-values="conceptValues"
    />
    <template v-else-if="config.sectionsGroup === 'tabs'">
      <v-tabs
        v-model="tab"
        class="mb-3"
        color="primary"
        fixed-tabs
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
      <!-- variant="outlined" -->
      <!-- <v-btn-toggle
        v-model="tab"
        color="primary"
        group
      >
        <v-btn
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
        </v-btn>
      </v-btn-toggle> -->
      <v-window v-model="tab">
        <v-window-item
          v-for="(section, i) of (config.sections || [])"
          :key="i"
          :value="i"
        >
          <dashboard-section
            :section="section"
            :param-fields="paramFields"
            :concept-values="conceptValues"
            hide-title
          />
        </v-window-item>
      </v-window>
    </template>
    <v-expansion-panels
      v-else
      multiple
      variant="accordion"
      :model-value="config.sections.map((s, i) => i)"
    >
      <v-expansion-panel
        v-for="(section, i) of (config.sections || [])"
        :key="i"
        :value="i"
      >
        <v-expansion-panel-title class="bg-primary">
          <h3>
            <template v-if="section.icon">
              <v-icon>
                mdi-{{ section.icon.name }}
              </v-icon>
              &nbsp;
            </template>
            {{ section.title }}
          </h3>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <dashboard-section
            :section="section"
            :param-fields="paramFields"
            :concept-values="conceptValues"
            hide-title
          />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </v-container>
</template>
