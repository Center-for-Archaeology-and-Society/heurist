<template>
  <header class="pageheader">
    <button v-if="back" class="pageheader__back" type="button" aria-label="Back" @click="goBack"><AppIcon name="back" /></button>
    <HeuristBrand v-if="!back" inverse />
    <h1 class="pageheader__title">{{ title }}</h1>
    <div class="pageheader__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup>
import { useRouter } from 'vue-router'

defineProps({
  title: { type: String, required: true },
  back: { type: Boolean, default: false }
})

const router = useRouter()

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<style scoped>
.pageheader {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: calc(var(--tap) + var(--space-2));
  padding: var(--space-2) var(--space-3);
  background: var(--color-header);
  color: var(--color-on-primary);
}

.pageheader__title {
  flex: 1;
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pageheader__back {
  min-width: var(--tap);
  min-height: var(--tap);
  margin-left: calc(-1 * var(--space-2));
  border: none;
  background: none;
  color: var(--color-on-primary);
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
}

.pageheader__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
