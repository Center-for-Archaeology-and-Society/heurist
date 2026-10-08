<template>
  <transition name="fade">
    <div v-if="visible" class="toast" role="alert">{{ message }}</div>
  </transition>
</template>

<script>
export function showError(message, timeout = 4000) {
  window.dispatchEvent(new CustomEvent('mobile:toast', { detail: { message: String(message), timeout } }))
}
</script>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const message = ref('')
const visible = ref(false)
let timer = null

function onToast(event) {
  message.value = event.detail.message
  visible.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    visible.value = false
  }, event.detail.timeout || 4000)
}

onMounted(() => window.addEventListener('mobile:toast', onToast))
onBeforeUnmount(() => window.removeEventListener('mobile:toast', onToast))
</script>

<style scoped>
.toast {
  position: fixed;
  left: var(--space-4);
  right: var(--space-4);
  bottom: calc(var(--tabbar-height) + var(--safe-bottom) + var(--space-4));
  z-index: 60;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--color-danger);
  color: var(--color-on-primary);
  box-shadow: var(--shadow-2);
  font-size: var(--font-size-sm);
}
</style>
