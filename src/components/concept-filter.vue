<script setup>
import { ofetch } from 'ofetch'
import { ref } from 'vue'
import reactiveSearchParams from '@data-fair/lib/vue/reactive-search-params.js'

const props = defineProps({
  labelField: { type: Object, required: true },
  conceptsFields: { type: Array, required: true },
  config: { type: Object, required: true }
})
const emit = defineEmits(['update:model-value'])

const value = ref('')
const items = ref([])
const loading = ref(false)

if (reactiveSearchParams[props.labelField.key]) {
  const res = await ofetch(props.config.datasets[0].href + '/lines', {
    params: { q: reactiveSearchParams[props.labelField.key], collapse: props.labelField.key, select: [props.labelField.key].concat(props.conceptsFields.map(f => f.key)).join(','), q_mode: 'complete' }
  })
  const result = res.results.find(r => (r[props.labelField.key] + '') === reactiveSearchParams[props.labelField.key])
  if (result) {
    value.value = result
    for (const field of props.conceptsFields) {
      reactiveSearchParams[`_c_${field['x-concept'].id}_eq`] = result[field.key]
    }
    emit('update:model-value', result)
  }
}

const searchItems = async (search) => {
  const params = { collapse: props.labelField.key, select: [props.labelField.key].concat(props.conceptsFields.map(f => f.key)).join(',') }
  if (!props.config.showAllValues) {
    params.q = search + '*'
    params.q_mode = 'complete'
  } else {
    params.size = 1000
    params.sort = props.labelField.key
  }
  const res = await ofetch(props.config.datasets[0].href + '/lines', { params })
  items.value = res.results
}
searchItems('')

const setValue = (item) => {
  if (props.config.forceOneValue && !item) return
  emit('update:model-value', item)
  if (item) {
    for (const field of props.conceptsFields) {
      reactiveSearchParams[`_c_${field['x-concept'].id}_eq`] = item[field.key]
    }
    reactiveSearchParams[props.labelField.key] = item[props.labelField.key]
  } else {
    delete reactiveSearchParams[props.labelField.key]
    for (const field of props.conceptsFields) {
      delete reactiveSearchParams[`_c_${field['x-concept'].id}_eq`]
    }
  }
}
</script>

<template>
  <v-autocomplete
    v-model="value"
    :loading="loading"
    :items="items"
    variant="outlined"
    hide-details
    no-data-text="Aucun élément trouvé"
    :item-title="props.labelField.key"
    return-object
    :label="props.labelField.title || props.labelField['x-originalName'] || props.labelField.key"
    :clearable="!props.config.forceOneValue"
    style="min-width:280px;"
    @update:search="search => !props.config.showAllValues && searchItems(search)"
    @update:model-value="setValue"
  />
</template>
