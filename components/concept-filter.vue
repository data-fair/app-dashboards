<script setup>
const props = defineProps({
  concept: { type: Object, required: true },
  masterData: { type: Object, required: true }
})
defineEmits(['update:model-value'])

const labelOutput = props.masterData.action.output.find(o => o.concept === 'http://www.w3.org/2000/01/rdf-schema#label')
const keyOutput = props.masterData.action.output.find(o => o.concept && o.concept !== 'http://www.w3.org/2000/01/rdf-schema#label')

const value = ref('')
const items = ref([])
const loading = ref(false)

const searchItems = async (search) => {
  const res = await $fetch(props.masterData.remoteService.server + props.masterData.action.operation.path, {
    params: { q: search }
  })
  items.value = res.results
}
searchItems('')
</script>

<template>
  <v-autocomplete
    v-model="value"
    :loading="loading"
    :items="items"
    variant="outlined"
    hide-no-data
    hide-details
    :item-value="keyOutput.name"
    :item-title="labelOutput.name"
    return-object
    :label="concept.title"
    :clearable="true"
    @update:search="search => searchItems(search)"
    @update:model-value="value => $emit('update:model-value', value)"
  />
</template>
