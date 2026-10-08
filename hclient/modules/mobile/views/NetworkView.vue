<template>
  <div class="page">
    <PageHeader title="Network" back>
      <template #actions>
        <button class="network-action" type="button" aria-label="Recenter graph" @click="resetView">⌖</button>
      </template>
    </PageHeader>

    <LoadingSpinner v-if="loading" class="network-spinner" label="Building network…" />

    <template v-else>
      <EmptyState
        v-if="error"
        icon="⚠"
        title="Could not load network"
        :message="error.message || String(error)"
      >
        <button class="btn btn--secondary" type="button" @click="load">Retry</button>
      </EmptyState>

      <EmptyState
        v-else-if="!nodes.length"
        icon="⌗⌗"
        title="No relationships found"
        :message="emptyMessage"
      >
        <button class="btn btn--secondary" type="button" @click="load">Retry</button>
      </EmptyState>

      <template v-else>
        <p v-if="truncated" class="notice">
          Large network — showing the first {{ nodes.length }} of {{ total }} nodes.
          Narrow the query to see more.
        </p>

        <div class="network-canvas-wrap">
          <canvas
            ref="canvasEl"
            class="network-canvas"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @wheel.prevent="onWheel"
          ></canvas>
          <div v-if="legend.length" class="network-legend">
            <span v-for="entry in legend" :key="entry.id" class="network-legend__item">
              <span class="network-legend__swatch" :style="{ background: entry.color }"></span>
              {{ entry.name }}
            </span>
          </div>
        </div>

        <div class="page-scroll">
          <h2 class="section-title">Connected records ({{ nodes.length }})</h2>
          <RecordCard v-for="node in nodes" :key="node.id" :record="node" />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchGraph } from '../api/graph.js'
import { useAuth } from '../store/auth.js'
import { useDefinitions } from '../store/definitions.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import RecordCard from '../components/RecordCard.vue'

const NODE_RADIUS = 7
const SEED_RADIUS = 10
const REPULSION = 3000
const SPRING_LENGTH = 70
const SPRING_STRENGTH = 0.04
const GRAVITY = 0.02
const DAMPING = 0.85
const MIN_ALPHA = 0.02
const ALPHA_DECAY = 0.985
const MIN_SCALE = 0.3
const MAX_SCALE = 4

const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7']

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const definitions = useDefinitions()

const canvasEl = ref(null)
const loading = ref(false)
const error = ref(null)
const nodes = ref([])
const edges = ref([])
const truncated = ref(false)
const total = ref(0)

const recordId = computed(() => (route.params.id ? String(route.params.id) : null))
const emptyMessage = computed(() =>
  recordId.value
    ? 'This record has no connected records within the link limits.'
    : 'The current query has no connected records within the link limits.'
)

const legend = computed(() => {
  const seen = new Map()
  for (const node of nodes.value) {
    const key = node.rectype === null || node.rectype === undefined ? 'unknown' : String(node.rectype)
    if (!seen.has(key)) {
      seen.set(key, {
        id: key,
        color: nodeColor(node.rectype),
        name: node.rectype ? definitions.rectypeName(node.rectype) : 'Unknown type'
      })
    }
  }
  return Array.from(seen.values()).slice(0, 6)
})

let simNodes = []
let simEdges = []
let alpha = 0
let rafId = 0
let width = 0
let height = 0
let view = { x: 0, y: 0, k: 1 }
let pointers = new Map()
let pinchStart = null
let moved = 0

function nodeColor(rectypeId) {
  if (rectypeId === null || rectypeId === undefined) {
    return PALETTE[0]
  }
  const id = Number(rectypeId)
  return PALETTE[Math.abs(Number.isFinite(id) ? id : 0) % PALETTE.length]
}

function toScreen(node) {
  return {
    x: node.x * view.k + view.x,
    y: node.y * view.k + view.y
  }
}

function resizeCanvas() {
  const canvas = canvasEl.value
  if (!canvas) {
    return
  }
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  width = rect.width
  height = rect.height
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw()
}

function buildSimulation() {
  const seedId = recordId.value ? Number(recordId.value) : null
  const count = nodes.value.length
  simNodes = nodes.value.map((node, index) => ({
    ...node,
    seed: seedId !== null && node.id === seedId,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0
  }))
  const byId = new Map(simNodes.map((node) => [node.id, node]))
  simEdges = edges.value
    .map((edge) => ({ ...edge, source: byId.get(edge.source), target: byId.get(edge.target) }))
    .filter((edge) => edge.source && edge.target && edge.source !== edge.target)
  simNodes.forEach((node, index) => {
    if (node.seed) {
      node.x = 0
      node.y = 0
    } else {
      const angle = (2 * Math.PI * index) / Math.max(count, 1)
      const radius = SPRING_LENGTH * 2
      node.x = radius * Math.cos(angle)
      node.y = radius * Math.sin(angle)
    }
  })
  view = { x: width / 2, y: height / 2, k: 1 }
  alpha = 1
  startLoop()
}

function step() {
  if (alpha < MIN_ALPHA) {
    return
  }
  for (let i = 0; i < simNodes.length; i++) {
    const a = simNodes[i]
    for (let j = i + 1; j < simNodes.length; j++) {
      const b = simNodes[j]
      let dx = a.x - b.x
      let dy = a.y - b.y
      let distSq = dx * dx + dy * dy
      if (distSq < 1) {
        dx = Math.random() - 0.5
        dy = Math.random() - 0.5
        distSq = dx * dx + dy * dy
      }
      const dist = Math.sqrt(distSq)
      const force = (REPULSION * alpha) / distSq
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }
  }
  for (const edge of simEdges) {
    const dx = edge.target.x - edge.source.x
    const dy = edge.target.y - edge.source.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const force = SPRING_STRENGTH * (dist - SPRING_LENGTH) * alpha
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    edge.source.vx += fx
    edge.source.vy += fy
    edge.target.vx -= fx
    edge.target.vy -= fy
  }
  for (const node of simNodes) {
    node.vx -= node.x * GRAVITY * alpha
    node.vy -= node.y * GRAVITY * alpha
    if (node.seed) {
      node.x = 0
      node.y = 0
      node.vx = 0
      node.vy = 0
      continue
    }
    node.vx *= DAMPING
    node.vy *= DAMPING
    node.x += Math.max(-30, Math.min(30, node.vx))
    node.y += Math.max(-30, Math.min(30, node.vy))
  }
  alpha *= ALPHA_DECAY
}

function draw() {
  const canvas = canvasEl.value
  if (!canvas) {
    return
  }
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, width, height)
  if (!simNodes.length) {
    return
  }
  const showLabels = simNodes.length <= 60 || view.k > 1.5
  ctx.strokeStyle = 'rgba(120, 130, 140, 0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const edge of simEdges) {
    const from = toScreen(edge.source)
    const to = toScreen(edge.target)
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
  }
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const node of simNodes) {
    const screen = toScreen(node)
    const radius = node.seed ? SEED_RADIUS : NODE_RADIUS
    if (screen.x < -radius || screen.y < -radius || screen.x > width + radius || screen.y > height + radius) {
      continue
    }
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = nodeColor(node.rectype)
    ctx.fill()
    if (node.seed) {
      ctx.strokeStyle = '#10161c'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    if (showLabels) {
      const label = node.title.length > 22 ? node.title.slice(0, 21) + '…' : node.title
      ctx.fillStyle = 'rgba(16, 22, 28, 0.85)'
      ctx.font = '11px sans-serif'
      ctx.fillText(label || '#' + node.id, screen.x, screen.y + radius + 2)
    }
  }
}

function loop() {
  step()
  draw()
  rafId = alpha >= MIN_ALPHA ? requestAnimationFrame(loop) : 0
}

function startLoop() {
  if (!rafId) {
    rafId = requestAnimationFrame(loop)
  }
}

function resetView() {
  view = { x: width / 2 || 0, y: height / 2 || 0, k: 1 }
  alpha = Math.max(alpha, 0.3)
  startLoop()
}

function hitTest(x, y) {
  let best = null
  let bestDist = Infinity
  for (const node of simNodes) {
    const screen = toScreen(node)
    const dist = Math.hypot(screen.x - x, screen.y - y)
    const radius = (node.seed ? SEED_RADIUS : NODE_RADIUS) + 12
    if (dist <= radius && dist < bestDist) {
      best = node
      bestDist = dist
    }
  }
  return best
}

function localPoint(event) {
  const rect = canvasEl.value.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function onPointerDown(event) {
  canvasEl.value.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, localPoint(event))
  moved = 0
  if (pointers.size === 2) {
    const [a, b] = Array.from(pointers.values())
    pinchStart = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      k: view.k,
      view: { ...view }
    }
  }
}

function onPointerMove(event) {
  if (!pointers.has(event.pointerId)) {
    return
  }
  const previous = pointers.get(event.pointerId)
  const current = localPoint(event)
  pointers.set(event.pointerId, current)
  moved += Math.hypot(current.x - previous.x, current.y - previous.y)
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = Array.from(pointers.values())
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.k * (dist / (pinchStart.dist || 1))))
    const ratio = k / pinchStart.k
    view.k = k
    view.x = mid.x - (pinchStart.view.x - pinchStart.mid.x) * ratio
    view.y = mid.y - (pinchStart.view.y - pinchStart.mid.y) * ratio
    view.x += mid.x - pinchStart.mid.x
    view.y += mid.y - pinchStart.mid.y
  } else if (pointers.size === 1) {
    view.x += current.x - previous.x
    view.y += current.y - previous.y
  }
  draw()
}

function onPointerUp(event) {
  const start = pointers.get(event.pointerId)
  pointers.delete(event.pointerId)
  if (pointers.size < 2) {
    pinchStart = null
  }
  if (start && moved < 6 && pointers.size === 0) {
    const point = localPoint(event)
    const node = hitTest(point.x, point.y)
    if (node) {
      router.push({ name: 'record', params: { id: String(node.id) } })
    }
  }
}

function onWheel(event) {
  const point = localPoint(event)
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
  const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.k * factor))
  view.x = point.x - (point.x - view.x) * (k / view.k)
  view.y = point.y - (point.y - view.y) * (k / view.k)
  view.k = k
  draw()
}

async function load() {
  loading.value = true
  error.value = null
  nodes.value = []
  edges.value = []
  truncated.value = false
  try {
    await definitions.load(auth.state.db).catch(() => {})
    const result = await fetchGraph({
      ids: recordId.value ? [Number(recordId.value)] : undefined,
      q: recordId.value ? undefined : String(route.query.q || '')
    })
    nodes.value = result.nodes
    edges.value = result.edges
    truncated.value = result.truncated
    total.value = result.total || result.nodes.length
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
    // the canvas is v-if'd behind the spinner; it only exists after the
    // loading flag flips, so size and draw on the next tick
    await nextTick()
    resizeCanvas()
    buildSimulation()
  }
}

onMounted(() => {
  load()
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  rafId = 0
  window.removeEventListener('resize', resizeCanvas)
})

watch([recordId, () => route.query.q], load)
</script>

<style scoped>
.section-title {
  margin: var(--space-2) 0;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
}

.notice {
  margin: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: #fdf3e7;
  color: #9c5b12;
  font-size: var(--font-size-sm);
}

.network-spinner {
  margin-top: var(--space-6);
}

.network-canvas-wrap {
  position: relative;
  height: 52vh;
  min-height: 260px;
  border-bottom: 1px solid var(--color-border);
  touch-action: none;
}

.network-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.network-legend {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-2);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
  max-width: 60%;
  pointer-events: none;
}

.network-legend__item {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.network-legend__swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.network-action {
  min-width: var(--tap);
  min-height: var(--tap);
  border: none;
  background: none;
  color: var(--color-on-primary);
  font-size: 1.2rem;
  cursor: pointer;
}
</style>
