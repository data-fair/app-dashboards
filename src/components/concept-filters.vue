<script setup>
import { ofetch } from 'ofetch'
import { ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params.js'
import { escape } from '@data-fair/lib/filters.js'

const props = defineProps({
  config: { type: Object, required: true }
})
const emit = defineEmits(['update:model-value'])

const filters = props.config.conceptFilters.map(filter => {
  const items = ref([])
  return {
    ...filter,
    value: ref(''),
    items,
    loading: ref(false),
    searchItems: async (search) => {
      const qs = props.config.conceptFilters.filter(f => f.labelField.key !== filter.labelField.key && reactiveSearchParams[f.labelField.key]).map(f => `${escape(f.labelField.key)}:"${escape(reactiveSearchParams[f.labelField.key])}"`)
      const params = { collapse: filter.labelField.key, select }
      if (qs.length) params.qs = qs.join(' AND ')
      if (!filter.showAllValues) {
        params.q = search + '*'
        params.q_mode = 'complete'
        params.sort = '_score,' + filter.labelField.key
      } else {
        params.size = 1000
        params.sort = filter.labelField.key
      }
      const res = await ofetch(props.config.datasets[0].href + '/lines', { params })
      items.value = res.results
    }
  }
})

filters.forEach((filter, i, self) => {
  filter.setValue = async (item) => {
    if (filter.forceOneValue && !item) return
    emit('update:model-value', item)
    if (item) {
      reactiveSearchParams[filter.labelField.key] = item[filter.labelField.key]
      for (const field of filter.concepts) {
        reactiveSearchParams[`_c_${field['x-concept'].id}_eq`] = item[field.key]
      }
    } else {
      delete reactiveSearchParams[filter.labelField.key]
      for (const field of filter.concepts) {
        delete reactiveSearchParams[`_c_${field['x-concept'].id}_eq`]
      }
    }
    const qs = props.config.conceptFilters.filter(f => reactiveSearchParams[f.labelField.key]).map(f => `${escape(f.labelField.key)}:"${escape(reactiveSearchParams[f.labelField.key])}"`)
    const params = { select }
    if (qs.length) params.qs = qs.join(' AND ')
    const res = await ofetch(props.config.datasets[0].href + '/lines', { params })
    const result = res.results.pop()
    if (result) {
      self.forEach(f => {
        if (f.labelField.key !== filter.labelField.key) {
          if (reactiveSearchParams[f.labelField.key])f.value.value = result
        } else filter.searchItems('')
      })
    }
  }
})

const select = [].concat(props.config.conceptFilters.map(f => [f.labelField.key].concat(f.concepts.map(f => f.key)))).join(',')
if (props.config.conceptFilters.reduce((acc, f) => acc || reactiveSearchParams[f.labelField.key], false)) {
  // TODO escape in qs
  const qs = props.config.conceptFilters.filter(f => reactiveSearchParams[f.labelField.key]).map(f => `${escape(f.labelField.key)}:"${escape(reactiveSearchParams[f.labelField.key])}"`)
  const params = { select }
  if (qs.length) params.qs = qs.join(' AND ')
  const res = await ofetch(props.config.datasets[0].href + '/lines', { params })
  const result = res.results.pop()
  if (result) {
    filters.filter(f => reactiveSearchParams[f.labelField.key]).forEach(filter => {
      filter.value.value = result
      for (const field of filter.concepts) {
        reactiveSearchParams[`_c_${field['x-concept'].id}_eq`] = result[field.key]
      }
    })
    emit('update:model-value', result)
  }
}

filters.forEach(filter => { filter.searchItems('') })

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
          v-model="filter.value.value"
          :loading="filter.loading.value"
          :items="filter.items.value"
          variant="outlined"
          hide-details
          no-data-text="Aucun élément trouvé"
          :item-title="filter.labelField.key"
          return-object
          :label="filter.labelField.label || filter.labelField.title || filter.labelField['x-originalName'] || filter.labelField.key"
          :clearable="!filter.forceOneValue"
          style="min-width:280px;"
          @update:search="search => !filter.showAllValues && filter.searchItems(search)"
          @update:model-value="filter.setValue"
        />
      </v-col>
    </v-row>
  </v-card>
</template>
