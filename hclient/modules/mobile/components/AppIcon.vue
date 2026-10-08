<template>
  <span class="app-icon" :class="{ 'app-icon--image': image }" :style="imageStyle" aria-hidden="true">{{ image ? '' : glyph }}</span>
</template>

<script setup>
import { computed } from 'vue'
import filterIcon from '../../../assets/v6/filter-000000.png'
import networkIcon from '../../../assets/network.svg'

const props = defineProps({ name: { type: String, default: 'document' } })
const images = { filter: filterIcon, network: networkIcon }
// Same glyphs as the desktop jQuery UI icon font (see assets/ICON-LICENSE.md).
const glyphs = {
  search: '\ue6f2', map: '\ue6e2', menu: '\ue6c3', camera: '\ue6e8',
  back: '\ue607', next: '\ue639', close: '\ue679', alert: '\ue65f',
  document: '\ue69c', edit: '\ue688', save: '\ue68c', trash: '\ue690',
  plus: '\ue682', logout: '\ue6ef', login: '\ue6ee', info: '\ue665',
  refresh: '\ue6ce', location: '\ue6e4', stop: '\ue6ae'
}
const image = computed(() => images[props.name])
const imageStyle = computed(() => image.value ? { '--icon-image': `url("${image.value}")` } : {})
const glyph = computed(() => glyphs[props.name] || glyphs.document)
</script>

<style>
@font-face {
  font-family: 'Heurist Icons';
  src: url('../assets/jquery-ui.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
.app-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1em;
  height: 1em;
  font: normal normal 1.25rem/1 'Heurist Icons';
  vertical-align: middle;
}
.app-icon--image {
  background: currentColor;
  mask: var(--icon-image) center / contain no-repeat;
  -webkit-mask: var(--icon-image) center / contain no-repeat;
}
</style>
