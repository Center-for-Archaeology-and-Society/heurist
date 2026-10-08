<template>
  <div class="fieldinput">
    <label class="fieldinput__label" :for="inputId">
      {{ field.name || field.dty_Name || ('Field ' + field.dty) }}
      <span v-if="isRequired" class="fieldinput__required" aria-hidden="true">*</span>
    </label>

    <select
      v-if="isEnum"
      :id="inputId"
      class="input"
      :value="stringValue"
      :required="isRequired"
      @input="$emit('update:modelValue', $event.target.value)"
    >
      <option value="">—</option>
      <option v-for="term in terms" :key="term.id" :value="String(term.id)">{{ term.label }}</option>
    </select>

    <textarea
      v-else-if="field.type === 'blocktext' || field.type === 'text'"
      :id="inputId"
      class="input"
      rows="3"
      :value="stringValue"
      :required="isRequired"
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
      @input="$emit('update:modelValue', $event.target.value)"
    >

    <div v-else-if="field.type === 'resource'" class="fieldinput__note muted">
      Pointer field — record picker arrives with the edit-form wave
      <span v-if="pointerTitle"> (currently: {{ pointerTitle }})</span>
    </div>

    <div v-else-if="field.type === 'file' || field.type === 'media'" class="fieldinput__note muted">
      File upload not available on mobile yet
    </div>

    <div v-else-if="field.type === 'geo'" class="fieldinput__note muted">
      Geographic field — edit on the Map tab
    </div>

    <input
      v-else
      :id="inputId"
      class="input"
      type="text"
      :value="stringValue"
      :required="isRequired"
      @input="$emit('update:modelValue', $event.target.value)"
    >
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useDefinitions } from '../store/definitions.js'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: [String, Number, Object, Array], default: '' }
})

defineEmits(['update:modelValue'])

const definitions = useDefinitions()
const inputId = computed(() => 'field-' + props.field.dty)
const isRequired = computed(() => props.field.requirement === 'required')
const isEnum = computed(() => ['enum', 'relationtype'].includes(props.field.type))

const stringValue = computed(() => {
  const value = props.modelValue
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return value.text ?? value.label ?? value.title ?? value.value ?? ''
  }
  return String(value)
})

const pointerTitle = computed(() => {
  const value = props.modelValue
  if (value && typeof value === 'object') {
    return value.title ?? value.label ?? (value.id ? '#' + value.id : '')
  }
  return ''
})

const terms = computed(() => {
  const vocabulary = props.field.vocabulary || props.field.dty_JsonTermIDTree
  if (!vocabulary || !definitions.state.snapshot || !definitions.state.snapshot.terms) {
    return []
  }
  const ids = collectTermIds(vocabulary)
  return ids
    .map((id) => ({ id, label: definitions.termLabel(id) }))
    .filter((term) => term.label !== String(term.id) || definitions.state.snapshot.terms[String(term.id)])
})

function collectTermIds(vocabulary) {
  if (typeof vocabulary === 'number') {
    return [vocabulary]
  }
  try {
    const parsed = typeof vocabulary === 'string' ? JSON.parse(vocabulary) : vocabulary
    const out = []
    const walk = (node) => {
      if (typeof node === 'number') {
        out.push(node)
      } else if (Array.isArray(node)) {
        node.forEach(walk)
      } else if (node && typeof node === 'object') {
        Object.values(node).forEach(walk)
      }
    }
    walk(parsed)
    return out
  } catch {
    return []
  }
}
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
  font-size: var(--font-size-sm);
}
</style>
