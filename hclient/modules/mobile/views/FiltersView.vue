<template>
  <div class="page">
    <PageHeader title="Filters" />

    <div class="page-scroll">
      <LoadingSpinner v-if="loading" />
      <EmptyState
        v-else-if="error"
        icon="⚠"
        title="Could not load filters"
        :message="error.message || String(error)"
      >
        <button class="btn btn--secondary" type="button" @click="load">Retry</button>
      </EmptyState>
      <template v-else>
        <h2 v-if="ownFilters.length" class="section-title">My filters</h2>
        <button
          v-for="filter in ownFilters"
          :key="filter.id"
          class="card filter-row"
          type="button"
          @click="run(filter)"
        >
          <span class="filter-row__name">{{ filter.name || 'Unnamed filter' }}</span>
          <span class="muted">›</span>
        </button>

        <h2 v-if="groupFilters.length" class="section-title">Group filters</h2>
        <button
          v-for="filter in groupFilters"
          :key="filter.id"
          class="card filter-row"
          type="button"
          @click="run(filter)"
        >
          <span class="filter-row__name">{{ filter.name || 'Unnamed filter' }}</span>
          <span class="muted">›</span>
        </button>

        <EmptyState
          v-if="!ownFilters.length && !groupFilters.length"
          icon="⚗"
          title="No saved filters"
          message="Saved searches from this database appear here. The filter builder arrives with the next release."
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listFilters } from '../api/filters.js'
import { useAuth } from '../store/auth.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const router = useRouter()
const auth = useAuth()

const filters = ref([])
const loading = ref(false)
const error = ref(null)

const ownFilters = computed(() => filters.value.filter((filter) => filter.ownerId > 0))
const groupFilters = computed(() => filters.value.filter((filter) => filter.ownerId < 0))

async function load() {
  loading.value = true
  error.value = null
  try {
    filters.value = await listFilters()
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
}

function run(filter) {
  router.push({ name: 'search', query: { filter: String(filter.id), q: undefined } })
}

onMounted(load)
</script>

<style scoped>
.section-title {
  margin: var(--space-4) 0 var(--space-2);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
}

.filter-row {
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

.filter-row__name {
  font-weight: 600;
}
</style>
