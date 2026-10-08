<template>
  <div class="page">
    <div class="searchbar">
      <input
        v-model.trim="queryText"
        class="input searchbar__input"
        type="search"
        placeholder="Search records…"
        enterkeyhint="search"
        @input="onInput"
        @keyup.enter="runSearch"
      >
      <button
        v-if="queryText"
        class="searchbar__clear"
        type="button"
        aria-label="Clear search"
        @click="clearSearch"
      >×</button>
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

    <div
      ref="scrollEl"
      class="page-scroll search-scroll"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend.passive="onTouchEnd"
    >
      <div
        class="pull-indicator"
        :class="{ 'pull-indicator--ready': pullDistance >= PULL_THRESHOLD }"
        :style="{ transform: 'translateY(' + pullDistance + 'px)' }"
      >
        <template v-if="refreshing">
          <LoadingSpinner label="" />
        </template>
        <span v-else-if="pullDistance > 0" class="muted">
          {{ pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh' }}
        </span>
      </div>

      <LoadingSpinner v-if="loading && !records.length" />
      <EmptyState
        v-else-if="error"
        icon="⚠"
        title="Search failed"
        :message="errorMessage"
      >
        <button class="btn btn--secondary" type="button" @click="retry">Retry</button>
      </EmptyState>
      <EmptyState
        v-else-if="!records.length && !loading"
        icon="🔍"
        :title="activeFilterId ? 'No records match this filter' : 'No records found'"
        :message="queryText ? 'Try a different search or filter.' : 'Type in the search bar above, or pick a saved filter.'"
      />
      <template v-else>
        <p class="search-count muted">{{ countLabel }}</p>
        <RecordCard v-for="record in records" :key="record.id" :record="record" />
        <div ref="sentinelEl" class="search-sentinel">
          <LoadingSpinner v-if="loadingMore" label="Loading more…" />
          <p v-else-if="!hasMore && total > records.length" class="muted search-end">
            {{ records.length }} of {{ total }} loaded
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listFilters, filterToQuery } from '../api/filters.js'
import { queryRecords, freeTextQuery } from '../components/recordData.js'
import { useRecent } from '../store/recent.js'
import { showError } from '../components/ErrorToast.vue'
import RecordCard from '../components/RecordCard.vue'
import FilterChip from '../components/FilterChip.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const PAGE_SIZE = 30
const PULL_THRESHOLD = 60
const DEBOUNCE_MS = 400

const route = useRoute()
const recent = useRecent()

const queryText = ref('')
const activeFilterId = ref(null)
const records = ref([])
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const refreshing = ref(false)
const error = ref(null)
const filters = ref([])
const scrollEl = ref(null)
const sentinelEl = ref(null)
const pullDistance = ref(0)

let controller = null
let observer = null
let debounceTimer = 0
let touchStartY = 0
let lastQuery = { q: '', filter: null }

const hasMore = computed(() => records.value.length < total.value)
const errorMessage = computed(() => (error.value && error.value.message) || String(error.value || ''))
const countLabel = computed(() =>
  total.value > records.value.length
    ? records.value.length + ' of ' + total.value + ' records'
    : (total.value === 1 ? '1 record' : total.value + ' records')
)

async function fetchPage({ q, append, filter }) {
  if (controller) {
    controller.abort()
  }
  controller = new AbortController()
  const offset = append ? records.value.length : 0
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    error.value = null
  }
  try {
    const result = await queryRecords({ q, detail: 'header', limit: PAGE_SIZE, offset, signal: controller.signal })
    records.value = append ? records.value.concat(result.records) : result.records
    total.value = result.total
    lastQuery = { q, filter: filter || null }
    if (!append && !filter) {
      recent.addSearch(queryText.value)
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      error.value = err
      if (append) {
        showError(err.message || 'Could not load more records')
      }
    }
  } finally {
    loading.value = false
    loadingMore.value = false
    refreshing.value = false
  }
}

function runSearch() {
  clearTimeout(debounceTimer)
  activeFilterId.value = null
  fetchPage({ q: freeTextQuery(queryText.value), append: false })
}

function onInput() {
  activeFilterId.value = null
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    fetchPage({ q: freeTextQuery(queryText.value), append: false })
  }, DEBOUNCE_MS)
}

function clearSearch() {
  clearTimeout(debounceTimer)
  queryText.value = ''
  activeFilterId.value = null
  fetchPage({ q: '', append: false })
}

async function runFilter(filter) {
  clearTimeout(debounceTimer)
  queryText.value = filter.name
  activeFilterId.value = filter.id
  await fetchPage({ q: filterToQuery(filter), append: false, filter })
}

async function refresh() {
  refreshing.value = true
  try {
    filters.value = await listFilters()
  } catch {
    // refresh of filters is best-effort; keep the current list
  }
  if (activeFilterId.value) {
    const filter = filters.value.find((item) => item.id === activeFilterId.value)
    if (filter) {
      await fetchPage({ q: filterToQuery(filter), append: false, filter })
      return
    }
    activeFilterId.value = null
  }
  await fetchPage({ q: freeTextQuery(queryText.value), append: false })
}

function retry() {
  fetchPage({ q: lastQuery.q, append: false, filter: lastQuery.filter })
}

function onTouchStart(event) {
  touchStartY = scrollEl.value && scrollEl.value.scrollTop <= 0 ? event.touches[0].clientY : 0
}

function onTouchMove(event) {
  if (!touchStartY || loading.value || refreshing.value) {
    return
  }
  const distance = event.touches[0].clientY - touchStartY
  pullDistance.value = distance > 0 && scrollEl.value.scrollTop <= 0
    ? Math.min(90, distance * 0.5)
    : 0
}

function onTouchEnd() {
  if (pullDistance.value >= PULL_THRESHOLD && !loading.value && !refreshing.value) {
    refresh()
  }
  pullDistance.value = 0
  touchStartY = 0
}

function loadMore() {
  if (!loading.value && !loadingMore.value && hasMore.value && !error.value) {
    fetchPage({ q: lastQuery.q, append: true, filter: lastQuery.filter })
  }
}

watch(() => route.query, (query) => {
  if (route.name !== 'search') {
    return
  }
  if (typeof query.q === 'string' && query.q !== lastQuery.q) {
    queryText.value = query.q
    fetchPage({ q: query.q, append: false })
  } else if (typeof query.filter === 'string') {
    const filter = filters.value.find((item) => String(item.id) === query.filter)
    if (filter && filter.id !== activeFilterId.value) {
      runFilter(filter)
    }
  }
})

watch(filters, () => {
  if (route.name === 'search' && typeof route.query.filter === 'string' && !activeFilterId.value) {
    const filter = filters.value.find((item) => String(item.id) === route.query.filter)
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
  } catch (err) {
    showError(err.message || 'Could not load saved filters')
  }
  if (typeof route.query.q === 'string') {
    queryText.value = route.query.q
  }
  if (typeof route.query.filter === 'string') {
    const filter = filters.value.find((item) => String(item.id) === route.query.filter)
    if (filter) {
      await runFilter(filter)
      return
    }
  }
  // Route queries are already Heurist queries (for example a saved filter).
  const q = typeof route.query.q === 'string' ? route.query.q : freeTextQuery(queryText.value)
  await fetchPage({ q, append: false })
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
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
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  padding-top: calc(var(--space-2) + var(--safe-top));
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.searchbar__input {
  flex: 1;
  min-width: 0;
}

.searchbar__clear,
.searchbar__scan {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--tap);
  height: var(--tap);
  flex-shrink: 0;
  border: none;
  background: none;
  font-size: 1.4rem;
  line-height: 1;
  text-decoration: none;
  color: var(--color-muted);
  cursor: pointer;
}

.searchbar__scan {
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

.search-scroll {
  overscroll-behavior: contain;
}

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 0;
  overflow: visible;
  margin-bottom: calc(-1 * var(--space-3));
  transition: transform 0.1s ease-out;
}

.pull-indicator .spinner {
  padding: var(--space-2);
}

.search-count {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
}

.search-sentinel {
  min-height: 1px;
}

.search-end {
  text-align: center;
  font-size: var(--font-size-sm);
}
</style>
