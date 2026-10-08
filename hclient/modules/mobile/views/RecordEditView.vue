<template>
  <div class="page">
    <PageHeader :title="isNew ? 'New record' : 'Edit record'" back>
      <template #actions>
        <button class="pageheader__save" type="button" :disabled="!canSave || saving" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </template>
    </PageHeader>

    <div class="page-scroll">
      <LoadingSpinner v-if="loading" />
      <EmptyState
        v-else-if="error"
        icon="⚠"
        title="Could not load record"
        :message="error.message || String(error)"
      >
        <button class="btn btn--secondary" type="button" @click="load">Retry</button>
      </EmptyState>
      <template v-else-if="rectypeId">
        <p class="muted edit-meta">{{ rectypeName }} #{{ recordId || 'new' }}</p>
        <div class="card edit-form">
          <FieldInput
            v-for="field in editableFields"
            :key="field.dty"
            :field="field"
            v-model="model[field.dty]"
          />
          <p v-if="!editableFields.length" class="muted">
            This record type has no editable fields defined.
          </p>
        </div>
        <p class="muted edit-note">
          Validation, repeatable groups, pointer record-picker and file upload arrive with the write-path wave.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { getRecord, updateRecord, createRecord } from '../api/records.js'
import { useAuth } from '../store/auth.js'
import { useDefinitions } from '../store/definitions.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import FieldInput from '../components/FieldInput.vue'

const props = defineProps({
  id: { type: String, default: '' }
})

const EDITABLE_TYPES = ['freetext', 'blocktext', 'integer', 'float', 'date', 'enum', 'relationtype']

const auth = useAuth()
const definitions = useDefinitions()

const record = ref(null)
const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const model = reactive({})

const isNew = computed(() => !props.id)
const recordId = computed(() => (props.id ? Number(props.id) : null))
const rectypeId = computed(() => record.value?.rec_RecTypeID ?? null)
const rectypeName = computed(() => (rectypeId.value ? definitions.rectypeName(rectypeId.value) : ''))

const editableFields = computed(() => {
  if (!rectypeId.value) {
    return []
  }
  return definitions.fieldsFor(rectypeId.value)
    .filter((field) => EDITABLE_TYPES.includes(field.type))
})

const canSave = computed(() => Boolean(rectypeId.value) && editableFields.value.length > 0)

function seedModel() {
  const details = record.value && (record.value.details || {})
  for (const field of editableFields.value) {
    const values = details[String(field.dty)] ?? details[field.dty]
    const first = Array.isArray(values) ? values[0] : values
    model[field.dty] = first === null || first === undefined
      ? ''
      : (typeof first === 'object' ? (first.text ?? first.value ?? '') : first)
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    await definitions.load(auth.state.db)
    if (!isNew.value) {
      record.value = await getRecord(recordId.value, { detail: 'detail' })
      if (!record.value) {
        throw new Error('Record not found')
      }
    }
    seedModel()
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const payload = {
      rec_RecTypeID: rectypeId.value,
      details: Object.fromEntries(
        editableFields.value
          .filter((field) => model[field.dty] !== '' && model[field.dty] !== undefined)
          .map((field) => [field.dty, [model[field.dty]]])
      )
    }
    if (isNew.value) {
      await createRecord(payload)
    } else {
      await updateRecord(recordId.value, payload)
    }
    history.back()
  } catch (err) {
    showError(err.message || 'Save failed')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.edit-meta {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
}

.edit-form {
  padding: var(--space-3);
}

.edit-note {
  font-size: var(--font-size-sm);
  margin-top: var(--space-3);
}

.pageheader__save {
  min-height: var(--tap);
  padding: 0 var(--space-2);
  border: none;
  background: none;
  color: var(--color-on-primary);
  font-weight: 600;
  cursor: pointer;
}

.pageheader__save:disabled {
  opacity: 0.5;
}
</style>
