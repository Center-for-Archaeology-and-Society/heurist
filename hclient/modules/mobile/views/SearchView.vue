<template>
  <div class="page">
    <div class="searchbar">
      <input
        v-model.trim="queryText"
        class="input searchbar__input"
        type="search"
        placeholder="Search records…"
        enterkeyhint="search"
        @keyup.enter="runSearch()"
      >
      <router-link class="searchbar__scan" :to="{ name: 'scan' }" aria-label="Scan barcode">⌗</router-link>
    </div>

    <div v-if="filters.length" class="filters-row">
      <FilterChip
        v-for="filter in filters"
        :key="filter.id"
        :filter="filter"
        :active="activeFilterId === filter.id"
        @select="runFilter"
      />
    </div>

    <div ref="scrollEl" class="page-scroll">
      <LoadingSpinner v-if="loading && !records.length" />
      <EmptyState
        v-else-if="!loading && !records.length"
        icon="🔍"
        title="No records found"
        :message="queryText ? 'Try a different search or filter.' : 'Type in the search bar above, or pick a saved filter.'"
      />
      <template v-else>
        <RecordCard v-for="record in records" :key="record.rec_ID" :record="record" />
        <div ref="sentinelEl" class="search-sentinel">
          <LoadingSpinner v-if="loadingMore" label="Loading more…" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { searchRecords } from '../api/records.js'
import { listFilters, filterToQuery } from '../api/filters.js'
import { useRecent } from '../store/recent.js'
import { showError } from '../components/ErrorToast.vue'
import RecordCard from '../components/RecordCard.vue'
import FilterChip from '../components/FilterChip.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const PAGE_SIZE = 30

const route = useRoute()
const recent = useRecent()

const queryText = ref('')
const activeFilterId = ref(null)
const records = ref([])
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const filters = ref([])
const scrollEl = ref(null)
const sentinelEl = ref(null)

let controller = null
let observer = null

const hasMore = computed(() => records.value.length < total.value)

function toQuery(text) {
  if (!text) {
    return ''
  }
  if (/[:()]/.test(text)) {
    return text
  }
  return 'any:*"' + text + '"*'
}

async function runSearch({ append = false } = {}) {
  activeFilterId.value = null
  const text = queryText.value
  if (!append) {
    recent.addSearch(text)
  }
  await fetchPage({ q: toQuery(text), append })
}

async function runFilter(filter) {
  queryText.value = filter.name
  activeFilterId.value = filter.id
  await fetchPage({ q: filterToQuery(filter), append: false })
}

async function fetchPage({ q, append }) {
  if (controller) {
    controller.abort()
  }
  controller = new AbortController()
  const offset = append ? records.value.length : 0
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
  }
  try {
    const result = await searchRecords({
      q,
      detail: 'header',
      limit: PAGE_SIZE,
      offset,
      signal: controller.signal
    })
    records.value = append ? records.value.concat(result.records) : result.records
    total.value = result.total
  } catch (error) {
    if (error.name !== 'AbortError') {
      showError(error.message || 'Search failed')
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore() {
  if (!loading.value && !loadingMore.value && hasMore.value) {
    fetchPage({ q: toQuery(queryText.value), append: true })
  }
}

watch(() => route.query, (query) => {
  if (route.name !== 'search') {
    return
  }
  if (typeof query.q === 'string') {
    queryText.value = query.q
    runSearch()
  } else if (typeof query.filter === 'string') {
    const filter = filters.value.find((item) => String(item.id) === query.filter)
    if (filter) {
      runFilter(filter)
    }
  }
})

watch(records, () => {
  nextTick(() => {
    if (sentinelEl.value && observer) {
      observer.disconnect()
      observer.observe(sentinelEl.value)
    }
  })
})

onMounted(async () => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      loadMore()
    }
  })
  try {
    filters.value = await listFilters()
  } catch (error) {
    showError(error.message || 'Could not load saved filters')
  }
  if (typeof route.query.q === 'string') {
    queryText.value = route.query.q
  }
  await runSearch()
})

onBeforeUnmount(() => {
  if (controller) {
    controller.abort()
  }
  if (observer) {
    observer.disconnect()
  }
})
</script>

<style scoped>
.searchbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  padding-top: calc(var(--space-2) + var(--safe-top));
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.searchbar__input {
  flex: 1;
}

.searchbar__scan {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--tap);
  height: var(--tap);
  font-size: 1.5rem;
  text-decoration: none;
  color: var(--color-primary);
}

.filters-row {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.search-sentinel {
  min-height: 1px;
}
</style>
