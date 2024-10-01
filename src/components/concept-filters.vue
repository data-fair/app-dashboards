<script setup>
import { ofetch } from 'ofetch'
import { ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params-global.js'
import SearchAddress from '@data-fair/lib/vuetify/search-address.vue'
import DateRangePicker from '@data-fair/lib/vuetify/date-range-picker.vue'
import { escape } from '@data-fair/lib/filters.js'

const props = defineProps({
  config: { type: Object, required: true }
})
const emit = defineEmits(['update:model-value'])
let address

const fields = Object.assign({}, ...props.config.datasets[0].schema.map(f => ({ [f.key]: f })))

const filters = props.config.conceptFilters.map(filter => {
  const items = ref([])
  return {
    ...filter,
    items,
    loading: ref(false),
    searchItems: async (search) => {
      const qs = props.config.conceptFilters.filter(f => f.labelField.key !== filter.labelField.key && reactiveSearchParams[f.labelField.key]).map(f => `${escape(f.labelField.key)}:"${escape(reactiveSearchParams[f.labelField.key])}"`)
      const params = {
        finalizedAt: props.config.datasets[0].finalizedAt
      }
      if (!filter.showAllValues) {
        if (search != null) params.q = search + '*'
      } else {
        params.size = 1000
      }
      if (props.config.periodFilter) {
        params._c_date_match = reactiveSearchParams.period
      }
      if (props.config.addressFilter && address && reactiveSearchParams.radius) {
        params._c_geo_distance = address.lon + ',' + address.lat + ',' + reactiveSearchParams.radius * 1000
      }
      if (qs.length) params.qs = qs.join(' AND ')
      const values = await ofetch(props.config.datasets[0].href + '/values/' + filter.labelField.key, { params })
      if (reactiveSearchParams[filter.labelField.key] && !values.includes(reactiveSearchParams[filter.labelField.key])) {
        values.unshift(reactiveSearchParams[filter.labelField.key])
      }
      items.value = values
    }
  }
})

const updateValue = (filter, value) => {
  if (!filter.forceOneValue || value) {
    reactiveSearchParams[filter.labelField.key] = value
    updateConcepts(filter.labelField.key)
  }
}

const updateConcepts = async (noFieldUpdate) => {
  let conceptValues = {}
  const fieldsWithFilter = filters.filter(f => reactiveSearchParams[f.labelField.key])
  if (fieldsWithFilter.length) {
    const fields = [].concat(...fieldsWithFilter.map(f => [].concat(f.concepts)))
    const select = fields.map(f => f.key).filter((f, i, s) => s.indexOf(f) === i).join(',')
    const qs = props.config.conceptFilters.filter(f => reactiveSearchParams[f.labelField.key]).map(f => `${escape(f.labelField.key)}:"${escape(reactiveSearchParams[f.labelField.key])}"`)
    const params = { select, finalizedAt: props.config.datasets[0].finalizedAt }
    if (qs.length) params.qs = qs.join(' AND ')
    const res = await ofetch(props.config.datasets[0].href + '/lines', { params })
    const values = (res.results.pop() || {})
    conceptValues = Object.assign({}, ...fields.map(f => ({ [`_c_${f['x-concept'].id}_eq`]: values[f.key] })))
  }
  if (props.config.periodFilter) {
    conceptValues._c_date_match = reactiveSearchParams.period
  }
  if (props.config.addressFilter && address && reactiveSearchParams.radius) {
    conceptValues._c_geo_distance = address.lon + ',' + address.lat + ',' + reactiveSearchParams.radius * 1000
  }
  emit('update:model-value', conceptValues)
  filters.forEach(filter => {
    if (filter.labelField.key !== noFieldUpdate) filter.searchItems()
  })
}

await updateConcepts()
</script>

<template>
  <v-card
    flat
    class="py-3"
  >
    <v-row
      justify="center"
      align="center"
    >
      <v-col
        v-for="(filter, i) in filters"
        :key="i"
        cols="auto"
      >
        <v-autocomplete
          :model-value="reactiveSearchParams[filter.labelField.key]"
          :loading="filter.loading.value"
          :items="filter.items.value"
          :item-title="v => fields[filter.labelField.key]['x-labels'] ? fields[filter.labelField.key]['x-labels'][v] : v"
          :item-value="v => v"
          variant="outlined"
          hide-details
          no-data-text="Aucun élément trouvé"
          :label="fields[filter.labelField.key].label || fields[filter.labelField.key].title || fields[filter.labelField.key]['x-originalName'] || filter.labelField.key"
          :clearable="!filter.forceOneValue"
          :persistent-clear="!filter.forceOneValue"
          style="min-width:280px;"
          @update:search="search => (search == null || search.length) && search !== reactiveSearchParams[filter.labelField.key] && !filter.showAllValues && filter.searchItems(search)"
          @update:model-value="updateValue(filter, $event)"
        />
      </v-col>
      <v-col
        v-if="config.periodFilter"
        cols="auto"
      >
        <date-range-picker
          v-model="reactiveSearchParams.period"
          :min="config.datasets[0].timePeriod ? config.datasets[0].timePeriod.startDate.slice(0, 10) : undefined"
          :max="config.datasets[0].timePeriod ? config.datasets[0].timePeriod.endDate.slice(0, 10) : undefined"
          label="Période"
          @update:model-value="updateConcepts()"
        />
      </v-col>
      <v-col
        v-if="config.addressFilter"
        cols="auto"
      >
        <v-card
          variant="outlined"
          class="px-1 py-2"
          style="width:320px;border-color:#A0A0A0"
        >
          <!-- <label
            class="text-body-2 text-medium-emphasis ml-2"
          >Autour d'une adresse</label> -->
          <v-row align="start">
            <v-col
              class="pr-0"
              :cols="8"
            >
              <search-address
                v-model="reactiveSearchParams.address"
                variant="plain"
                @selected="address = $event; updateConcepts()"
              />
            </v-col>
            <v-col
              class="pl-0"
              :cols="4"
            >
              <v-text-field
                v-model="reactiveSearchParams.radius"
                style="height:38px"
                variant="plain"
                type="number"
                label="Rayon (km)"
                density="compact"
                @update:model-value="updateConcepts()"
              />
            </v-col>
          </v-row>
        </v-card>
      </v-col>
    </v-row>
  </v-card>
</template>
