import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './styles/tokens.css'
import './styles/base.css'

createApp(App).use(router).mount('#app')

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
