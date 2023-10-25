<script setup>
const props = defineProps({
  dataset: { type: Object, required: true },
  labelField: { type: Object, required: true },
  conceptsFields: { type: Array, required: true }
})
const emit = defineEmits(['update:model-value'])
const route = useRoute()
const router = useRouter()

const value = ref('')
const items = ref([])
const loading = ref(false)

const searchItems = async (search) => {
  const res = await $fetch(props.dataset.href + '/lines', {
    params: { q: search, select: [props.labelField.key].concat(props.conceptsFields.map(f => f.key)).join(',') }
  })
  items.value = res.results
}
searchItems('')

if (route.query[props.labelField.key]) {
  const res = await $fetch(props.dataset.href + '/lines', {
    params: { q: route.query[props.labelField.key], select: [props.labelField.key].concat(props.conceptsFields.map(f => f.key)).join(','), q_mode: 'complete' }
  })
  const result = res.results.find(r => r[props.labelField.key] === route.query[props.labelField.key])
  if (result) {
    value.value = result
    emit('update:model-value', result)
  }
}

const setValue = (item) => {
  emit('update:model-value', item)
  const newQuery = { ...route.query }
  if (item) {
    for (const field of props.conceptsFields) {
      newQuery[`_c_${field['x-concept'].id}_in`] = item[field.key]
    }
    newQuery[props.labelField.key] = item[props.labelField.key]
  } else {
    delete newQuery[props.labelField.key]
    for (const field of props.conceptsFields) {
      delete newQuery[`_c_${field['x-concept'].id}_in`]
    }
  }
  router.replace({ path: route.path, query: newQuery })
}
</script>

<template>
  <v-autocomplete
    v-model="value"
    :loading="loading"
    :items="items"
    variant="outlined"
    hide-no-data
    hide-details
    :item-title="props.labelField.key"
    return-object
    :label="props.labelField.title"
    :clearable="true"
    style="min-width:280px;"
    @update:search="search => searchItems(search)"
    @update:model-value="setValue"
  />
</template>
