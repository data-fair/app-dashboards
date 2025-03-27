<script setup>
import { ofetch } from 'ofetch'
import { ref, computed } from 'vue'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import SearchAddress from '@data-fair/lib-vuetify/search-address.vue'
import DateRangePicker from '@data-fair/lib-vuetify/date-range-picker.vue'
import { useElementSize } from '@vueuse/core'

const props = defineProps({
  config: { type: Object, required: true },
  prefix: { type: String, default: '' }
})
const emit = defineEmits(['update:model-value'])

const root = ref(null)
const { width } = useElementSize(root)

let address

const fields = Object.assign({}, ...props.config.datasets[0].schema.map(f => ({ [f.key]: f })))
const datasetFilterPrefix = '_d_' + props.config.datasets[0].id + '_'

const filters = props.config.filters.map(filter => {
  const items = ref([])
  return {
    ...filter,
    value: computed({
      get () {
        if (reactiveSearchParams[props.prefix + datasetFilterPrefix + filter.labelField + '_in']) {
          return filter.multipleValues ? JSON.parse(`[${reactiveSearchParams[props.prefix + datasetFilterPrefix + filter.labelField + '_in']}]`) : reactiveSearchParams[props.prefix + datasetFilterPrefix + filter.labelField + '_in']
        } else {
          return filter.multipleValues ? [] : undefined
        }
      },
      set (val) {
        if (filter.multipleValues && val.length) {
          reactiveSearchParams[props.prefix + datasetFilterPrefix + filter.labelField + '_in'] = JSON.stringify(val).slice(1, -1)
        } else if (!filter.multipleValues && val) {
          reactiveSearchParams[props.prefix + datasetFilterPrefix + filter.labelField + '_in'] = val
        } else delete reactiveSearchParams[props.prefix + datasetFilterPrefix + filter.labelField + '_in']
      }
    }),
    items,
    loading: ref(false),
    searchItems: async (search) => {
      const otherFilters = props.config.filters.filter(f => f.labelField !== filter.labelField && reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in'])
      const params = Object.assign({
        finalizedAt: props.config.datasets[0].finalizedAt,
        stringify: true
      }, ...otherFilters.map(f => ({ [`${f.labelField}_in`]: `${reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in']}` })))
      props.config.staticFilters?.forEach(filter => {
        if (filter.type === 'in') params[filter.field + '_in'] = filter.values.join(',')
        else if (filter.type === 'interval') {
          if (filter.minValue != null) params[filter.field + '_gte'] = filter.minValue
          if (filter.maxValue != null) params[filter.field + '_lte'] = filter.maxValue
        }
      })
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
      const values = await ofetch(props.config.datasets[0].href + '/values/' + filter.labelField, { params })
      const filterValue = reactiveSearchParams[props.prefix + datasetFilterPrefix + filter.labelField + '_in']
      if (filterValue && !values.includes(filterValue)) {
        values.unshift(filterValue)
      }
      items.value = values
    }
  }
})

const updateValue = (filter, value) => {
  if (!filter.forceOneValue || value) {
    updateFilters(filter.labelField)
  }
}

const updateFilters = async (noFieldUpdate) => {
  let filtersValues = {}
  const fieldsWithFilter = filters.filter(f => reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in'])
  if (fieldsWithFilter.length) {
    const filterFields = [].concat(...fieldsWithFilter.map(f => [].concat(f.values.length ? f.values : f.labelField))).filter((f, i, s) => s.indexOf(f) === i)
    const activeFilters = props.config.filters.filter(f => reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in'])
    const params = Object.assign({
      finalizedAt: props.config.datasets[0].finalizedAt
    }, ...activeFilters.map(f => ({ [`${f.labelField}_in`]: `${reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in']}` })))
    props.config.staticFilters?.forEach(filter => {
      if (filter.type === 'in') params[filter.field + '_in'] = filter.values.join(',')
      else if (filter.type === 'interval') {
        if (filter.minValue != null) params[filter.field + '_gte'] = filter.minValue
        if (filter.maxValue != null) params[filter.field + '_lte'] = filter.maxValue
      }
    })
    const res = await Promise.all(filterFields.map(f => ofetch(props.config.datasets[0].href + '/values/' + f, { params })))
    const values = Object.assign({}, ...filterFields.map((f, i) => ({ [f]: res[i] })))
    filtersValues = Object.assign({}, ...filterFields.map(f => {
      if (fields[f]['x-concept']) return { [`_c_${fields[f]['x-concept'].id}_in`]: JSON.stringify(values[f]).slice(1, -1) }
      else {
        if (values[f].length > 1) return { [`${datasetFilterPrefix}${f}_in`]: JSON.stringify(values[f]).slice(1, -1) }
        else return { [`${datasetFilterPrefix}${f}_eq`]: values[f][0] }
      }
    }))
    filtersValues.keys = fieldsWithFilter.map(f => f.labelField)
  }

  if (props.config.periodFilter) {
    filtersValues._c_date_match = reactiveSearchParams.period
  }
  if (props.config.addressFilter && address && reactiveSearchParams.radius) {
    filtersValues._c_geo_distance = address.lon + ',' + address.lat + ',' + reactiveSearchParams.radius * 1000
  }
  props.config.staticFilters?.forEach(filter => {
    if (filter.type === 'in') filtersValues[`${datasetFilterPrefix}${filter.field}_in`] = filter.values.join(',')
    else if (filter.type === 'nin') filtersValues[`${datasetFilterPrefix}${filter.field}_nin`] = filter.values.join(',')
    else if (filter.type === 'interval') {
      if (filter.minValue != null) filtersValues[`${datasetFilterPrefix}${filter.field}_gte`] = filter.minValue
      if (filter.maxValue != null) filtersValues[`${datasetFilterPrefix}${filter.field}_lte`] = filter.maxValue
    }
  })
  emit('update:model-value', filtersValues)
  filters.forEach(filter => {
    if (filter.labelField !== noFieldUpdate) filter.searchItems()
  })
}

await updateFilters()
</script>

<template>
  <v-row
    ref="root"
    justify="center"
    align="center"
    class="py-3"
  >
    <v-col
      v-for="(filter, i) in filters"
      :key="i"
      :cols="Math.min(Math.max(1,Math.ceil(12*250/width)),12)"
    >
      <v-autocomplete
        v-model="filter.value.value"
        :loading="filter.loading.value"
        :items="filter.items.value"
        :item-title="v => fields[filter.labelField]['x-labels'] ? fields[filter.labelField]['x-labels'][v] : v"
        :item-value="v => v"
        variant="outlined"
        hide-details
        no-data-text="Aucun élément trouvé"
        :label="fields[filter.labelField].label || fields[filter.labelField].title || fields[filter.labelField]['x-originalName'] || filter.labelField"
        :clearable="!filter.forceOneValue"
        :persistent-clear="!filter.forceOneValue"
        :multiple="filter.multipleValues"
        style="min-width:250px;"
        density="comfortable"
        @update:search="search => (search == null || search.length) && search !== reactiveSearchParams[props.prefix +datasetFilterPrefix + filter.labelField + '_in'] && !filter.showAllValues && filter.searchItems(search)"
        @update:model-value="updateValue(filter, $event)"
      />
    </v-col>
    <v-col
      v-if="config.periodFilter"
      :cols="Math.min(Math.max(1,Math.round(12*250/width)),12)"
    >
      <date-range-picker
        v-model="reactiveSearchParams.period"
        :min="config.datasets[0].timePeriod ? config.datasets[0].timePeriod.startDate.slice(0, 10) : undefined"
        :max="config.datasets[0].timePeriod ? config.datasets[0].timePeriod.endDate.slice(0, 10) : undefined"
        label="Période"
        @update:model-value="updateFilters()"
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
              @selected="address = $event; updateFilters()"
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
              @update:model-value="updateFilters()"
            />
          </v-col>
        </v-row>
      </v-card>
    </v-col>
  </v-row>
</template>
