<template>
  <img v-if="url && !failed" class="record-type-icon" :src="url" alt="" loading="lazy" @error="failed = true">
  <AppIcon v-else name="document" class="record-type-icon" />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAuth, serverRoot } from '../store/auth.js'

const props = defineProps({ id: { type: [Number, String], default: null } })
const auth = useAuth()
const failed = ref(false)
const url = computed(() => props.id && auth.state.db
  ? serverRoot() + 'hserv/controller/fileGet.php?' + new URLSearchParams({
    db: auth.state.db, entity: 'rty', icon: props.id, version: 'icon', def: 2
  }) : '')
watch(url, () => { failed.value = false })
</script>

<style scoped>
.record-type-icon { width: 24px; height: 24px; object-fit: contain; flex-shrink: 0; }
</style>
