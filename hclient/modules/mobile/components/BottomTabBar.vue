<template>
  <nav class="tabbar">
    <router-link class="tabbar__tab" :class="{ 'tabbar__tab--active': isActive('search') }" to="/">
      <span class="tabbar__icon" aria-hidden="true">🔍</span>
      <span>Search</span>
    </router-link>
    <router-link class="tabbar__tab" :class="{ 'tabbar__tab--active': isActive('map') }" to="/map">
      <span class="tabbar__icon" aria-hidden="true">🗺</span>
      <span>Map</span>
    </router-link>
    <router-link class="tabbar__tab" :class="{ 'tabbar__tab--active': isActive('filters') }" to="/filters">
      <span class="tabbar__icon" aria-hidden="true">⚗</span>
      <span>Filters</span>
    </router-link>
    <button class="tabbar__tab" type="button" @click="moreOpen = true">
      <span class="tabbar__icon" aria-hidden="true">⋯</span>
      <span>More</span>
    </button>

    <div v-if="moreOpen" class="more-sheet" role="dialog" @click.self="moreOpen = false">
      <div class="more-sheet__panel">
        <p class="more-sheet__title">{{ auth.state.username || 'Signed in' }}</p>
        <p class="muted more-sheet__db">{{ auth.state.db }}</p>
        <router-link class="btn btn--secondary more-sheet__action" to="/scan" @click="moreOpen = false">
          Scan barcode
        </router-link>
        <button class="btn btn--secondary more-sheet__action" type="button" @click="about = !about">About</button>
        <p v-if="about" class="muted more-sheet__about">
          Heurist mobile companion (PWA). Search, map and edit Heurist records in the field.
        </p>
        <button class="btn btn--danger more-sheet__action" type="button" @click="doLogout">Log out</button>
        <button class="btn btn--ghost more-sheet__action" type="button" @click="moreOpen = false">Close</button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../store/auth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const moreOpen = ref(false)
const about = ref(false)

function isActive(tab) {
  return route.meta.tab === tab
}

function doLogout() {
  moreOpen.value = false
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<style scoped>
.tabbar {
  display: flex;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  padding-bottom: var(--safe-bottom);
}

.tabbar__tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: var(--tap);
  border: none;
  background: none;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  text-decoration: none;
  cursor: pointer;
}

.tabbar__tab--active {
  color: var(--color-primary);
  font-weight: 600;
}

.tabbar__icon {
  font-size: 1.25rem;
  line-height: 1;
}

.more-sheet {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(28, 40, 51, 0.4);
  display: flex;
  align-items: flex-end;
}

.more-sheet__panel {
  width: 100%;
  background: var(--color-surface);
  border-radius: var(--radius) var(--radius) 0 0;
  padding: var(--space-4) var(--space-4) calc(var(--space-4) + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  box-shadow: var(--shadow-2);
}

.more-sheet__title {
  margin: 0;
  font-weight: 600;
}

.more-sheet__db {
  margin: 0 0 var(--space-2);
}

.more-sheet__action {
  width: 100%;
}

.more-sheet__about {
  margin: 0;
  font-size: var(--font-size-sm);
}
</style>
