<template>
  <div class="page">
    <PageHeader title="Scan barcode" back />

    <div class="page-scroll scan-body">
      <div class="scan-viewport card">
        <video ref="videoEl" class="scan-video" playsinline muted></video>
        <div v-if="scanning" class="scan-reticle" aria-hidden="true"></div>
        <button
          v-if="scanning && torchSupported"
          class="scan-torch"
          :class="{ 'scan-torch--on': torchOn }"
          type="button"
          aria-label="Toggle torch"
          @click="toggleTorch"
        >{{ torchOn ? '☀' : '☾' }}</button>
        <p v-if="!scanning" class="muted scan-hint">
          Camera unavailable on this device or permission denied — enter the code manually below.
        </p>
      </div>

      <button v-if="!scanning" class="btn" type="button" :disabled="busy" @click="startScanning"><AppIcon name="camera" /> Start camera</button>
      <button v-else class="btn btn--secondary" type="button" @click="stopScanning"><AppIcon name="stop" /> Stop camera</button>

      <form class="scan-manual" @submit.prevent="submitCode">
        <input
          v-model.trim="manualCode"
          class="input"
          type="text"
          inputmode="numeric"
          placeholder="Or type an ISBN / EAN / code…"
        >
        <button class="btn" type="submit" :disabled="!manualCode || busy"><AppIcon name="search" /> Look up</button>
      </form>

      <template v-if="busy">
        <LoadingSpinner label="Looking up…" />
      </template>

      <template v-else-if="phase === 'services'">
        <EmptyState
          icon="camera"
          title="Not in database"
          :message="'No record matches ' + activeCode + '. Look it up in an external service:'"
        >
          <button
            v-for="service in orderedServices"
            :key="service.id"
            class="btn scan-service"
            type="button"
            @click="runLookup(service.id)"
          >
            <span class="scan-service__label">{{ service.label }}</span>
            <span class="muted scan-service__hint">
              {{ service.id === suggestedService ? 'Suggested · ' : '' }}{{ service.hint }}
            </span>
          </button>
          <button class="btn btn--secondary" type="button" @click="createRecord(null)">
            Create record from code
          </button>
        </EmptyState>
      </template>

      <template v-else-if="phase === 'result'">
        <div class="card scan-prefill">
          <p class="scan-prefill__source muted">{{ activeServiceLabel }} · {{ activeCode }}</p>
          <template v-if="selectedEntry">
            <p class="scan-prefill__title">{{ selectedEntry.title }}</p>
            <p v-if="selectedEntry.subtitle" class="muted scan-prefill__subtitle">{{ selectedEntry.subtitle }}</p>
            <dl class="scan-prefill__fields">
              <template v-for="[label, value] in selectedEntry.fields" :key="label">
                <dt>{{ label }}</dt>
                <dd>{{ value }}</dd>
              </template>
            </dl>
            <button class="btn" type="button" @click="createRecord(selectedEntry)"><AppIcon name="plus" /> Create record</button>
          </template>
          <template v-else-if="result && result.entries.length > 1">
            <p class="muted scan-prefill__subtitle">{{ result.entries.length }} results — pick one to prefill:</p>
            <button
              v-for="(entry, index) in result.entries.slice(0, 10)"
              :key="entry.id || index"
              class="btn btn--secondary scan-service"
              type="button"
              @click="selectedEntryId = entry.id || index"
            >
              <span class="scan-service__label">{{ entry.title }}</span>
              <span v-if="entry.subtitle" class="muted scan-service__hint">{{ entry.subtitle }}</span>
            </button>
          </template>
          <template v-else>
            <p class="muted">No {{ activeServiceLabel }} results for this code.</p>
          </template>
          <div class="scan-prefill__actions">
            <button class="btn btn--secondary" type="button" @click="phase = 'services'">Try another service</button>
            <button class="btn btn--secondary" type="button" @click="reset">Discard</button>
          </div>
        </div>
      </template>

      <template v-if="recent.state.scans.length">
        <h2 class="section-title">Recent scans</h2>
        <button
          v-for="scan in recent.state.scans"
          :key="scan.code"
          class="card scan-recent"
          type="button"
          :disabled="busy"
          @click="handleCode(scan.code)"
        >
          <span class="scan-recent__code">{{ scan.code }}</span>
          <span class="muted scan-recent__meta">{{ scan.outcome || '' }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { searchRecords } from '../api/records.js'
import { lookup, suggestService, LOOKUP_SERVICES } from '../api/lookup.js'
import { useRecent } from '../store/recent.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const PREFILL_ROUTE = { name: 'record-edit', params: { id: '0' } }

const KNOWN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
const RESCAN_COOLDOWN = 3000

const router = useRouter()
const recent = useRecent()

const videoEl = ref(null)
const scanning = ref(false)
const torchOn = ref(false)
const torchSupported = ref(false)
const manualCode = ref('')
const busy = ref(false)
const phase = ref('idle')
const activeCode = ref('')
const result = ref(null)
const selectedEntryId = ref(null)

let stream = null
let detector = null
let rafId = 0
let lastCode = ''
let lastCodeAt = 0

const suggestedService = computed(() => suggestService(activeCode.value))
const activeServiceLabel = computed(() => {
  if (!result.value) {
    return ''
  }
  const service = LOOKUP_SERVICES.find((item) => item.id === result.value.service)
  return service ? service.label : result.value.service
})
const orderedServices = computed(() => {
  const suggested = LOOKUP_SERVICES.filter((service) => service.id === suggestedService.value)
  return suggested.concat(LOOKUP_SERVICES.filter((service) => service.id !== suggestedService.value))
})
const selectedEntry = computed(() => {
  if (!result.value) {
    return null
  }
  if (result.value.entries.length === 1) {
    return result.value.entries[0]
  }
  if (selectedEntryId.value !== null) {
    return result.value.entries.find((entry) => entry.id === selectedEntryId.value) || null
  }
  return null
})

async function startScanning() {
  if (scanning.value) {
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    })
    const track = stream.getVideoTracks()[0]
    const capabilities = track && track.getCapabilities ? track.getCapabilities() : null
    torchSupported.value = Boolean(capabilities && 'torch' in capabilities)
    torchOn.value = false
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
    }
    const supportedFormats = 'BarcodeDetector' in window
      ? await window.BarcodeDetector.getSupportedFormats()
      : []
    const formats = KNOWN_FORMATS.filter((format) => supportedFormats.includes(format))
    if (formats.length) {
      detector = new window.BarcodeDetector({ formats })
      scanning.value = true
      detectLoop()
    } else {
      const { BrowserMultiFormatReader } = await import('@zxing/library')
      const reader = new BrowserMultiFormatReader()
      scanning.value = true
      reader.decodeFromVideoElement(videoEl.value, (resultText) => {
        if (resultText && scanning.value) {
          handleCode(resultText.getText())
        }
      })
      detector = { zxing: reader }
    }
  } catch (error) {
    showError(error.message || 'Camera could not be started')
    stopScanning()
  }
}

async function detectLoop() {
  if (!scanning.value || !detector || !videoEl.value) {
    return
  }
  if (!detector.zxing) {
    try {
      const codes = await detector.detect(videoEl.value)
      if (codes && codes.length && codes[0].rawValue) {
        handleCode(codes[0].rawValue)
      }
    } catch {
      /* transient decode errors are ignored */
    }
  }
  rafId = requestAnimationFrame(detectLoop)
}

function stopScanning() {
  scanning.value = false
  torchOn.value = false
  cancelAnimationFrame(rafId)
  if (detector && detector.zxing) {
    detector.zxing.reset()
  }
  detector = null
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }
  if (videoEl.value) {
    videoEl.value.srcObject = null
  }
}

async function toggleTorch() {
  if (!stream || !torchSupported.value) {
    return
  }
  const track = stream.getVideoTracks()[0]
  try {
    await track.applyConstraints({ advanced: [{ torch: !torchOn.value }] })
    torchOn.value = !torchOn.value
  } catch {
    torchSupported.value = false
  }
}

async function handleCode(code) {
  const value = String(code || '').trim()
  if (!value || busy.value) {
    return
  }
  const now = Date.now()
  if (value === lastCode && now - lastCodeAt < RESCAN_COOLDOWN) {
    return
  }
  lastCode = value
  lastCodeAt = now
  busy.value = true
  recent.addScan(value)
  try {
    const found = await searchRecords({ q: 'any:*"' + value + '"*', detail: 'header', limit: 10 })
    if (found.records.length === 1) {
      recent.addScan(value, { outcome: 'matched' })
      router.push({ name: 'record', params: { id: String(found.records[0].rec_ID) } })
      return
    }
    if (found.records.length > 1) {
      recent.addScan(value, { outcome: found.records.length + ' matches' })
      router.push({ name: 'search', query: { q: 'any:*"' + value + '"*' } })
      return
    }
    recent.addScan(value, { outcome: 'not in database' })
    stopScanning()
    activeCode.value = value
    result.value = null
    selectedEntryId.value = null
    phase.value = 'services'
  } catch (error) {
    showError(error.message || 'Lookup failed')
  } finally {
    busy.value = false
  }
}

async function runLookup(service) {
  if (!activeCode.value || busy.value) {
    return
  }
  busy.value = true
  try {
    const outcome = await lookup(service, activeCode.value)
    result.value = outcome
    selectedEntryId.value = null
    phase.value = 'result'
    const outcomeLabel = outcome.entries.length
      ? 'lookup: ' + outcome.entries.length + ' result' + (outcome.entries.length > 1 ? 's' : '')
      : 'lookup: no results'
    recent.addScan(activeCode.value, { outcome: outcomeLabel })
  } catch (error) {
    showError((error && error.message) || 'External lookup failed')
  } finally {
    busy.value = false
  }
}

async function createRecord(entry) {
  const prefill = {
    code: activeCode.value,
    service: result.value ? result.value.service : null,
    title: entry ? entry.title : '',
    subtitle: entry ? entry.subtitle : '',
    fields: entry ? entry.fields : [],
    coordinates: entry && entry.coordinates ? entry.coordinates : null
  }
  recent.stagePrefill(prefill)
  recent.addScan(activeCode.value, { outcome: 'prefill staged' })
  try {
    await router.push({ ...PREFILL_ROUTE, state: { prefill } })
  } catch {
    showError('Could not open the record form')
  }
}

function reset() {
  phase.value = 'idle'
  result.value = null
  selectedEntryId.value = null
  activeCode.value = ''
  manualCode.value = ''
}

function submitCode() {
  if (manualCode.value) {
    handleCode(manualCode.value)
  }
}

onMounted(() => {
  if (!('BarcodeDetector' in window) && !navigator.mediaDevices) {
    showError('Scanning needs a camera and HTTPS — enter the code manually')
  }
})

onBeforeUnmount(stopScanning)
</script>

<style scoped>
.scan-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.scan-viewport {
  position: relative;
  height: 260px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #10161c;
}

.scan-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scan-reticle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200px;
  height: 120px;
  transform: translate(-50%, -50%);
  border: 2px solid var(--color-on-primary);
  border-radius: var(--radius);
  box-shadow: 0 0 0 2000px rgba(16, 22, 28, 0.45);
}

.scan-torch {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
}

.scan-torch--on {
  background: rgba(255, 255, 255, 0.85);
  color: #10161c;
}

.scan-hint {
  padding: var(--space-3);
  font-size: var(--font-size-sm);
}

.scan-manual {
  display: flex;
  gap: var(--space-2);
}

.section-title {
  margin: var(--space-2) 0;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
}

.scan-service {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  min-height: var(--tap);
}

.scan-service__hint {
  font-size: var(--font-size-sm);
  font-weight: 400;
}

.scan-prefill {
  padding: var(--space-3);
}

.scan-prefill__source {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-sm);
}

.scan-prefill__title {
  margin: 0 0 var(--space-1);
  font-weight: 600;
}

.scan-prefill__subtitle {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
}

.scan-prefill__fields {
  margin: 0 0 var(--space-3);
  display: grid;
  grid-template-columns: minmax(72px, auto) 1fr;
  gap: 4px var(--space-3);
  font-size: var(--font-size-sm);
}

.scan-prefill__fields dt {
  color: var(--color-muted);
}

.scan-prefill__fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.scan-prefill__actions {
  display: flex;
  gap: var(--space-2);
}

.scan-recent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--tap);
  margin-bottom: var(--space-2);
  padding: var(--space-3);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.scan-recent__code {
  font-weight: 600;
}

.scan-recent__meta {
  font-size: var(--font-size-sm);
}
</style>
