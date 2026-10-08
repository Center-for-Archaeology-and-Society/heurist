import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from './store/auth.js'
import LoginView from './views/LoginView.vue'
import SearchView from './views/SearchView.vue'
import RecordView from './views/RecordView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'search', component: SearchView, meta: { tab: 'search' } },
  { path: '/map', name: 'map', component: () => import('./views/MapView.vue'), meta: { tab: 'map' } },
  { path: '/filters', name: 'filters', component: () => import('./views/FiltersView.vue'), meta: { tab: 'filters' } },
  { path: '/record/:id(\\d+)', name: 'record', component: RecordView, props: true, meta: { tab: 'search', stacked: true } },
  { path: '/record/:id(\\d+)/edit', name: 'record-edit', component: () => import('./views/RecordEditView.vue'), props: true, meta: { tab: 'search', stacked: true } },
  { path: '/network/:id(\\d+)?', name: 'network', component: () => import('./views/NetworkView.vue'), props: true, meta: { tab: 'search', stacked: true } },
  { path: '/scan', name: 'scan', component: () => import('./views/ScanView.vue'), meta: { tab: 'search', fullscreen: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  const db = typeof to.query.db === 'string' ? to.query.db : auth.state.db || auth.lastDb()
  await auth.restoreSession(db)
  if (!to.meta.public && !auth.isAuthenticated.value) {
    return { name: 'login', query: { ...(db ? { db } : {}), ...(to.fullPath === '/' ? {} : { redirect: to.fullPath }) } }
  }
  if (to.name === 'login' && auth.isAuthenticated.value) {
    return typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/')
      ? to.query.redirect : { name: 'search' }
  }
  return true
})

export default router
