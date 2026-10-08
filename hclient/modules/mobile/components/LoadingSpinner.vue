<template>
  <div class="spinner" role="status" :aria-label="label">
    <span class="spinner__circle" aria-hidden="true"></span>
    <span v-if="label" class="spinner__label muted">{{ label }}</span>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: 'Loading…' }
})
</script>

<style scoped>
.spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-5);
}

.spinner__circle {
  width: 28px;
  height: 28px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner__label {
  font-size: var(--font-size-sm);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
