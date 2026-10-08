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
      <EmptyState
        v-else-if="!record"
        icon="∅"
        title="Record not found"
        message="It may have been deleted, or you may not have access to it."
      >
        <router-link class="btn btn--secondary" :to="{ name: 'search' }">Back to search</router-link>
      </EmptyState>
      <template v-else>
        <p class="rectype muted">{{ rectypeName }} · #{{ recordId }}</p>
        <h1 class="record-title">{{ record.title || 'Untitled record' }}</h1>

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
                <template v-if="pointersFor(field).length">
                  <router-link
                    v-for="pointer in pointersFor(field)"
                    :key="pointer.id"
                    class="fieldrow__link"
                    :to="{ name: 'record', params: { id: String(pointer.id) } }"
                  >
                    {{ pointer.title || '#' + pointer.id }}
                  </router-link>
                </template>
                <span v-else class="muted">—</span>
              </template>
              <template v-else-if="field.type === 'file'">
                <template v-if="filesFor(field).length">
                  <div v-for="(file, index) in filesFor(field)" :key="index" class="fileitem">
                    <a
                      v-if="file.image && file.thumb"
                      :href="file.url"
                      target="_blank"
                      rel="noopener"
                      class="fileitem__imagelink"
                    >
                      <img class="fileitem__image" :src="file.thumb" :alt="file.name" loading="lazy">
                    </a>
                    <a
                      class="fieldrow__link fileitem__name"
                      :href="file.url"
                      target="_blank"
                      rel="noopener"
                    >{{ file.name || 'Open file' }}</a>
                  </div>
                </template>
                <span v-else class="muted">—</span>
              </template>
              <template v-else-if="field.type === 'geo'">
                <span v-if="geoFor(field).length">{{ geoSummary(field) }}</span>
                <span v-else class="muted">—</span>
              </template>
              <template v-else>
                <template v-if="textsFor(field).length">
                  <p
                    v-for="(text, index) in textsFor(field)"
                    :key="index"
                    class="fieldrow__text"
                  >
                    <a
                      v-if="isUrlText(text)"
                      class="fieldrow__link"
                      :href="text"
                      target="_blank"
                      rel="noopener"
                    >{{ text }}</a>
                    <template v-else>{{ text }}</template>
                  </p>
                </template>
                <span v-else class="muted">—</span>
              </template>
            </dd>
          </dl>
        </section>

        <p v-if="!fieldGroups.length" class="muted">
          No field structure is available for this record type.
        </p>

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
import { useRouter } from 'vue-router'
import { apiRequest } from '../api/client.js'
import { deleteRecord } from '../api/records.js'
import { useDefinitions } from '../store/definitions.js'
import { useAuth } from '../store/auth.js'
import { useRecent } from '../store/recent.js'
import { showToast, showError } from '../components/ErrorToast.vue'
import {
  normalizeRecord,
  pointerValues,
  geoPoints,
  fieldText,
  isUrlText,
  fileValue
} from '../components/recordData.js'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const props = defineProps({
  id: { type: String, required: true }
})

const router = useRouter()
const definitions = useDefinitions()
const auth = useAuth()
const recent = useRecent()

const record = ref(null)
const loading = ref(false)
const deleting = ref(false)
const error = ref(null)

const recordId = computed(() => Number(props.id))
const recordTitle = computed(() => (record.value && record.value.title) || 'Record')
const rectypeId = computed(() => (record.value ? record.value.rectypeId : null))
const rectypeName = computed(() => (rectypeId.value ? definitions.rectypeName(rectypeId.value) : ''))

function detailValues(field) {
  if (!record.value) {
    return []
  }
  return record.value.details[String(field.dty)] || []
}

function fieldGroupsFor() {
  const snapshot = definitions.state.snapshot
  const fieldGroups = (snapshot && snapshot.fieldGroups) || {}
  const fields = rectypeId.value ? definitions.fieldsFor(rectypeId.value) : []
  const present = fields.filter((field) => detailValues(field).length)
  const groups = new Map()
  for (const field of present) {
    const gid = field.group || 0
    if (!groups.has(gid)) {
      const definition = fieldGroups[String(gid)]
      groups.set(gid, {
        id: gid,
        name: definition ? definition.name : 'Details',
        order: definition && definition.order !== undefined ? definition.order : gid,
        fields: []
      })
    }
    groups.get(gid).fields.push(field)
  }
  return Array.from(groups.values()).sort((a, b) => a.order - b.order)
}

const fieldGroups = computed(fieldGroupsFor)

const hasGeo = computed(() => fieldGroups.value.some((group) =>
  group.fields.some((field) => field.type === 'geo' && geoFor(field).length)
))

function pointersFor(field) {
  return pointerValues(field, detailValues(field))
}

function filesFor(field) {
  if (field.type !== 'file') {
    return []
  }
  return detailValues(field)
    .map((value) => fileValue(auth.state.db, value && typeof value === 'object' ? value : {}))
    .filter(Boolean)
}

function geoFor(field) {
  if (field.type !== 'geo') {
    return []
  }
  return geoPoints(detailValues(field))
}

function geoSummary(field) {
  return geoFor(field)
    .map((point) => point.lat.toFixed(5) + ', ' + point.lon.toFixed(5))
    .join('; ')
}

function textsFor(field) {
  return detailValues(field)
    .map((value) => fieldText(field, value, definitions.termLabel))
    .filter((text) => text !== '')
}

async function load() {
  loading.value = true
  error.value = null
  record.value = null
  try {
    await definitions.load(auth.state.db)
    const data = await apiRequest('records/' + encodeURIComponent(recordId.value), {
      query: { detail: 'detail' }
    })
    const payload = data && data.data && typeof data.data === 'object' ? data.data : data
    const rows = payload && Array.isArray(payload.records)
      ? payload.records
      : (payload && payload.rec_ID !== undefined ? [payload] : [])
    record.value = normalizeRecord(rows[0], auth.state.db)
    if (record.value) {
      recent.addRecord({
        id: record.value.id,
        title: record.value.title,
        rectypeId: record.value.rectypeId,
        thumbnailUrl: record.value.thumbnailUrl
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
    showToast('Record deleted', { kind: 'success' })
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
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.record-title {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-xl);
  overflow-wrap: anywhere;
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
  margin: 0 0 var(--space-3);
}

.fieldrow:last-child {
  margin-bottom: 0;
}

.fieldrow__name {
  font-size: var(--font-size-sm);
}

.fieldrow__value {
  margin: 0;
  overflow-wrap: anywhere;
}

.fieldrow__text {
  margin: 0 0 var(--space-1);
}

.fieldrow__text:last-child {
  margin-bottom: 0;
}

.fieldrow__link {
  min-height: var(--tap);
  display: inline-flex;
  align-items: center;
  overflow-wrap: anywhere;
}

.fileitem {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.fileitem:last-child {
  margin-bottom: 0;
}

.fileitem__imagelink {
  display: block;
  flex-shrink: 0;
}

.fileitem__image {
  display: block;
  max-width: 120px;
  max-height: 120px;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
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
