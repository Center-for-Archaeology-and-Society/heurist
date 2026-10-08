<template>
  <div class="page">
    <PageHeader title="Network" back />

    <div class="page-scroll">
      <LoadingSpinner v-if="loading" />
      <EmptyState
        v-else-if="error"
        icon="⚠"
        title="Could not load network"
        :message="error.message || String(error)"
      >
        <button class="btn btn--secondary" type="button" @click="load">Retry</button>
      </EmptyState>
      <template v-else>
        <p v-if="truncated" class="notice">
          Showing the first {{ nodes.length }} nodes — narrow the query to see more.
        </p>
        <EmptyState
          v-if="!nodes.length"
          icon="⌗⌗"
          title="No relationships found"
          message="This record (or query) has no connected records within the link limits."
        />
        <template v-else>
          <h2 class="section-title">Connected records ({{ nodes.length }})</h2>
          <RecordCard v-for="node in nodes" :key="nodeId(node)" :record="nodeRecord(node)" />
        </template>
        <p class="muted note">
          Force-directed canvas layout with pinch zoom arrives with the graph wave.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchGraph } from '../api/graph.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import RecordCard from '../components/RecordCard.vue'

const DEFAULT_LINKS = [{ type: 'directed', depth: 1 }]

const route = useRoute()

const nodes = ref([])
const truncated = ref(false)
const loading = ref(false)
const error = ref(null)

const recordId = computed(() => (route.params.id ? String(route.params.id) : null))

function nodeId(node) {
  return node.id ?? node.rec_ID ?? node.ID
}

function nodeRecord(node) {
  return {
    rec_ID: nodeId(node),
    rec_Title: node.title ?? node.rec_Title ?? node.label ?? '',
    rec_RecTypeID: node.rectype ?? node.rec_RecTypeID
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const result = await fetchGraph({
      ids: recordId.value ? [Number(recordId.value)] : undefined,
      q: recordId.value ? undefined : String(route.query.q || ''),
      links: DEFAULT_LINKS
    })
    nodes.value = result.nodes
    truncated.value = result.truncated
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
}

onMounted(load)
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
  margin: 0 0 var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: #fdf3e7;
  color: #9c5b12;
  font-size: var(--font-size-sm);
}

.note {
  font-size: var(--font-size-sm);
}
</style>
