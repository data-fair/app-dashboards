<script setup>
import { ofetch } from 'ofetch'
import { ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params-global.js'
import 'iframe-resizer/js/iframeResizer'
import conceptFilters from './concept-filters.vue'
import dashboardSection from './dashboard-section.vue'
import { escape } from '@data-fair/lib/filters.js'

// @ts-ignore
const application = window.APPLICATION
const config = application.configuration
const setError = (/** @type{any} */error) => {
  console.error(error)
  ofetch(application.href + '/error', { method: 'POST', body: { message: error.message || error } })
}

const conceptValues = ref({})
const tab = ref(null)
let maxTitleLength = 0
let sumTitleLength = 0

const incompleteConfiguration = !config.datasets || !config.datasets.length
if (incompleteConfiguration) {
  setError('Veuillez choisir un source de données pour le filtre commun')
} else if ((!config.conceptFilters || !config.conceptFilters.length) && !config.periodFilter && !config.addressFilter) {
  setError('Veuillez configurer un filtre')
} else {
/** @type{any[]} */
  // const conceptsFields = [].concat(...config.sections.map((/** @type{any} */s) => [].concat(...s.elements.filter((/** @type{any} */e) => e.concepts && e.concepts.length).map((/** @type{any} */e) => e.concepts)))).filter((/** @type{any} */e1, i, s) => s.findIndex((/** @type{any} */e2) => e1.key === e2.key) === i)
  // TODO : set error if same concept is usesd in 2 filters

  for (const filter of config.conceptFilters) {
    if (filter.type === 'field' && !reactiveSearchParams[filter.labelField.key] && filter.forceOneValue && filter.startValue) {
      reactiveSearchParams[filter.labelField.key] = filter.startValue
    }
  }
  if (config.periodFilter && !reactiveSearchParams.period) {
    const start = (config.datasets[0].timePeriod ? config.datasets[0].timePeriod.startDate : new Date().toISOString()).slice(0, 10)
    const end = (config.datasets[0].timePeriod ? config.datasets[0].timePeriod.endDate : new Date().toISOString()).slice(0, 10)
    const period = [start]
    if (start !== end) period.push(end)
    reactiveSearchParams.period = period.join(',')
  }

  for (const key in reactiveSearchParams) {
    if (key.startsWith('_c_')) {
      const concept = key.slice(3, key.lastIndexOf('_'))
      const filter = config.conceptFilters.find(f => {
        return f.concepts.find(c => c['x-concept'].id === concept)
      })
      if (filter) {
        const field = filter.concepts.find(c => c['x-concept'].id === concept)
        const params = {
          select: field.key + ',' + filter.labelField.key,
          qs: `${escape(field.key)}:"${escape(reactiveSearchParams[key])}"`,
          size: 1
        }
        const res = await ofetch(config.datasets[0].href + '/lines', { params })
        if (res.results.length) {
          reactiveSearchParams[filter.labelField.key] = res.results[0][filter.labelField.key]
          delete reactiveSearchParams[key]
        }
      }
    }
  }

  maxTitleLength = Math.max(...config.sections.map((/** @type{any} */s) => (s.title && s.title.length) || 0))
  sumTitleLength = config.sections.reduce((/** @type{any} */acc, /** @type{any} */s) => acc + ((s.title && s.title.length) || 0), 0)
}
</script>

<template>
  <v-container
    v-if="config.conceptFilters?.length || config.periodFilter || config.addressFilter"
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
    <concept-filters
      :config="config"
      @update:model-value="value => conceptValues = value"
    />
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
              mandatory
              :style="sumTitleLength*15 >= $vuetify.display.width ? `flex-direction: column;height:${config.sections.length*36}px`:''"
            >
              <v-btn
                v-for="(section, i) of (config.sections || [])"
                :key="i"
                :value="i"
                :height="sumTitleLength*15 >= $vuetify.display.width ? 36 : 48"
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
