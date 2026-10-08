import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import AppIcon from './components/AppIcon.vue'
import RecordTypeIcon from './components/RecordTypeIcon.vue'
import HeuristBrand from './components/HeuristBrand.vue'
import './styles/tokens.css'
import './styles/base.css'

createApp(App)
  .component('AppIcon', AppIcon)
  .component('RecordTypeIcon', RecordTypeIcon)
  .component('HeuristBrand', HeuristBrand)
  .use(router).mount('#app')

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const updatingExistingWorker = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updatingExistingWorker) {
      window.location.reload()
    }
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline shell unavailable; app still works online */
    })
  })
}
