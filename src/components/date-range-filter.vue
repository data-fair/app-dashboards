<script setup lang="ts">
/**
 * Period filter backed by a Vuetify 4 `v-date-picker` in range mode.
 *
 * The model is the serialized `YYYY-MM-DD,YYYY-MM-DD` string used by the
 * dashboard (`reactiveSearchParams.period` → `_c_date_match`). Only complete
 * ranges are written back; the clear button removes the value. The picker
 * keeps an in-progress start selection locally until the end is chosen, so
 * a single click never wipes the period.
 */
import { computed, ref, watch } from 'vue'
import { dateToIso, isoToDate, parsePeriod } from '@/utils/period'

defineProps<{
  label?: string
  min?: string
  max?: string
}>()

const model = defineModel<string | undefined>()

const menu = ref(false)

// v-date-picker range model: a Date[] ([start, end]).
const range = ref<Date[]>([])

watch(model, (val) => {
  const { start, end } = parsePeriod(val)
  const startDate = start ? isoToDate(start) : undefined
  const endDate = end ? isoToDate(end) : undefined
  range.value = startDate && endDate ? [startDate, endDate] : []
}, { immediate: true })

const onRangeChange = (val: Date[] | null | undefined) => {
  const dates = (val || []).filter(Boolean) as Date[]
  if (dates.length === 2) {
    const start = dateToIso(dates[0])
    const end = dateToIso(dates[1])
    model.value = start <= end ? `${start},${end}` : `${end},${start}`
  }
  // A single selected date is an in-progress range: keep the picker state
  // until the end date is chosen, without touching the URL.
}

const clear = () => {
  model.value = undefined
  range.value = []
}

const displayText = computed(() => {
  const { start, end } = parsePeriod(model.value)
  if (!start || !end) return ''
  return start === end ? start : `${start} ~ ${end}`
})
</script>

<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    offset-y
    min-width="auto"
  >
    <template #activator="{ props: menuProps }">
      <v-text-field
        v-bind="menuProps"
        :model-value="displayText"
        :label="label"
        variant="outlined"
        density="comfortable"
        readonly
        hide-details
        :clearable="!!model"
        prepend-inner-icon="mdi-calendar"
        style="min-width:250px;"
        autocomplete="off"
        @click:clear="clear"
      />
    </template>
    <v-sheet class="pa-2">
      <v-date-picker
        v-model="range"
        multiple="range"
        :min="min"
        :max="max"
        hide-header
        show-adjacent-months
        @update:model-value="onRangeChange"
      />
    </v-sheet>
  </v-menu>
</template>
