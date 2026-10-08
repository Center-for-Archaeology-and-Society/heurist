<template>
  <div class="page">
    <PageHeader title="Filters">
      <template #actions>
        <button class="pageheader__action" type="button" @click="toggleBuilder">
          {{ builderOpen ? 'Close' : '+ New' }}
        </button>
      </template>
    </PageHeader>

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
        <div v-if="builderOpen" class="card builder">
          <label class="builder__label" for="builder-rectype">Record type</label>
          <select id="builder-rectype" v-model.number="builderRty" class="input">
            <option :value="0" disabled>Choose a record type…</option>
            <option v-for="rt in rectypeOptions" :key="rt.id" :value="rt.id">{{ rt.name }}</option>
          </select>

          <div v-for="(criterion, index) in criteria" :key="index" class="builder__row">
            <select v-model="criterion.dty" class="input" @change="onCriterionFieldChange(criterion)">
              <option :value="0" disabled>Field…</option>
              <option v-for="field in builderFields" :key="field.dty" :value="field.dty">{{ field.name }}</option>
            </select>
            <select v-model="criterion.op" class="input builder__op">
              <option v-for="op in opsFor(criterion)" :key="op.value" :value="op.value">{{ op.label }}</option>
            </select>
            <select
              v-if="criterionField(criterion)?.vocabulary && isEnumType(criterion)"
              v-model="criterion.value"
              class="input builder__value"
            >
              <option value="" disabled>Term…</option>
              <option v-for="term in termOptionsFor(criterion)" :key="term.id" :value="String(term.id)">
                {{ term.label }}
              </option>
            </select>
            <input
              v-else
              v-model.trim="criterion.value"
              class="input builder__value"
              type="text"
              :inputmode="isNumericType(criterion) ? 'decimal' : 'text'"
              :placeholder="valuePlaceholder(criterion)"
            >
            <button class="builder__remove" type="button" aria-label="Remove criterion" @click="removeCriterion(index)">✕</button>
          </div>

          <button class="btn btn--ghost builder__add" type="button" :disabled="!builderRty" @click="addCriterion">
            + Add criterion
          </button>

          <p class="muted builder__preview">
            <template v-if="!compiledQuery">Pick a record type to start.</template>
            <template v-else-if="previewLoading">Counting…</template>
            <template v-else-if="previewError">{{ previewError }}</template>
            <template v-else>{{ previewCount }} record{{ previewCount === 1 ? '' : 's' }} match</template>
          </p>

          <div class="builder__save">
            <input v-model.trim="filterName" class="input" type="text" placeholder="Filter name" maxlength="200">
            <button class="btn" type="button" :disabled="!canSave || savingFilter" @click="saveCurrentFilter">
              {{ savingFilter ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>

        <h2 v-if="ownFilters.length" class="section-title">My filters</h2>
        <div v-for="filter in ownFilters" :key="filter.id" class="card filter-row">
          <button class="filter-row__open" type="button" @click="run(filter)">
            <span class="filter-row__name">{{ filter.name || 'Unnamed filter' }}</span>
            <span class="muted">›</span>
          </button>
          <button class="filter-row__delete" type="button" aria-label="Delete filter" @click="removeFilter(filter)">🗑</button>
        </div>

        <h2 v-if="groupFilters.length" class="section-title">Group filters</h2>
        <div v-for="filter in groupFilters" :key="filter.id" class="card filter-row">
          <button class="filter-row__open" type="button" @click="run(filter)">
            <span class="filter-row__name">{{ filter.name || 'Unnamed filter' }}</span>
            <span class="muted">›</span>
          </button>
          <button class="filter-row__delete" type="button" aria-label="Delete filter" @click="removeFilter(filter)">🗑</button>
        </div>

        <EmptyState
          v-if="!ownFilters.length && !groupFilters.length && !builderOpen"
          icon="⚗"
          title="No saved filters"
          message="Build one with + New, then run it from here or from the search screen."
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listFilters, saveFilter, deleteFilter, filterToQuery } from '../api/filters.js'
import { searchRecords } from '../api/records.js'
import { useAuth } from '../store/auth.js'
import { useDefinitions } from '../store/definitions.js'
import { showError } from '../components/ErrorToast.vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const TEXT_OPS = [
  { value: '', label: 'contains' },
  { value: '=', label: 'is' },
  { value: '-', label: 'excludes' }
]
const NUMBER_OPS = [
  { value: '', label: 'is' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' }
]
const DATE_OPS = [
  { value: '', label: 'is (prefix)' },
  { value: '>', label: 'after' },
  { value: '>=', label: 'on or after' },
  { value: '<', label: 'before' },
  { value: '<=', label: 'on or before' }
]
const TERM_OPS = [
  { value: '', label: 'includes subterms' },
  { value: '=', label: 'is exactly' },
  { value: '-', label: 'excludes' }
]
const QUERYABLE_TYPES = ['freetext', 'blocktext', 'integer', 'float', 'date', 'enum', 'relationtype']

const router = useRouter()
const auth = useAuth()
const definitions = useDefinitions()

const filters = ref([])
const loading = ref(false)
const error = ref(null)

const builderOpen = ref(false)
const builderRty = ref(0)
const criteria = reactive([])
const filterName = ref('')
const savingFilter = ref(false)

const previewCount = ref(null)
const previewLoading = ref(false)
const previewError = ref('')
let previewTimer = 0
let previewController = null

const ownFilters = computed(() => filters.value.filter((filter) => filter.ownerId > 0))
const groupFilters = computed(() => filters.value.filter((filter) => filter.ownerId < 0))

const rectypeOptions = computed(() => {
  const snapshot = definitions.state.snapshot
  if (!snapshot || !snapshot.rectypes) {
    return []
  }
  return Object.entries(snapshot.rectypes)
    .map(([id, rt]) => ({ id: Number(id), name: rt.name || rt.plural || id, showInLists: rt.showInLists !== false }))
    .sort((a, b) => (b.showInLists - a.showInLists) || a.name.localeCompare(b.name))
})

const builderFields = computed(() => (builderRty.value > 0 ? definitions.fieldsFor(builderRty.value) : [])
  .filter((field) => QUERYABLE_TYPES.includes(field.type)))

const compiledQuery = computed(() => compileQuery(builderRty.value, criteria))

const canSave = computed(() =>
  Boolean(builderRty.value) && criteria.length > 0 && filterName.value.length > 0 && !previewLoading.value
)

function criterionField(criterion) {
  return builderFields.value.find((field) => field.dty === Number(criterion.dty)) || null
}

function isEnumType(criterion) {
  const field = criterionField(criterion)
  return Boolean(field && (field.type === 'enum' || field.type === 'relationtype'))
}

function isNumericType(criterion) {
  const field = criterionField(criterion)
  return Boolean(field && (field.type === 'integer' || field.type === 'float'))
}

function opsFor(criterion) {
  const field = criterionField(criterion)
  if (!field) {
    return TEXT_OPS
  }
  if (field.type === 'enum' || field.type === 'relationtype') {
    return TERM_OPS
  }
  if (field.type === 'integer' || field.type === 'float') {
    return NUMBER_OPS
  }
  if (field.type === 'date') {
    return DATE_OPS
  }
  return TEXT_OPS
}

function valuePlaceholder(criterion) {
  const field = criterionField(criterion)
  if (!field) {
    return 'Value'
  }
  if (field.type === 'date') {
    return 'YYYY or YYYY-MM-DD'
  }
  if (field.type === 'integer' || field.type === 'float') {
    return 'Number'
  }
  return 'Value'
}

function termOptionsFor(criterion) {
  const field = criterionField(criterion)
  const snapshot = definitions.state.snapshot
  if (!field || !field.vocabulary || !snapshot || !snapshot.terms || !snapshot.termlinks) {
    return []
  }
  const children = new Map()
  for (const link of snapshot.termlinks) {
    if (!children.has(link.parent)) {
      children.set(link.parent, [])
    }
    children.get(link.parent).push(link.term)
  }
  const out = []
  const seen = new Set()
  const walk = (id) => {
    for (const child of children.get(id) || []) {
      if (seen.has(child)) {
        continue
      }
      seen.add(child)
      out.push({ id: child, label: definitions.termLabel(child) })
      walk(child)
    }
  }
  walk(Number(field.vocabulary))
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

function escapeQueryValue(text) {
  return String(text).replace(/["*()\\]/g, ' ').trim()
}

function compileQuery(rtyId, rows) {
  if (!(rtyId > 0)) {
    return ''
  }
  const parts = ['t:' + Number(rtyId)]
  for (const criterion of rows) {
    const field = criterionField(criterion)
    const raw = escapeQueryValue(criterion.value)
    if (!field || !raw) {
      continue
    }
    let token = raw
    if (field.type === 'enum' || field.type === 'relationtype') {
      if (criterion.op === '=' || criterion.op === '-') {
        token = criterion.op + raw
      }
    } else if (field.type === 'integer' || field.type === 'float') {
      token = criterion.op && criterion.op !== '=' ? criterion.op + raw : raw
    } else if (field.type === 'date') {
      token = criterion.op ? criterion.op + raw : raw
    } else {
      token = criterion.op === '=' || criterion.op === '-' ? criterion.op + raw : raw
    }
    parts.push('f' + field.dty + ':"' + token + '"')
  }
  return '*' + parts.join(' ')
}

function addCriterion() {
  criteria.push({ dty: 0, op: '', value: '' })
}

function removeCriterion(index) {
  criteria.splice(index, 1)
}

function onCriterionFieldChange(criterion) {
  criterion.op = opsFor(criterion)[0].value
  criterion.value = ''
}

function toggleBuilder() {
  builderOpen.value = !builderOpen.value
  if (builderOpen.value && !builderRty.value && rectypeOptions.value.length) {
    builderRty.value = rectypeOptions.value[0].id
  }
}

async function refreshPreview() {
  if (previewController) {
    previewController.abort()
  }
  const query = compiledQuery.value
  if (!query) {
    previewCount.value = null
    previewError.value = ''
    previewLoading.value = false
    return
  }
  previewController = new AbortController()
  previewLoading.value = true
  previewError.value = ''
  try {
    const result = await searchRecords({ q: query, detail: 'count', limit: 1, signal: previewController.signal })
    previewCount.value = result.total
  } catch (err) {
    if (err.name !== 'AbortError') {
      previewCount.value = null
      previewError.value = 'Preview failed: ' + (err.message || 'search error')
    }
  } finally {
    previewLoading.value = false
  }
}

async function saveCurrentFilter() {
  if (!canSave.value) {
    return
  }
  savingFilter.value = true
  try {
    await saveFilter({
      name: filterName.value,
      query: JSON.stringify({ q: compiledQuery.value }),
      rtyId: builderRty.value
    })
    builderOpen.value = false
    filterName.value = ''
    builderRty.value = 0
    criteria.splice(0, criteria.length)
    previewCount.value = null
    filters.value = await listFilters()
  } catch (err) {
    showError(err.message || 'Could not save filter')
  } finally {
    savingFilter.value = false
  }
}

async function removeFilter(filter) {
  if (!window.confirm('Delete filter "' + (filter.name || 'Unnamed filter') + '"?')) {
    return
  }
  try {
    await deleteFilter(filter.id, { ownerId: filter.ownerId })
    filters.value = filters.value.filter((item) => item.id !== filter.id)
  } catch (err) {
    showError(err.message || 'Delete failed')
  }
}

function run(filter) {
  const query = filterToQuery(filter)
  router.push(query ? { name: 'search', query: { q: query } } : { name: 'search' })
}

async function load() {
  loading.value = true
  error.value = null
  try {
    filters.value = await listFilters()
    await definitions.load(auth.state.db)
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
}

watch([builderRty, () => criteria.map((c) => c.dty + '|' + c.op + '|' + c.value).join('\n')], () => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(refreshPreview, 600)
})

onBeforeUnmount(() => {
  clearTimeout(previewTimer)
  if (previewController) {
    previewController.abort()
  }
})

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
  margin-bottom: var(--space-2);
  padding-right: 0;
}

.filter-row__open {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-height: var(--tap);
  padding: var(--space-3);
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.filter-row__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-row__delete {
  min-width: var(--tap);
  min-height: var(--tap);
  border: none;
  background: none;
  color: var(--color-muted);
  font-size: 1rem;
  cursor: pointer;
}

.pageheader__action {
  min-height: var(--tap);
  padding: 0 var(--space-2);
  border: none;
  background: none;
  color: var(--color-on-primary);
  font-weight: 600;
  cursor: pointer;
}

.builder {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.builder__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-muted);
}

.builder__row {
  display: grid;
  grid-template-columns: 1.4fr 0.9fr 1.4fr auto;
  gap: var(--space-1);
  align-items: start;
}

.builder__op,
.builder__value {
  min-width: 0;
}

.builder__remove {
  min-width: var(--tap);
  min-height: var(--tap);
  border: none;
  background: none;
  color: var(--color-muted);
  font-size: 1rem;
  cursor: pointer;
}

.builder__add {
  align-self: flex-start;
}

.builder__preview {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-sm);
  min-height: 1.2em;
}

.builder__save {
  display: flex;
  gap: var(--space-2);
}

.builder__save .input {
  flex: 1;
}
</style>
