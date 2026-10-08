import { apiRequest } from './client.js'

export async function listFilters({ signal } = {}) {
  const data = await apiRequest('sys/filter', { query: { limit: 200 }, signal })
  const payload = data && data.data
  const rows = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.records) ? payload.records : [])
  return rows.map((row) => ({
    id: Number(row.svs_ID ?? row.id ?? 0),
    name: row.svs_Name ?? row.name ?? '',
    query: row.svs_Query ?? row.query ?? '',
    ownerId: Number(row.svs_UGrpID ?? row.ownerId ?? 0),
    raw: row
  }))
}

export async function saveFilter({ name, query, rtyId }, { signal } = {}) {
  const body = { name, query }
  if (rtyId) {
    body.rty = rtyId
  }
  return apiRequest('sys/filter', { method: 'POST', body, signal })
}

export async function deleteFilter(id, { ownerId, signal } = {}) {
  const params = new URLSearchParams()
  if (ownerId != null && ownerId !== 0) {
    // svsDelete scopes deletion to svs_UGrpID; group-owned filters need it
    params.set('UGrpID', String(ownerId))
  }
  const qs = params.toString()
  return apiRequest('sys/filter/' + encodeURIComponent(id) + (qs ? '?' + qs : ''), { method: 'DELETE', signal })
}

export function filterToQuery(filter) {
  const raw = String(filter.query || '').trim()
  if (!raw) {
    return ''
  }
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.q === 'string') {
        return parsed.q
      }
      return parsed
    } catch {
      return raw
    }
  }
  if (raw.startsWith('?')) {
    const params = new URLSearchParams(raw.slice(1))
    return params.get('q') || ''
  }
  return raw
}
