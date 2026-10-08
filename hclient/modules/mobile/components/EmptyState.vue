<template>
  <div class="emptystate">
    <p class="emptystate__icon" aria-hidden="true"><AppIcon :name="icon" /></p>
    <p class="emptystate__title">{{ title }}</p>
    <p v-if="message" class="emptystate__message muted">{{ message }}</p>
    <div class="emptystate__actions">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'document' },
  title: { type: String, required: true },
  message: { type: String, default: '' }
})
</script>

<style scoped>
.emptystate {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-5) var(--space-4);
}

.emptystate__icon {
  margin: 0 0 var(--space-2);
  font-size: 2rem;
}

.emptystate__icon .app-icon {
  font-size: 2rem;
  color: var(--color-muted);
}

.emptystate__title {
  margin: 0;
  font-weight: 600;
}

.emptystate__message {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-sm);
}

.emptystate__actions {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  max-width: 280px;
}
</style>
