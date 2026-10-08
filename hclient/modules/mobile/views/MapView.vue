<template>
  <div class="page">
    <PageHeader :title="title" back>
      <template #actions>
        <button class="map-action" type="button" aria-label="Refresh map" @click="refetchNow">⟳</button>
      </template>
    </PageHeader>

    <div ref="mapEl" class="map-container"></div>

    <div v-if="loading" class="map-overlay map-loading">
      <LoadingSpinner label="Loading features…" />
    </div>

    <div v-else-if="status === 'ready' && !pointCount && !shapeCount" class="map-overlay">
      <div class="card map-empty">
        <p class="map-empty__title">Nothing to map here</p>
        <p class="muted map-empty__msg">
          No geographic features matched{{ recordId ? ' this record' : ' in this view' }}.
          Pan, zoom out or refine the search.
        </p>
        <button class="btn btn--secondary" type="button" @click="refetchNow">Retry</button>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="map-overlay">
      <div class="card map-empty">
        <p class="map-empty__title">Could not load map features</p>
        <p class="muted map-empty__msg">{{ errorMessage }}</p>
        <button class="btn btn--secondary" type="button" @click="refetchNow">Retry</button>
      </div>
    </div>

    <p v-if="notice" class="map-notice">{{ notice }}</p>

    <transition name="sheet">
      <div v-if="sheet" class="map-sheet card">
        <button class="map-sheet__close" type="button" aria-label="Close" @click="sheet = null">×</button>
        <p class="map-sheet__title">{{ sheet.title || 'Untitled record' }}</p>
        <p class="muted map-sheet__meta">{{ sheet.meta }}</p>
        <router-link
          v-if="sheet.id"
          class="btn map-sheet__open"
          :to="{ name: 'record', params: { id: String(sheet.id) } }"
        >Open record</router-link>
      </div>
    </transition>

    <ErrorToast />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchMapFeatures } from '../api/map.js'
import { useDefinitions } from '../store/definitions.js'
import { useAuth } from '../store/auth.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import ErrorToast from '../components/ErrorToast.vue'

const CLUSTER_CELL = 70
const REFETCH_DEBOUNCE = 600
const REFETCH_EXTENT_RATIO = 0.5

const RECTYPE_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7']

const route = useRoute()
const definitions = useDefinitions()
const auth = useAuth()

const mapEl = ref(null)
const loading = ref(false)
const status = ref('idle')
const errorMessage = ref('')
const notice = ref('')
const pointCount = ref(0)
const shapeCount = ref(0)
const sheet = ref(null)

const recordId = computed(() => (route.query.record ? String(route.query.record) : null))
const title = computed(() => (recordId.value ? 'Record on map' : 'Map'))

let map = null
let layerGroup = null
let leaflet = null
let points = []
let shapes = []
let debouncedRefetch = null
let lastExtent = null
let fetchSeq = 0

function toQuery() {
  if (route.query.q) {
    return String(route.query.q)
  }
  if (recordId.value) {
    return { ids: [Number(recordId.value)] }
  }
  return ''
}

function rectypeColor(rectypeId) {
  const id = Number(rectypeId)
  if (!Number.isFinite(id)) {
    return RECTYPE_COLORS[0]
  }
  return RECTYPE_COLORS[Math.abs(id) % RECTYPE_COLORS.length]
}

function featureProps(properties) {
  const props = properties || {}
  const id = Number(props.rec_ID ?? props._geoRecordID ?? props.id)
  return {
    id: Number.isFinite(id) && id > 0 ? id : null,
    title: String(props.rec_Title ?? props.title ?? ''),
    rectype: props.rec_RecTypeID ?? props._geoRecordTypeID ?? null
  }
}

function currentExtent() {
  if (!map) {
    return null
  }
  const bounds = map.getBounds()
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
}

function extentChanged(previous, next) {
  if (!previous) {
    return true
  }
  const width = Math.max(Math.abs(previous[2] - previous[0]), 1e-9)
  const height = Math.max(Math.abs(previous[3] - previous[1]), 1e-9)
  return Math.abs(previous[0] - next[0]) > width * REFETCH_EXTENT_RATIO
    || Math.abs(previous[1] - next[1]) > height * REFETCH_EXTENT_RATIO
    || Math.abs(previous[2] - next[2]) > width * REFETCH_EXTENT_RATIO
    || Math.abs(previous[3] - next[3]) > height * REFETCH_EXTENT_RATIO
}

async function refetchNow() {
  if (!map || !layerGroup) {
    return
  }
  const seq = ++fetchSeq
  loading.value = true
  status.value = 'idle'
  errorMessage.value = ''
  try {
    const query = toQuery()
    const payload = typeof query === 'string' ? { q: query } : { ids: query.ids }
    const extent = currentExtent()
    if (extent && !recordId.value) {
      payload.extent = extent
      lastExtent = extent
    }
    const result = await fetchMapFeatures(payload)
    if (seq !== fetchSeq) {
      return
    }
    points = []
    shapes = []
    for (const feature of result.features || []) {
      if (!feature || !feature.geometry) {
        continue
      }
      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          points.push({ lat, lng, ...featureProps(feature.properties) })
        }
      } else {
        shapes.push(feature)
      }
    }
    pointCount.value = points.length
    shapeCount.value = shapes.length
    notice.value = result.truncated
      ? 'Showing ' + (result.features || []).length + ' of ' + result.total + ' matching records — zoom in or narrow the search.'
      : ''
    status.value = 'ready'
    sheet.value = null
    renderFeatures()
  } catch (error) {
    if (seq !== fetchSeq) {
      return
    }
    status.value = 'error'
    errorMessage.value = error.message || 'Map request failed'
    showError(errorMessage.value)
  } finally {
    if (seq === fetchSeq) {
      loading.value = false
    }
  }
}

function scheduleRefetch() {
  clearTimeout(debouncedRefetch)
  debouncedRefetch = setTimeout(() => {
    const extent = currentExtent()
    if (extentChanged(lastExtent, extent)) {
      refetchNow()
    } else {
      renderFeatures()
    }
  }, REFETCH_DEBOUNCE)
}

function openSheet(point) {
  sheet.value = {
    id: point.id,
    title: point.title,
    meta: (point.rectype ? definitions.rectypeName(point.rectype) + ' · ' : '') + '#' + point.id
  }
}

function renderFeatures() {
  if (!map || !layerGroup || !leaflet) {
    return
  }
  const L = leaflet
  layerGroup.clearLayers()

  if (shapes.length) {
    L.geoJSON({ type: 'FeatureCollection', features: shapes }, {
      style: () => ({ color: '#4e79a7', weight: 2, fillOpacity: 0.25 }),
      onEachFeature: (feature, layer) => {
        layer.on('click', () => openSheet(featureProps(feature.properties)))
      }
    }).addTo(layerGroup)
  }

  const cells = new Map()
  for (const point of points) {
    const screen = map.latLngToContainerPoint([point.lat, point.lng])
    const key = Math.floor(screen.x / CLUSTER_CELL) + ':' + Math.floor(screen.y / CLUSTER_CELL)
    let cell = cells.get(key)
    if (!cell) {
      cell = { lat: 0, lng: 0, points: [] }
      cells.set(key, cell)
    }
    cell.lat += point.lat
    cell.lng += point.lng
    cell.points.push(point)
  }

  for (const cell of cells.values()) {
    const count = cell.points.length
    if (count === 1) {
      const point = cell.points[0]
      if (point.id === null) {
        continue
      }
      const color = rectypeColor(point.rectype)
      L.circleMarker([point.lat, point.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95
      }).on('click', () => openSheet(point)).addTo(layerGroup)
    } else {
      const latlng = [cell.lat / count, cell.lng / count]
      L.marker(latlng, {
        icon: L.divIcon({
          className: 'map-cluster',
          html: '<span>' + count + '</span>',
          iconSize: [40, 40]
        })
      }).on('click', () => {
        const bounds = L.latLngBounds(cell.points.map((point) => [point.lat, point.lng]))
        map.fitBounds(bounds.pad(0.3), { maxZoom: map.getZoom() + 2 })
      }).addTo(layerGroup)
    }
  }
}

async function loadLeaflet() {
  if (!leaflet) {
    await import('leaflet/dist/leaflet.css')
    leaflet = (await import('leaflet')).default
  }
  return leaflet
}

async function render() {
  if (!mapEl.value || map) {
    return
  }
  const L = await loadLeaflet()
  map = L.map(mapEl.value, { tap: true }).setView([-30, 135], 3)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map)
  layerGroup = L.layerGroup().addTo(map)
  map.on('moveend', scheduleRefetch)
  map.on('zoomend', renderFeatures)
  await definitions.load(auth.state.db).catch(() => {})
  await refetchNow()
}

function onResize() {
  renderFeatures()
}

onMounted(() => {
  render().catch((error) => {
    status.value = 'error'
    errorMessage.value = 'Map failed to initialise'
    showError(error.message || errorMessage.value)
  })
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  clearTimeout(debouncedRefetch)
  window.removeEventListener('resize', onResize)
  fetchSeq++
  if (map) {
    map.remove()
    map = null
    layerGroup = null
  }
})

watch([recordId, () => route.query.q], () => {
  if (map) {
    lastExtent = null
    refetchNow()
  }
})
</script>

<style scoped>
.page {
  position: relative;
}

.map-container {
  position: relative;
  flex: 1;
  min-height: 0;
  z-index: 0;
}

.map-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: 20;
  pointer-events: none;
}

.map-loading {
  background: rgba(255, 255, 255, 0.6);
}

.map-empty {
  pointer-events: auto;
  text-align: center;
  padding: var(--space-4);
  max-width: 320px;
}

.map-empty__title {
  margin: 0 0 var(--space-1);
  font-weight: 600;
}

.map-empty__msg {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-sm);
}

.map-notice {
  position: absolute;
  left: 50%;
  bottom: calc(var(--tabbar-height, 56px) + var(--space-2));
  transform: translateX(-50%);
  max-width: 90%;
  margin: 0;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius);
  background: rgba(16, 22, 28, 0.85);
  color: #fff;
  font-size: var(--font-size-sm);
  z-index: 20;
}

.map-action {
  min-width: var(--tap);
  min-height: var(--tap);
  border: none;
  background: none;
  color: var(--color-on-primary);
  font-size: 1.2rem;
  cursor: pointer;
}

.map-sheet {
  position: absolute;
  left: var(--space-2);
  right: var(--space-2);
  bottom: calc(var(--tabbar-height, 56px) + var(--space-2));
  z-index: 30;
  padding: var(--space-3);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.15);
}

.map-sheet__close {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  min-width: var(--tap);
  min-height: var(--tap);
  border: none;
  background: none;
  font-size: 1.2rem;
  color: var(--color-muted);
  cursor: pointer;
}

.map-sheet__title {
  margin: 0 var(--space-6) var(--space-1) 0;
  font-weight: 600;
}

.map-sheet__meta {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-sm);
}

.map-sheet__open {
  display: block;
  text-align: center;
  text-decoration: none;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>

<style>
.map-cluster {
  background: none;
  border: none;
}

.map-cluster span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-primary, #2456a6);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  box-shadow: 0 0 0 4px rgba(36, 86, 166, 0.25);
}
</style>
