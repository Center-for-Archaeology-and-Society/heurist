<template>
  <img class="heurist-brand" :src="inverse ? lightLogo : logo" alt="Heurist" width="494" height="112">
</template>
<script setup>
import logo from '../../../assets/v6/h6logo.png'
import lightLogo from '../../../assets/v6/h6logo_inv.png'
defineProps({ inverse: { type: Boolean, default: false } })
</script>
<style scoped>
.heurist-brand { display: block; width: 110px; height: auto; flex-shrink: 0; }
</style>
