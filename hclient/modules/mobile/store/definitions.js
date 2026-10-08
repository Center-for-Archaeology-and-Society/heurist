import { reactive } from 'vue'
import { apiRequest } from '../api/client.js'

const CACHE_PREFIX = 'heurist-mobile-defs-'
const CACHE_TTL = 24 * 60 * 60 * 1000

function cacheKey(db) {
  return CACHE_PREFIX + db
}

function loadCache(db) {
  try {
    const raw = localStorage.getItem(cacheKey(db))
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.fetchedAt || Date.now() - parsed.fetchedAt > CACHE_TTL) {
      return null
    }
    return parsed.snapshot
  } catch {
    return null
  }
}

function saveCache(db, snapshot) {
  try {
    localStorage.setItem(cacheKey(db), JSON.stringify({ fetchedAt: Date.now(), snapshot }))
  } catch {
    /* storage full or unavailable: cache is best-effort */
  }
}

const state = reactive({
  db: null,
  snapshot: null,
  loading: false,
  error: null
})

let inflight = null

async function doLoad(db) {
  state.loading = true
  state.error = null
  try {
    const data = await apiRequest('def/snapshot', { db })
    const snapshot = data && data.data ? data.data : data
    state.db = db
    state.snapshot = snapshot
    saveCache(db, snapshot)
    return snapshot
  } catch (error) {
    state.error = error
    throw error
  } finally {
    state.loading = false
  }
}

async function load(db, { force = false } = {}) {
  if (state.db === db && state.snapshot && !force) {
    return state.snapshot
  }
  if (!force) {
    const cached = loadCache(db)
    if (cached && state.db !== db) {
      state.db = db
      state.snapshot = cached
    }
  }
  if (state.db === db && state.snapshot && !force) {
    return state.snapshot
  }
  if (!inflight) {
    inflight = doLoad(db).finally(() => {
      inflight = null
    })
  }
  return inflight
}

function rectype(id) {
  const snapshot = state.snapshot
  if (!snapshot || !snapshot.rectypes) {
    return null
  }
  return snapshot.rectypes[String(id)] || null
}

function rectypeName(id) {
  const rt = rectype(id)
  return rt ? (rt.name || rt.plural || String(id)) : String(id)
}

function fieldsFor(rtyId) {
  const snapshot = state.snapshot
  if (!snapshot || !snapshot.structure || !snapshot.fields) {
    return []
  }
  return snapshot.structure
    .filter((entry) => Number(entry.rty) === Number(rtyId))
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((entry) => ({
      dty: Number(entry.dty),
      name: entry.name,
      requirement: entry.req,
      max: entry.max,
      ...(snapshot.fields[String(entry.dty)] || { name: entry.name, type: 'freetext' })
    }))
}

function fieldDef(dtyId) {
  const snapshot = state.snapshot
  return (snapshot && snapshot.fields && snapshot.fields[String(dtyId)]) || null
}

function termLabel(termId) {
  const snapshot = state.snapshot
  const terms = snapshot && snapshot.terms
  const term = terms && terms[String(termId)]
  return term ? (term.term || String(termId)) : String(termId)
}

export function useDefinitions() {
  return {
    state,
    load,
    rectype,
    rectypeName,
    fieldsFor,
    fieldDef,
    termLabel
  }
}
