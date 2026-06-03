<script setup lang="ts">
import { computed, ref, watch, effectScope, type Ref } from 'vue'
import { ofetch } from 'ofetch'
import { useAsyncAction } from '@data-fair/lib-vue/async-action.js'
import { useFetch } from '@data-fair/lib-vue/fetch.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import SearchAddress from '@data-fair/lib-vuetify/search-address.vue'
import DateRangePicker from '@data-fair/lib-vuetify/date-range-picker.vue'
import { useElementSize } from '@vueuse/core'
import { useConfig } from '@/composables/config'

const props = defineProps<{
  prefix?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const root = ref<HTMLElement | null>(null)
const { width } = useElementSize(root)
const { config, filters, dataset, fields } = useConfig()

let address: { lon: number; lat: number } | undefined

interface FilterState {
  items: Ref<string[]>
  loading: Ref<boolean>
  value: Ref<string | string[] | undefined>
  searchItems: (search?: string) => void
}

const filtersState = ref<Record<string, FilterState>>({})
const filtersScope = effectScope()

watch(filters, (newFilters) => {
  filtersScope.stop()
  filtersScope.run(() => {
    const state: Record<string, FilterState> = {}
    const datasetFilterPrefix = '_d_' + (dataset.value?.id || '') + '_'

    for (const filter of (newFilters || [])) {
      const searchQuery = ref<string | undefined>(undefined)

      const url = computed(() => {
        if (!dataset.value) return null
        const otherFilters = (config.value.filters || [])
          .filter((f: any) => f.labelField !== filter.labelField && reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in'])
        const params: Record<string, string> = {
          finalizedAt: dataset.value.finalizedAt || '',
          stringify: 'true'
        }
        otherFilters.forEach((f: any) => {
          params[`${f.labelField}_in`] = `${reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in']}`
        })
        config.value.staticFilters?.forEach((sf: any) => {
          if (sf.type === 'in') params[sf.field + '_in'] = sf.values.join(',')
          else if (sf.type === 'interval') {
            if (sf.minValue != null) params[sf.field + '_gte'] = sf.minValue
            if (sf.maxValue != null) params[sf.field + '_lte'] = sf.maxValue
          }
        })
        if (!filter.showAllValues) {
          if (searchQuery.value != null) params.q = searchQuery.value + '*'
        } else {
          params.size = '1000'
        }
        if (config.value.periodFilter) {
          params._c_date_match = reactiveSearchParams.period || ''
        }
        if (config.value.addressFilter && address && reactiveSearchParams.radius) {
          params._c_geo_distance = address.lon + ',' + address.lat + ',' + Number(reactiveSearchParams.radius) * 1000
        }
        return `${dataset.value.href}/values/${filter.labelField}?${new URLSearchParams(params)}`
      })

      const { data, loading, refresh } = useFetch(() => url.value, { immediate: false })

      const filterValue = computed({
        get () {
          const key = props.prefix + datasetFilterPrefix + filter.labelField + '_in'
          if (reactiveSearchParams[key]) {
            return filter.multipleValues
              ? JSON.parse(`[${reactiveSearchParams[key]}]`)
              : reactiveSearchParams[key]
          }
          return filter.multipleValues ? [] : undefined
        },
        set (val: string | string[] | undefined) {
          const key = props.prefix + datasetFilterPrefix + filter.labelField + '_in'
          if (filter.multipleValues && Array.isArray(val) && val.length) {
            reactiveSearchParams[key] = JSON.stringify(val).slice(1, -1)
          } else if (!filter.multipleValues && val) {
            reactiveSearchParams[key] = val as string
          } else {
            delete reactiveSearchParams[key]
          }
        }
      })

      state[filter.labelField] = {
        items: computed(() => {
          const values = (data.value || []) as string[]
          const key = props.prefix + datasetFilterPrefix + filter.labelField + '_in'
          const filterValue = reactiveSearchParams[key]
          if (filterValue) {
            const fValues = filter.multipleValues ? JSON.parse(`[${filterValue}]`) : [filterValue]
            fValues.filter((v: string) => !values.includes(v)).forEach((v: string) => values.unshift(v))
          }
          return values.sort((a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
        }),
        loading,
        value: filterValue,
        searchItems: (search?: string) => {
          searchQuery.value = search
          refresh()
        }
      }
    }
    filtersState.value = state
  })

  // Trigger initial load for all filters
  updateFiltersExecute()
}, { immediate: true })

const updateValue = (filter: any, value: string | string[] | undefined) => {
  if (!filter.forceOneValue || value) {
    updateFiltersExecute(filter.labelField)
  }
}

const { execute: updateFiltersExecute } = useAsyncAction(async (noFieldUpdate?: string) => {
  const datasetFilterPrefix = '_d_' + (dataset.value?.id || '') + '_'
  const filtersValues: Record<string, any> = {}
  const fieldsWithFilter = (filters.value || [])
    .filter((f: any) => reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in'])

  if (fieldsWithFilter?.length) {
    const filterFields = ([] as string[]).concat(
      ...fieldsWithFilter.map((f: any) => f.values?.length ? f.values : f.labelField)
    ).filter((f, i, s) => s.indexOf(f) === i)

    const activeFilters = (config.value.filters || [])
      .filter((f: any) => reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in'])

    const params: Record<string, string> = {
      finalizedAt: dataset.value?.finalizedAt || ''
    }
    activeFilters.forEach((f: any) => {
      params[`${f.labelField}_in`] = `${reactiveSearchParams[props.prefix + datasetFilterPrefix + f.labelField + '_in']}`
    })
    config.value.staticFilters?.forEach((sf: any) => {
      if (sf.type === 'in') params[sf.field + '_in'] = sf.values.join(',')
      else if (sf.type === 'interval') {
        if (sf.minValue != null) params[sf.field + '_gte'] = sf.minValue
        if (sf.maxValue != null) params[sf.field + '_lte'] = sf.maxValue
      }
    })

    const res = await Promise.all(filterFields.map((f: string) => {
      const filter = fieldsWithFilter.find((fwf: any) => fwf.labelField === f || fwf.values?.includes(f))
      if (filter?.values?.length) {
        return ofetch(dataset.value!.href + '/values/' + f, { params })
      } else {
        const fv = reactiveSearchParams[props.prefix + datasetFilterPrefix + f + '_in']
        return filter?.multipleValues ? JSON.parse(`[${fv}]`) : [fv]
      }
    }))

    const values: Record<string, string[]> = {}
    filterFields.forEach((f: string, i: number) => { values[f] = res[i] })

    filterFields.forEach((f: string) => {
      if (fields.value[f]?.['x-concept']) {
        filtersValues[`_c_${fields.value[f]['x-concept'].id}_in`] = JSON.stringify(values[f]).slice(1, -1)
      } else {
        filtersValues[`${datasetFilterPrefix}${f}_in`] = JSON.stringify(values[f]).slice(1, -1)
      }
    })
    filtersValues.keys = fieldsWithFilter.map((f: any) => f.labelField)
  }

  if (config.value.periodFilter) {
    filtersValues._c_date_match = reactiveSearchParams.period
  }
  if (config.value.addressFilter && address && reactiveSearchParams.radius) {
    filtersValues._c_geo_distance = address.lon + ',' + address.lat + ',' + Number(reactiveSearchParams.radius) * 1000
  }
  config.value.staticFilters?.forEach((sf: any) => {
    if (sf.type === 'in') filtersValues[`${datasetFilterPrefix}${sf.field}_in`] = sf.values.join(',')
    else if (sf.type === 'nin') filtersValues[`${datasetFilterPrefix}${sf.field}_nin`] = sf.values.join(',')
    else if (sf.type === 'interval') {
      if (sf.minValue != null) filtersValues[`${datasetFilterPrefix}${sf.field}_gte`] = sf.minValue
      if (sf.maxValue != null) filtersValues[`${datasetFilterPrefix}${sf.field}_lte`] = sf.maxValue
    }
  })

  emit('update:modelValue', filtersValues)

  filters.value?.forEach((filter: any) => {
    if (filter.labelField !== noFieldUpdate && filtersState.value[filter.labelField]) {
      filtersState.value[filter.labelField].searchItems()
    }
  })
}, { catch: 'error' })
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
      :cols="Math.min(Math.max(1, Math.ceil(12 * 250 / (width || 1))), 12)"
    >
      <v-autocomplete
        v-if="filtersState[filter.labelField]"
        v-model="filtersState[filter.labelField].value.value"
        :loading="filtersState[filter.labelField].loading.value"
        :items="filtersState[filter.labelField].items.value"
        :item-title="(v: string) => fields[filter.labelField]?.['x-labels']?.[v] ?? v"
        :item-value="(v: string) => v"
        variant="outlined"
        hide-details
        no-data-text="Aucun élément trouvé"
        :label="fields[filter.labelField]?.label || fields[filter.labelField]?.title || fields[filter.labelField]?.['x-originalName'] || filter.labelField"
        :clearable="!filter.forceOneValue"
        :persistent-clear="!filter.forceOneValue"
        :multiple="filter.multipleValues"
        style="min-width:250px;"
        density="comfortable"
        autocomplete="off"
        @update:search="search => (search == null || search.length) && search !== reactiveSearchParams[props.prefix + '_d_' + (dataset?.id || '') + '_' + filter.labelField + '_in'] && !filter.showAllValues && filtersState[filter.labelField].searchItems(search)"
        @update:model-value="updateValue(filter, $event)"
      />
    </v-col>
    <v-col
      v-if="config.periodFilter"
      :cols="Math.min(Math.max(1, Math.round(12 * 250 / (width || 1))), 12)"
    >
      <date-range-picker
        v-model="reactiveSearchParams.period"
        :min="(dataset as any)?.timePeriod?.startDate?.slice(0, 10)"
        :max="(dataset as any)?.timePeriod?.endDate?.slice(0, 10)"
        label="Période"
        @update:model-value="updateFiltersExecute()"
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
        <v-row align="start">
          <v-col
            class="pr-0"
            :cols="8"
          >
            <search-address
              v-model="reactiveSearchParams.address"
              variant="plain"
              @selected="address = $event; updateFiltersExecute()"
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
              @update:model-value="updateFiltersExecute()"
            />
          </v-col>
        </v-row>
      </v-card>
    </v-col>
  </v-row>
</template>
