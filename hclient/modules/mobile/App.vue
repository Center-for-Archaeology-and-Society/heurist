<template>
  <div class="app-shell">
    <router-view v-slot="{ Component, route }">
      <transition :name="route.meta.stacked ? 'push' : 'fade'" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
    <BottomTabBar v-if="showTabBar" />
    <ErrorToast />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BottomTabBar from './components/BottomTabBar.vue'
import ErrorToast from './components/ErrorToast.vue'

const route = useRoute()
const showTabBar = computed(() => route.name !== 'login' && !route.meta.fullscreen)
</script>
