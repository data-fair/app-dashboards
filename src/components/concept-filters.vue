<script setup>
import { ofetch } from 'ofetch'
import { ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params.js'
import { escape } from '@data-fair/lib/filters.js'

const props = defineProps({
  config: { type: Object, required: true }
})
const emit = defineEmits(['update:model-value'])

const fields = Object.assign({}, ...props.config.datasets[0].schema.map(f => ({[f.key]: f})))

const filters = props.config.conceptFilters.map(filter => {
  const items = ref([])
  return {
    ...filter,
    items,
    loading: ref(false),
    searchItems: async (search) => {
      const qs = props.config.conceptFilters.filter(f => f.labelField.key !== filter.labelField.key && reactiveSearchParams[f.labelField.key]).map(f => `${escape(f.labelField.key)}:"${escape(reactiveSearchParams[f.labelField.key])}"`)
      const params = {}
      if (!filter.showAllValues) {
        if (search != null) params.q = search + '*'
      } else {
        params.size = 1000
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
    const select = [].concat(...fieldsWithFilter.map(f => [f.labelField.key].concat(f.concepts.map(f => f.key)))).filter((f, i, s) => s.indexOf(f) === i).join(',')
    const qs = props.config.conceptFilters.filter(f => reactiveSearchParams[f.labelField.key]).map(f => `${escape(f.labelField.key)}:"${escape(reactiveSearchParams[f.labelField.key])}"`)
    const params = { select }
    if (qs.length) params.qs = qs.join(' AND ')
    const res = await ofetch(props.config.datasets[0].href + '/lines', { params })
    conceptValues = res.results.pop() || {}
  }
  emit('update:model-value', conceptValues)
  filters.forEach(filter => {
    if(filter.labelField.key !== noFieldUpdate) filter.searchItems()
  })
}

await updateConcepts()
</script>

<template>
  <v-card
    flat
    class="py-3"
  >
    <v-row justify="center">
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
    </v-row>
  </v-card>
</template>
