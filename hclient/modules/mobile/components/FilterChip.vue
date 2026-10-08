<template>
  <button class="chip" :class="{ 'chip--active': active }" type="button" @click="$emit('select', filter)">
    {{ filter.name || 'Unnamed filter' }}
    <span v-if="removable" class="chip__remove" role="button" aria-label="Remove" @click.stop="$emit('remove', filter)">×</span>
  </button>
</template>

<script setup>
defineProps({
  filter: { type: Object, required: true },
  active: { type: Boolean, default: false },
  removable: { type: Boolean, default: false }
})

defineEmits(['select', 'remove'])
</script>

<style scoped>
.chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--tap);
  min-height: var(--tap);
  margin: 0 calc(-1 * var(--space-2));
  font-size: 1.1rem;
  line-height: 1;
  opacity: 0.7;
}
</style>
