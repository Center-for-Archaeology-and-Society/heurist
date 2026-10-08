<template>
  <div class="page scan">
    <PageHeader title="Scan barcode" back />

    <div class="page-scroll scan-body">
      <div class="scan-viewport card">
        <video ref="videoEl" class="scan-video" playsinline muted></video>
        <div v-if="scanning" class="scan-reticle" aria-hidden="true"></div>
        <p v-if="!scanning" class="muted scan-hint">
          Camera unavailable on this device or permission denied — enter the code manually below.
        </p>
      </div>

      <button v-if="!scanning" class="btn" type="button" @click="startScanning">Start camera</button>
      <button v-else class="btn btn--secondary" type="button" @click="stopScanning">Stop camera</button>

      <form class="scan-manual" @submit.prevent="submitCode">
        <input
          v-model.trim="manualCode"
          class="input"
          type="text"
          inputmode="numeric"
          placeholder="Or type an ISBN / EAN / code…"
        >
        <button class="btn" type="submit" :disabled="!manualCode || busy">Look up</button>
      </form>

      <template v-if="recent.state.scans.length">
        <h2 class="section-title">Recent scans</h2>
        <button
          v-for="scan in recent.state.scans"
          :key="scan.code"
          class="card scan-recent"
          type="button"
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
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { searchRecords } from '../api/records.js'
import { lookup } from '../api/lookup.js'
import { useRecent } from '../store/recent.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'

const KNOWN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'isbn']

const router = useRouter()
const recent = useRecent()

const videoEl = ref(null)
const scanning = ref(false)
const manualCode = ref('')
const busy = ref(false)

let stream = null
let detector = null
let rafId = 0

async function startScanning() {
  if (scanning.value) {
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    })
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
    }
    if ('BarcodeDetector' in window) {
      detector = new window.BarcodeDetector({ formats: KNOWN_FORMATS })
      scanning.value = true
      detectLoop()
    } else {
      const { BrowserMultiFormatReader } = await import('@zxing/library')
      const reader = new BrowserMultiFormatReader()
      scanning.value = true
      reader.decodeFromVideoElement(videoEl.value, (result) => {
        if (result && scanning.value) {
          handleCode(result.getText())
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
  try {
    const codes = await detector.detect(videoEl.value)
    if (codes && codes.length && codes[0].rawValue) {
      handleCode(codes[0].rawValue)
    }
  } catch {
    /* transient decode errors are ignored */
  }
  rafId = requestAnimationFrame(detectLoop)
}

function stopScanning() {
  scanning.value = false
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

async function handleCode(code) {
  if (busy.value) {
    return
  }
  busy.value = true
  recent.addScan(code)
  try {
    const result = await searchRecords({ q: 'any:*"' + code + '"*', detail: 'header', limit: 10 })
    if (result.records.length === 1) {
      recent.addScan(code, { outcome: 'matched' })
      router.push({ name: 'record', params: { id: String(result.records[0].rec_ID) } })
      return
    }
    if (result.records.length > 1) {
      recent.addScan(code, { outcome: result.records.length + ' matches' })
      router.push({ name: 'search', query: { q: 'any:*"' + code + '"*' } })
      return
    }
    recent.addScan(code, { outcome: 'not in database' })
    showError('Not in database — try an external lookup service')
  } catch (error) {
    showError(error.message || 'Lookup failed')
  } finally {
    busy.value = false
  }
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
