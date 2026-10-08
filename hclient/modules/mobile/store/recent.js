import { reactive } from 'vue'

const SEARCHES_KEY = 'heurist-mobile-recent-searches'
const RECORDS_KEY = 'heurist-mobile-recent-records'
const SCANS_KEY = 'heurist-mobile-recent-scans'
const MAX_ITEMS = 20

function load(key) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, MAX_ITEMS)))
  } catch {
    /* best-effort */
  }
}

const state = reactive({
  searches: load(SEARCHES_KEY),
  records: load(RECORDS_KEY),
  scans: load(SCANS_KEY)
})

function addSearch(text) {
  const value = String(text || '').trim()
  if (!value) {
    return
  }
  state.searches = [value, ...state.searches.filter((item) => item !== value)].slice(0, MAX_ITEMS)
  save(SEARCHES_KEY, state.searches)
}

function removeSearch(text) {
  state.searches = state.searches.filter((item) => item !== text)
  save(SEARCHES_KEY, state.searches)
}

function addRecord({ id, title, rectypeId, thumbnailUrl }) {
  if (id === undefined || id === null) {
    return
  }
  const entry = { id: Number(id), title: title || '', rectypeId: rectypeId ?? null, thumbnailUrl: thumbnailUrl || '', at: Date.now() }
  state.records = [entry, ...state.records.filter((item) => item.id !== entry.id)].slice(0, MAX_ITEMS)
  save(RECORDS_KEY, state.records)
}

function addScan(code, meta) {
  const value = String(code || '').trim()
  if (!value) {
    return
  }
  const entry = { code: value, at: Date.now(), ...(meta || {}) }
  state.scans = [entry, ...state.scans.filter((item) => item.code !== value)].slice(0, MAX_ITEMS)
  save(SCANS_KEY, state.scans)
}

function clear() {
  state.searches = []
  state.records = []
  state.scans = []
  localStorage.removeItem(SEARCHES_KEY)
  localStorage.removeItem(RECORDS_KEY)
  localStorage.removeItem(SCANS_KEY)
}

export function useRecent() {
  return {
    state,
    addSearch,
    removeSearch,
    addRecord,
    addScan,
    clear
  }
}
