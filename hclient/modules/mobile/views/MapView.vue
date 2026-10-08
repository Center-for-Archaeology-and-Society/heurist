<template>
  <div class="page">
    <PageHeader :title="title" back>
      <template #actions>
        <button class="map-action" type="button" aria-label="Recenter" @click="refetch">⟳</button>
      </template>
    </PageHeader>

    <div ref="mapEl" class="map-container"></div>

    <LoadingSpinner v-if="loading" class="map-spinner" label="Loading features…" />
    <ErrorToast />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchMapFeatures } from '../api/map.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const route = useRoute()

const mapEl = ref(null)
const loading = ref(false)

const recordId = computed(() => (route.query.record ? String(route.query.record) : null))
const title = computed(() => (recordId.value ? 'Record on map' : 'Map'))

let map = null
let layer = null
let debouncedRefetch = null

function toQuery() {
  if (route.query.q) {
    return String(route.query.q)
  }
  if (recordId.value) {
    return { ids: [Number(recordId.value)] }
  }
  return ''
}
function popupHtml(feature) {
  const props = feature.properties || {}
  const id = props.rec_ID ?? props.id
  const titleText = props.rec_Title || props.title || 'Record'
  if (id !== undefined && id !== null) {
    return '<a href="#/record/' + Number(id) + '">' + escapeHtml(String(titleText)) + '</a>'
  }
  return escapeHtml(String(titleText))
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]))
}

async function loadLeaflet() {
  await import('leaflet/dist/leaflet.css')
  return (await import('leaflet')).default
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
  layer = L.layerGroup().addTo(map)
  map.on('moveend', () => {
    clearTimeout(debouncedRefetch)
    debouncedRefetch = setTimeout(refetch, 600)
  })
  await refetch()
}

async function refetch() {
  if (!layer) {
    return
  }
  loading.value = true
  try {
    const query = toQuery()
    const payload = typeof query === 'string' ? { q: query } : { ids: query.ids }
    const bounds = map.getBounds()
    payload.bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
    const collection = await fetchMapFeatures(payload)
    layer.clearLayers()
    const L = await loadLeaflet()
    for (const feature of collection.features || []) {
      const geometry = feature.geometry
      if (!geometry || geometry.type !== 'Point') {
        continue
      }
      const [lon, lat] = geometry.coordinates
      L.marker([lat, lon])
        .bindPopup(popupHtml(feature))
        .addTo(layer)
    }
  } catch (error) {
    showError(error.message || 'Could not load map features')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  render().catch(() => showError('Map failed to initialise'))
})

onBeforeUnmount(() => {
  clearTimeout(debouncedRefetch)
  if (map) {
    map.remove()
    map = null
    layer = null
  }
})
</script>

<style scoped>
.map-container {
  position: relative;
  flex: 1;
  min-height: 0;
  z-index: 0;
}

.map-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  background: rgba(255, 255, 255, 0.85);
  border-radius: var(--radius);
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
</style>
