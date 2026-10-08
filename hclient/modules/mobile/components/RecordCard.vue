<template>
  <router-link class="recordcard card" :to="{ name: 'record', params: { id: String(recordId) } }">
    <img v-if="thumbnail" class="recordcard__thumb" :src="thumbnail" alt="" loading="lazy">
    <div v-else class="recordcard__thumb recordcard__thumb--placeholder" aria-hidden="true">
      {{ initial }}
    </div>
    <div class="recordcard__body">
      <p class="recordcard__title">{{ title || 'Untitled record' }}</p>
      <p class="recordcard__meta muted">{{ rectypeName }} · #{{ recordId }}</p>
      <p v-if="chips.length" class="recordcard__chips">
        <span v-for="chip in chips" :key="chip.id" class="recordcard__chip">{{ chip.label }}: {{ chip.title }}</span>
      </p>
    </div>
    <span class="recordcard__chevron muted" aria-hidden="true">›</span>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import { useDefinitions } from '../store/definitions.js'
import { normalizeRecord, pointerValues } from './recordData.js'

const props = defineProps({
  record: { type: Object, required: true }
})

const definitions = useDefinitions()

const normalized = computed(() => normalizeRecord(props.record))
const recordId = computed(() => (normalized.value ? normalized.value.id : ''))
const title = computed(() => (normalized.value ? normalized.value.title : ''))
const rectypeId = computed(() => (normalized.value ? normalized.value.rectypeId : null))
const rectypeName = computed(() =>
  rectypeId.value ? definitions.rectypeName(rectypeId.value) : ''
)
const thumbnail = computed(() => (normalized.value ? normalized.value.thumbnailUrl : ''))

const MAX_CHIPS = 3

const chips = computed(() => {
  if (!normalized.value || !rectypeId.value) {
    return []
  }
  const details = normalized.value.details
  const chips = []
  for (const field of definitions.fieldsFor(rectypeId.value)) {
    if (field.type !== 'resource') {
      continue
    }
    for (const pointer of pointerValues(field, details[String(field.dty)] || [])) {
      chips.push({ id: pointer.id, label: field.name, title: pointer.title || '#' + pointer.id })
      if (chips.length >= MAX_CHIPS) {
        return chips
      }
    }
  }
  return chips
})
</script>

<style scoped>
.recordcard {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  margin-bottom: var(--space-2);
  text-decoration: none;
  color: inherit;
  min-height: var(--tap);
}

.recordcard:active {
  background: var(--color-bg);
}

.recordcard__thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--radius);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-bg);
}

.recordcard__thumb--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
  font-weight: 600;
}

.recordcard__body {
  flex: 1;
  min-width: 0;
}

.recordcard__title {
  margin: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.recordcard__meta {
  margin: 2px 0 0;
  font-size: var(--font-size-sm);
}

.recordcard__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: var(--space-1) 0 0;
}

.recordcard__chip {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px var(--space-2);
  border-radius: 999px;
  background: var(--color-bg);
  font-size: var(--font-size-sm);
  color: var(--color-muted);
}

.recordcard__chevron {
  flex-shrink: 0;
  font-size: 1.25rem;
  line-height: 1;
}
</style>
