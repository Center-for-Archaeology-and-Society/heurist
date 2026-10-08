<template>
  <router-link class="recordcard card" :to="{ name: 'record', params: { id: String(recordId) } }">
    <img v-if="thumbnail" class="recordcard__thumb" :src="thumbnail" alt="" loading="lazy">
    <div v-else class="recordcard__thumb recordcard__thumb--placeholder" aria-hidden="true">
      {{ initial }}
    </div>
    <div class="recordcard__body">
      <p class="recordcard__title">{{ title || 'Untitled record' }}</p>
      <p class="recordcard__meta muted">{{ rectypeName }} · #{{ recordId }}</p>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import { useDefinitions } from '../store/definitions.js'

const props = defineProps({
  record: { type: Object, required: true }
})

const definitions = useDefinitions()

const recordId = computed(() => props.record.rec_ID ?? props.record.id)
const title = computed(() => props.record.rec_Title ?? props.record.title ?? '')
const rectypeId = computed(() => props.record.rec_RecTypeID ?? props.record.rectype)
const rectypeName = computed(() =>
  rectypeId.value ? definitions.rectypeName(rectypeId.value) : ''
)
const thumbnail = computed(() => {
  const url = props.record.rec_ThumbnailURL ?? props.record.thumbnailUrl
  return url || ''
})
const initial = computed(() => (title.value || '?').charAt(0).toUpperCase())
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

.recordcard__thumb {
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  object-fit: cover;
  flex-shrink: 0;
}

.recordcard__thumb--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  color: var(--color-muted);
  font-weight: 600;
}

.recordcard__body {
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
</style>
