<template>
  <div class="fieldinput">
    <label class="fieldinput__label" :for="isPointer ? undefined : inputId">
      {{ field.name || field.dty_Name || ('Field ' + field.dty) }}
      <span v-if="isRequired" class="fieldinput__required" aria-hidden="true">*</span>
    </label>

    <select
      v-if="isEnum && termOptions.length"
      :id="inputId"
      class="input"
      :value="stringValue"
      :aria-invalid="error ? 'true' : undefined"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option value="">—</option>
      <option v-for="term in termOptions" :key="term.id" :value="String(term.id)">{{ term.label }}</option>
    </select>

    <textarea
      v-else-if="field.type === 'blocktext'"
      :id="inputId"
      class="input"
      rows="4"
      :value="stringValue"
      :required="isRequired"
      :aria-invalid="error ? 'true' : undefined"
      @input="$emit('update:modelValue', $event.target.value)"
    ></textarea>

    <input
      v-else-if="field.type === 'integer' || field.type === 'float'"
      :id="inputId"
      class="input"
      type="number"
      :step="field.type === 'float' ? 'any' : '1'"
      :value="stringValue"
      :required="isRequired"
      :aria-invalid="error ? 'true' : undefined"
      @input="$emit('update:modelValue', $event.target.value)"
    >

    <input
      v-else-if="field.type === 'date'"
      :id="inputId"
      class="input"
      type="text"
      inputmode="numeric"
      placeholder="YYYY or YYYY-MM-DD"
      :value="stringValue"
      :required="isRequired"
      :aria-invalid="error ? 'true' : undefined"
      @input="$emit('update:modelValue', $event.target.value)"
    >

    <div v-else-if="isPointer" class="fieldinput__pointer">
      <div v-if="pointerValue && pointerValue.id" class="fieldinput__chip">
        <span class="fieldinput__chip-title">{{ pointerValue.title || '#' + pointerValue.id }}</span>
        <button class="fieldinput__chip-clear" type="button" aria-label="Clear selection" @click="$emit('update:modelValue', '')">✕</button>
      </div>
      <template v-else>
        <input
          :id="inputId"
          v-model="pointerQuery"
          class="input"
          type="search"
          :placeholder="'Search' + (targetName ? ' ' + targetName : '') + ' records…'"
          autocomplete="off"
        >
        <p v-if="pointerSearching" class="muted fieldinput__hint">Searching…</p>
        <p v-else-if="pointerError" class="muted fieldinput__hint">{{ pointerError }}</p>
        <button
          v-for="rec in pointerResults"
          :key="rec.rec_ID"
          class="fieldinput__option"
          type="button"
          @click="pickPointer(rec)"
        >
          {{ rec.rec_Title || '#' + rec.rec_ID }}
          <span class="muted">#{{ rec.rec_ID }}</span>
        </button>
        <p v-if="pointerQuery.length > 1 && !pointerSearching && !pointerResults.length" class="muted fieldinput__hint">
          No matching records
        </p>
      </template>
    </div>

    <div v-else-if="field.type === 'file' || field.type === 'media'" class="fieldinput__note muted">
      File upload is not available on mobile yet
      <span v-if="hasValue"> (existing value is kept on save)</span>
    </div>

    <div v-else-if="field.type === 'geo' || field.type === 'blockbbox'" class="fieldinput__note muted">
      Geographic field — edit on the Map tab
      <span v-if="hasValue"> (existing value is kept on save)</span>
    </div>

    <input
      v-else
      :id="inputId"
      class="input"
      type="text"
      :value="stringValue"
      :required="isRequired"
      :aria-invalid="error ? 'true' : undefined"
      @input="$emit('update:modelValue', $event.target.value)"
    >

    <p v-if="error" class="fieldinput__error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { searchRecords } from '../api/records.js'
import { useDefinitions } from '../store/definitions.js'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: [String, Number, Object], default: '' },
  error: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const definitions = useDefinitions()
const inputId = computed(() => 'field-' + props.field.dty)
const isRequired = computed(() => props.field.requirement === 'required')
const isEnum = computed(() => props.field.type === 'enum' || props.field.type === 'relationtype')
const isPointer = computed(() => props.field.type === 'resource')

const stringValue = computed(() => {
  const value = props.modelValue
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return String(value.id ?? '')
  }
  return String(value)
})

const hasValue = computed(() => {
  const value = props.modelValue
  if (typeof value === 'object' && value !== null) {
    return Boolean(value.id)
  }
  return value !== '' && value !== null && value !== undefined
})

const pointerValue = computed(() => {
  if (!isPointer.value || typeof props.modelValue !== 'object' || !props.modelValue) {
    return null
  }
  return props.modelValue
})

const targetName = computed(() => {
  const targets = props.field.targetTypes
  return targets && targets.length === 1 ? definitions.rectypeName(targets[0]) : ''
})

const termOptions = computed(() => {
  if (!isEnum.value) {
    return []
  }
  const snapshot = definitions.state.snapshot
  const root = props.field.vocabulary
  if (!snapshot || !snapshot.terms || !snapshot.termlinks || !root) {
    return []
  }
  const children = new Map()
  for (const link of snapshot.termlinks) {
    if (!children.has(link.parent)) {
      children.set(link.parent, [])
    }
    children.get(link.parent).push(link.term)
  }
  const out = []
  const seen = new Set()
  const walk = (id) => {
    for (const child of children.get(id) || []) {
      if (seen.has(child)) {
        continue
      }
      seen.add(child)
      out.push({ id: child, label: definitions.termLabel(child) })
      walk(child)
    }
  }
  walk(Number(root))
  return out.sort((a, b) => a.label.localeCompare(b.label))
})

const pointerQuery = ref('')
const pointerResults = ref([])
const pointerSearching = ref(false)
const pointerError = ref('')
let pointerTimer = 0
let pointerController = null

function escapeQueryValue(text) {
  return String(text).replace(/["*()\\]/g, ' ').trim()
}

async function searchPointer(text) {
  if (pointerController) {
    pointerController.abort()
  }
  pointerController = new AbortController()
  pointerSearching.value = true
  pointerError.value = ''
  try {
    const targets = props.field.targetTypes || []
    const title = 'title:"' + escapeQueryValue(text) + '"'
    const q = '*t:' + Number(targets[0]) + ' ' + title
    const result = await searchRecords({
      q: targets.length === 1 ? q : '*' + title,
      detail: 'header',
      limit: 20,
      signal: pointerController.signal
    })
    pointerResults.value = result.records
  } catch (err) {
    if (err.name !== 'AbortError') {
      pointerError.value = 'Search failed'
      pointerResults.value = []
    }
  } finally {
    pointerSearching.value = false
  }
}

function pickPointer(record) {
  pointerQuery.value = ''
  pointerResults.value = []
  pointerError.value = ''
  emit('update:modelValue', { id: Number(record.rec_ID), title: record.rec_Title || '' })
}
watch(pointerQuery, (text) => {
  clearTimeout(pointerTimer)
  if (!text || text.trim().length < 2) {
    pointerResults.value = []
    pointerSearching.value = false
    pointerError.value = ''
    return
  }
  pointerTimer = setTimeout(() => searchPointer(text.trim()), 400)
})

onBeforeUnmount(() => {
  clearTimeout(pointerTimer)
  if (pointerController) {
    pointerController.abort()
  }
})
</script>

<style scoped>
.fieldinput {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.fieldinput__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-muted);
}

.fieldinput__required {
  color: var(--color-danger);
}

.fieldinput__note {
  min-height: var(--tap);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  font-size: var(--font-size-sm);
}

.fieldinput__error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-danger);
}

.fieldinput__hint {
  margin: 0;
  font-size: var(--font-size-sm);
}

.fieldinput__pointer {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.fieldinput__chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: var(--tap);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
}

.fieldinput__chip-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fieldinput__chip-clear {
  min-width: var(--tap);
  min-height: var(--tap);
  margin-right: calc(-1 * var(--space-3));
  border: none;
  background: none;
  color: var(--color-muted);
  font-size: 1rem;
  cursor: pointer;
}

.fieldinput__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--tap);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
</style>
