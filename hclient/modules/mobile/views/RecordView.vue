<template>
  <div class="page">
    <PageHeader :title="recordTitle" back>
      <template #actions>
        <button v-if="record" class="pageheader__action" type="button" aria-label="Show network" @click="showNetwork">⌗⌗</button>
        <button v-if="hasGeo" class="pageheader__action" type="button" aria-label="Locate on map" @click="locate">📍</button>
        <router-link
          v-if="record"
          class="pageheader__action"
          :to="{ name: 'record-edit', params: { id: String(recordId) } }"
          aria-label="Edit"
        >✎</router-link>
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
      <template v-else-if="record">
        <p class="rectype muted">{{ rectypeName }}</p>
        <section
          v-for="group in fieldGroups"
          :key="group.id"
          class="card fieldgroup"
        >
          <h2 class="fieldgroup__title">{{ group.name }}</h2>
          <dl
            v-for="field in group.fields"
            :key="field.dty"
            class="fieldrow"
          >
            <dt class="fieldrow__name muted">{{ field.name }}</dt>
            <dd class="fieldrow__value">
              <template v-if="field.type === 'resource'">
                <template v-if="pointerValues(field).length">
                  <router-link
                    v-for="pointer in pointerValues(field)"
                    :key="pointer.id"
                    :to="{ name: 'record', params: { id: String(pointer.id) } }"
                  >
                    {{ pointer.title || '#' + pointer.id }}
                  </router-link>
                </template>
                <span v-else class="muted">—</span>
              </template>
              <template v-else-if="field.type === 'geo'">
                <span v-if="geoValues(field).length">{{ geoSummary(field) }}</span>
                <span v-else class="muted">—</span>
              </template>
              <template v-else>
                <span v-if="textValues(field).length">{{ textValues(field).join('; ') }}</span>
                <span v-else class="muted">—</span>
              </template>
            </dd>
          </dl>
        </section>

        <div class="record-actions">
          <router-link class="btn btn--secondary" :to="{ name: 'record-edit', params: { id: String(recordId) } }">
            Edit
          </router-link>
          <button class="btn btn--secondary" type="button" @click="showNetwork">Show network</button>
          <button v-if="hasGeo" class="btn btn--secondary" type="button" @click="locate">Locate</button>
          <button class="btn btn--danger" type="button" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getRecord, deleteRecord } from '../api/records.js'
import { useDefinitions } from '../store/definitions.js'
import { useAuth } from '../store/auth.js'
import { useRecent } from '../store/recent.js'
import { showError } from '../components/ErrorToast.vue'
import { absoluteUrl } from '../api/client.js'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const props = defineProps({
  id: { type: String, required: true }
})

const route = useRoute()
const router = useRouter()
const definitions = useDefinitions()
const recent = useRecent()

const record = ref(null)
const loading = ref(false)
const deleting = ref(false)
const error = ref(null)

const recordId = computed(() => Number(props.id))
const recordTitle = computed(() => (record.value && (record.value.rec_Title || record.value.title)) || 'Record')
const rectypeId = computed(() => record.value && (record.value.rec_RecTypeID ?? record.value.rectype))
const rectypeName = computed(() => (rectypeId.value ? definitions.rectypeName(rectypeId.value) : ''))

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

const details = computed(() => detailsOf(record.value))

const fieldGroups = computed(() => {
  if (!rectypeId.value) {
    return []
  }
  const fields = definitions.fieldsFor(rectypeId.value)
  const present = fields.filter((field) => {
    const values = details.value[String(field.dty)] ?? details.value[field.dty]
    return values !== undefined && values !== null && (!Array.isArray(values) || values.length)
  })
  return [{
    id: 'all',
    name: rectypeName.value || 'Details',
    fields: present
  }]
})

const hasGeo = computed(() => fieldGroups.value.some((group) =>
  group.fields.some((field) => field.type === 'geo' && geoValues(field).length)
))

function rawValues(field) {
  const values = details.value[String(field.dty)] ?? details.value[field.dty]
  if (values === undefined || values === null) {
    return []
  }
  return (Array.isArray(values) ? values : [values]).filter((value) => value !== null && value !== '')
}

function textValues(field) {
  return rawValues(field).map((value) => {
    if (typeof value === 'object') {
      const text = value.text ?? value.label ?? value.title ?? value.value
      if (text !== undefined && text !== null) {
        return String(text)
      }
      if (value.URL || value.url) {
        return absoluteUrl(value.URL || value.url)
      }
      return ''
    }
    return String(value)
  }).filter(Boolean)
}

function pointerValues(field) {
  if (field.type !== 'resource') {
    return []
  }
  return rawValues(field).map((value) => {
    if (typeof value === 'object') {
      return { id: Number(value.id ?? value.recordID ?? value.ID ?? 0), title: value.title ?? value.label ?? '' }
    }
    return { id: Number(value), title: '' }
  }).filter((value) => value.id > 0)
}

function geoValues(field) {
  if (field.type !== 'geo') {
    return []
  }
  return rawValues(field).map((value) => {
    if (typeof value === 'object') {
      const geo = value.geo || value
      const lat = Number(value.lat ?? value.latitude ?? geo.lat ?? geo.latitude)
      const lon = Number(value.lon ?? value.lng ?? value.longitude ?? geo.lon ?? geo.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon }
      }
    }
    return null
  }).filter(Boolean)
}

function geoSummary(field) {
  return geoValues(field).map((point) => point.lat.toFixed(5) + ', ' + point.lon.toFixed(5)).join('; ')
}

async function load() {
  loading.value = true
  error.value = null
  record.value = null
  try {
    await definitions.load(useAuth().state.db)
    record.value = await getRecord(recordId.value, { detail: 'detail' })
    if (record.value) {
      recent.addRecord({
        id: recordId.value,
        title: record.value.rec_Title,
        rectypeId: record.value.rec_RecTypeID,
        thumbnailUrl: record.value.rec_ThumbnailURL
      })
    }
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
}

async function confirmDelete() {
  if (!window.confirm('Delete this record? This cannot be undone.')) {
    return
  }
  deleting.value = true
  try {
    await deleteRecord(recordId.value)
    router.replace({ name: 'search' })
  } catch (err) {
    showError(err.message || 'Delete failed')
  } finally {
    deleting.value = false
  }
}

function showNetwork() {
  router.push({ name: 'network', params: { id: String(recordId.value) } })
}

function locate() {
  router.push({ name: 'map', query: { record: String(recordId.value) } })
}

watch(() => props.id, load)

onMounted(load)
</script>

<style scoped>
.rectype {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.fieldgroup {
  padding: var(--space-3);
  margin-bottom: var(--space-3);
}

.fieldgroup__title {
  font-size: var(--font-size-base);
  color: var(--color-primary);
}

.fieldrow {
  display: flex;
  flex-direction: column;
  margin: 0 0 var(--space-2);
}

.fieldrow__name {
  font-size: var(--font-size-sm);
}

.fieldrow__value {
  margin: 0;
  overflow-wrap: anywhere;
}

.record-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.pageheader__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--tap);
  height: var(--tap);
  border: none;
  background: none;
  color: var(--color-on-primary);
  font-size: 1.2rem;
  text-decoration: none;
  cursor: pointer;
}
</style>
