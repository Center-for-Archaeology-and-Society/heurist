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
        icon="alert"
        title="Could not load record"
        :message="error.message || String(error)"
      >
        <button class="btn btn--secondary" type="button" @click="load"><AppIcon name="refresh" /> Retry</button>
      </EmptyState>
      <template v-else>
        <template v-if="isNew">
          <label class="edit-label" for="rectype-select">Record type</label>
          <select id="rectype-select" v-model.number="chosenRectypeId" class="input edit-rectype">
            <option v-for="rt in rectypeOptions" :key="rt.id" :value="rt.id">{{ rt.name }}</option>
          </select>
        </template>
        <p v-else class="muted edit-meta">{{ rectypeName }} #{{ recordId }}</p>

        <div v-if="rectypeId" class="card edit-form">
          <FieldInput
            v-for="field in editableFields"
            :key="field.dty"
            :field="field"
            v-model="model[field.dty]"
            :error="fieldErrors[field.dty] || ''"
          />
          <p v-if="!editableFields.length" class="muted">
            This record type has no editable fields defined.
          </p>
          <p class="muted edit-note">
            Repeatable fields edit the first value only; file, media and geographic fields are kept unchanged on save.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getRecord, updateRecord, createRecord } from '../api/records.js'
import { useAuth } from '../store/auth.js'
import { useDefinitions } from '../store/definitions.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import FieldInput from '../components/FieldInput.vue'

const SCAN_PREFILL_KEY = 'heurist-mobile-scan-prefill'

const EDITABLE_TYPES = ['freetext', 'blocktext', 'integer', 'float', 'date', 'enum', 'relationtype', 'resource']
const PASSTHROUGH_TYPES = ['file', 'media', 'geo', 'blockbbox', 'year', 'boolean', 'urlinclude', 'milestone']
// detail types the mobile form can neither edit nor round-trip; saving would
// drop their values because the server replaces all details on update
const DROPPED_TYPES = ['relmarker', 'blockmarker']

const props = defineProps({
  id: { type: String, default: '' }
})

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const definitions = useDefinitions()

const record = ref(null)
const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const model = reactive({})
const extras = reactive({})
const chosenRectypeId = ref(0)
const saveAttempted = ref(false)
const prefill = ref(null)

const isNew = computed(() => !props.id || Number(props.id) === 0)
const recordId = computed(() => (props.id ? Number(props.id) : null))
const rectypeId = computed(() => {
  if (isNew.value) {
    return chosenRectypeId.value > 0 ? chosenRectypeId.value : null
  }
  return record.value ? Number(record.value.rec_RecTypeID ?? record.value.rectype) || null : null
})
const rectypeName = computed(() => (rectypeId.value ? definitions.rectypeName(rectypeId.value) : ''))

const rectypeOptions = computed(() => {
  const snapshot = definitions.state.snapshot
  if (!snapshot || !snapshot.rectypes) {
    return []
  }
  return Object.entries(snapshot.rectypes)
    .map(([id, rt]) => ({ id: Number(id), name: rt.name || rt.plural || id, showInLists: rt.showInLists !== false }))
    .sort((a, b) => (b.showInLists - a.showInLists) || a.name.localeCompare(b.name))
})

const allFields = computed(() => (rectypeId.value ? definitions.fieldsFor(rectypeId.value) : []))
const editableFields = computed(() => allFields.value.filter((field) => EDITABLE_TYPES.includes(field.type)))

// non-editable detail values present on the loaded record whose type the form
// cannot round-trip (relmarker/blockmarker); saving would silently drop them
const droppedDetails = computed(() => {
  if (isNew.value || !record.value) {
    return []
  }
  const typeByDty = new Map(allFields.value.map((field) => [Number(field.dty), field.type]))
  return Object.entries(detailsOf(record.value))
    .filter(([dty, values]) => {
      const type = typeByDty.get(Number(String(dty).replace(/^dty_/, '')))
      const hasValues = Array.isArray(values) ? values.length > 0 : (values !== null && values !== undefined && values !== '')
      return type && DROPPED_TYPES.includes(type) && hasValues
    })
    .map(([dty]) => {
      const field = allFields.value.find((f) => Number(f.dty) === Number(String(dty).replace(/^dty_/, '')))
      return field ? field.name : dty
    })
})

const fieldErrors = computed(() => {
  const out = {}
  for (const field of editableFields.value) {
    const value = model[field.dty]
    const empty = value === '' || value === null || value === undefined ||
      (field.type === 'resource' && !(typeof value === 'object' && value && Number(value.id) > 0))
    if (empty) {
      if (saveAttempted.value && field.requirement === 'required') {
        out[field.dty] = 'This field is required'
      }
    } else if (field.type === 'integer' && !/^\s*-?\d+\s*$/.test(String(value))) {
      out[field.dty] = 'Must be a whole number'
    } else if (field.type === 'float' && !/^\s*-?(?:\d+\.?|\d*\.\d+(?:[eE]-?\d+)?)\s*$/.test(String(value))) {
      out[field.dty] = 'Must be a number'
    } else if (field.type === 'date' && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(value).trim())) {
      out[field.dty] = 'Use YYYY or YYYY-MM-DD'
    } else if (field.type === 'resource' && !(typeof value === 'object' && Number(value.id) > 0)) {
      out[field.dty] = 'Pick a record'
    }
  }
  return out
})

const canSave = computed(() => Boolean(rectypeId.value) && editableFields.value.length > 0)

function toModelValue(field, raw) {
  if (raw === null || raw === undefined || raw === '') {
    return ''
  }
  if (field.type === 'resource') {
    if (typeof raw === 'object') {
      return { id: Number(raw.id ?? raw.recordID ?? raw.rec_ID ?? 0), title: raw.title || raw.label || '' }
    }
    return { id: Number(raw), title: '' }
  }
  if (typeof raw === 'object') {
    return String(raw.text ?? raw.value ?? '')
  }
  return String(raw)
}

function seedModel() {
  for (const key of Object.keys(model)) {
    delete model[key]
  }
  for (const key of Object.keys(extras)) {
    delete extras[key]
  }
  const details = isNew.value
    ? (prefill.value && Number(prefill.value.rec_RecTypeID) === Number(rectypeId.value)
        ? (prefill.value.details || {})
        : {})
    : detailsOf(record.value)
  for (const field of allFields.value) {
    const raw = details[String(field.dty)] ?? details[field.dty]
    const values = Array.isArray(raw)
      ? raw.filter((value) => value !== null && value !== undefined && value !== '')
      : (raw !== null && raw !== undefined && raw !== '' ? [raw] : [])
    if (!values.length) {
      continue
    }
    if (EDITABLE_TYPES.includes(field.type)) {
      model[field.dty] = toModelValue(field, values[0])
      if (values.length > 1) {
        extras[field.dty] = values.slice(1)
      }
    } else {
      extras[field.dty] = values
    }
  }
  applyScanPrefill()
}

// ScanView stages a label/value prefill ({fields:[[label,value]], coordinates,
// title}) without knowing the target rectype; map labels to fields of the
// rectype chosen by the user once it is known.
function applyScanPrefill() {
  const scan = prefill.value
  if (!isNew.value || !scan || !Array.isArray(scan.fields)) {
    return
  }
  const used = new Set()
  for (const entry of scan.fields) {
    const label = String(entry[0] ?? '').trim().toLowerCase()
    const value = entry[1]
    if (!label || value === null || value === undefined || value === '') {
      continue
    }
    const field = allFields.value.find((f) => f.name
      && f.name.toLowerCase() === label
      && !used.has(f.dty)
      && EDITABLE_TYPES.includes(f.type)
      && (model[f.dty] === undefined || model[f.dty] === null || model[f.dty] === ''))
    if (field) {
      model[field.dty] = toModelValue(field, value)
      used.add(field.dty)
    }
  }
  const coords = Array.isArray(scan.coordinates) ? scan.coordinates.map(Number) : []
  if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
    const geoField = allFields.value.find((f) => f.type === 'geo')
    if (geoField && (!extras[geoField.dty] || !extras[geoField.dty].length)) {
      extras[geoField.dty] = [{ geo: { type: 'point', wkt: `POINT(${coords[0]} ${coords[1]})` } }]
    }
  }
}

function toDetailValue(field, raw) {
  if (raw === null || raw === undefined || raw === '') {
    return null
  }
  if (field.type === 'resource') {
    const id = typeof raw === 'object' ? Number(raw.id ?? 0) : Number(raw)
    return id > 0 ? id : null
  }
  if (field.type === 'integer' || field.type === 'float') {
    const num = Number(String(raw).trim())
    return Number.isFinite(num) ? num : null
  }
  if (typeof raw === 'object') {
    return null
  }
  return String(raw)
}

function passthroughValue(fieldType, raw) {
  if (raw === null || raw === undefined || raw === '') {
    return null
  }
  if (fieldType === 'geo') {
    if (typeof raw === 'object' && raw.geo && typeof raw.geo.wkt === 'string') {
      return raw.geo.wkt
    }
    return typeof raw === 'string' ? raw : null
  }
  if (fieldType === 'file' || fieldType === 'media') {
    const fileId = typeof raw === 'object'
      ? Number((raw.file && raw.file.ulf_ID) ?? raw.ulf_ID ?? NaN)
      : Number(raw)
    return Number.isFinite(fileId) && fileId > 0 ? fileId : null
  }
  if (fieldType === 'resource') {
    return toDetailValue({ type: 'resource' }, raw)
  }
  return typeof raw === 'object' ? null : raw
}

function buildPayload() {
  const details = {}
  const push = (dty, value) => {
    if (value === null || value === undefined) {
      return
    }
    if (!details[dty]) {
      details[dty] = []
    }
    details[dty].push(value)
  }
  for (const field of editableFields.value) {
    push(field.dty, toDetailValue(field, model[field.dty]))
    for (const extra of extras[field.dty] || []) {
      push(field.dty, toDetailValue(field, extra))
    }
  }
  for (const field of allFields.value) {
    if (EDITABLE_TYPES.includes(field.type)) {
      continue
    }
    for (const extra of extras[field.dty] || []) {
      const value = passthroughValue(field.type, extra)
      if (value !== null) {
        push(field.dty, value)
      }
    }
  }
  const payload = { rec_RecTypeID: rectypeId.value, details }
  if (isNew.value && prefill.value && prefill.value.title) {
    payload.Title = String(prefill.value.title)
  }
  return payload
}

function detailsOf(rec) {
  if (!rec) {
    return {}
  }
  if (rec.details && typeof rec.details === 'object') {
    return rec.details
  }
  const out = {}
  for (const [key, value] of Object.entries(rec)) {
    if (/^dty_\d+$/.test(key) || /^\d+$/.test(key)) {
      out[key.replace(/^dty_/, '')] = value
    }
  }
  return out
}

async function load() {
  loading.value = true
  error.value = null
  saveAttempted.value = false
  try {
    await definitions.load(auth.state.db)
    if (isNew.value) {
      readPrefill()
      if (!(chosenRectypeId.value > 0)) {
        chosenRectypeId.value = Number(route.query.rty) || (rectypeOptions.value[0] ? rectypeOptions.value[0].id : 0)
      }
      record.value = null
    } else {
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

function readPrefill() {
  prefill.value = null
  try {
    const raw = sessionStorage.getItem(SCAN_PREFILL_KEY)
    if (raw) {
      sessionStorage.removeItem(SCAN_PREFILL_KEY)
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object'
        && ((parsed.details && typeof parsed.details === 'object') || Array.isArray(parsed.fields))) {
        prefill.value = parsed
        if (Number(parsed.rec_RecTypeID) > 0) {
          chosenRectypeId.value = Number(parsed.rec_RecTypeID)
        }
      }
    }
  } catch {
    prefill.value = null
  }
}

async function save() {
  saveAttempted.value = true
  if (Object.keys(fieldErrors.value).length) {
    showError('Please fix the highlighted fields')
    return
  }
  if (droppedDetails.value.length) {
    showError('This record has ' + droppedDetails.value.join(', ')
      + ' content that cannot be edited here — saving would delete it. Open the record in the desktop interface.')
    return
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (isNew.value) {
      const data = await createRecord(payload)
      const newId = Number(Array.isArray(data && data.data) ? data.data[0] : data && data.data)
      if (!(newId > 0)) {
        throw new Error('Record created but no id was returned')
      }
      router.replace({ name: 'record', params: { id: String(newId) } })
    } else {
      await updateRecord(recordId.value, payload)
      router.replace({ name: 'record', params: { id: String(recordId.value) } })
    }
  } catch (err) {
    showError(err.message || 'Save failed')
  } finally {
    saving.value = false
  }
}

watch(chosenRectypeId, () => {
  if (isNew.value) {
    seedModel()
  }
})

watch(() => props.id, load)

onMounted(load)
</script>

<style scoped>
.edit-meta {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
}

.edit-label {
  display: block;
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-muted);
}

.edit-rectype {
  margin-bottom: var(--space-3);
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
