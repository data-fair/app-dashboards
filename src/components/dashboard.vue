<script setup>
import { ofetch } from 'ofetch'
import { ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params.js'
import 'iframe-resizer/js/iframeResizer'
import conceptFilter from './concept-filter.vue'
import dashboardSection from './dashboard-section.vue'

// @ts-ignore
const application = window.APPLICATION
const config = application.configuration
const setError = (/** @type{any} */error) => {
  console.error(error)
  ofetch(application.href + '/error', { method: 'POST', body: { message: error.message || error } })
}

const incompleteConfiguration = !config.datasets || !config.datasets.length
if (incompleteConfiguration) {
  setError('Veuillez choisir un source de données pour le filtre commun')
}
const labelField = config.datasets[0].schema.find((/** @type{any} */f) => f.key === config.labelField) || config.datasets[0].schema.find((/** @type{any} */f) => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label')
if (!labelField) {
  setError('Veuillez configurer la colonne de libellé pour le filtre commun')
}
if (!reactiveSearchParams[labelField.key] && config.startValue) {
  reactiveSearchParams[labelField.key] = config.startValue
}
/** @type{any[]} */
const conceptsFields = [].concat(...config.sections.map((/** @type{any} */s) => [].concat(...s.elements.filter((/** @type{any} */e) => e.concept).map((/** @type{any} */e) => e.concept)))).filter((/** @type{any} */e1, i, s) => s.findIndex((/** @type{any} */e2) => e1.key === e2.key) === i)
const conceptValues = ref(null)
const tab = ref(null)
const maxTitleLength = Math.max(...config.sections.map((/** @type{any} */s) => (s.title && s.title.length) || 0))
const sumTitleLength = config.sections.reduce((/** @type{any} */acc, /** @type{any} */s) => acc + ((s.title && s.title.length) || 0), 0)
</script>

<template>
  <v-container
    v-if="labelField"
    fluid
    data-iframe-height
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
    <v-card
      flat
      class="py-3"
    >
      <v-row>
        <v-spacer />
        <v-col
          v-if="conceptsFields"
          cols="auto"
        >
          <concept-filter
            :label-field="labelField"
            :concepts-fields="conceptsFields"
            :config="config"
            @update:model-value="value => conceptValues = value"
          />
        </v-col>
        <v-spacer />
      </v-row>
    </v-card>
    <dashboard-section
      v-if="config.sections.length === 1"
      :section="config.sections[0]"
      :concept-values="conceptValues"
    />
    <template v-else-if="config.sectionsGroup.includes('tabs')">
      <v-tabs
        v-if="config.sectionsGroup === 'tabs-tab'"
        v-model="tab"
        class="mb-3"
        color="primary"
        :fixed-tabs="maxTitleLength <= 30"
        :grow="maxTitleLength > 30 && sumTitleLength < 200"
        :direction="sumTitleLength >= 200 ? 'vertical' : 'horizontal'"
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
      <v-row v-else-if="config.sectionsGroup === 'tabs-button'">
        <v-spacer />
        <v-col
          cols="auto"
        >
          <v-card
            variant="outlined"
          >
            <v-btn-toggle

              v-model="tab"
              color="primary"
              :style="sumTitleLength >= 200 ? `flex-direction: column;height:${config.sections.length*19}px`:''"
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
            </v-btn-toggle>
          </v-card>
        </v-col>
        <v-spacer />
      </v-row>
      <v-window v-model="tab">
        <v-window-item
          v-for="(section, i) of (config.sections || [])"
          :key="i"
          :value="i"
        >
          <dashboard-section
            :section="section"
            :concept-values="conceptValues"
            hide-title
          />
        </v-window-item>
      </v-window>
    </template>
    <v-expansion-panels
      v-else-if="config.sectionsGroup === 'accordion'"
      multiple
      variant="accordion"
      :model-value="config.sections.map((s, i) => i)"
    >
      <v-expansion-panel
        v-for="(section, i) of (config.sections || [])"
        :key="i"
        :value="i"
        eager
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
            :concept-values="conceptValues"
            hide-title
          />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <template v-else>
      <div
        v-for="(section, i) of (config.sections || [])"
        :key="i"
        class="my-6"
      >
        <h2>
          <template v-if="section.icon">
            <v-icon>
              mdi-{{ section.icon.name }}
            </v-icon>
                &nbsp;
          </template>
          {{ section.title }}
        </h2>
        <dashboard-section
          :section="section"
          :concept-values="conceptValues"
          hide-title
        />
      </div>
    </template>
  </v-container>
</template>
