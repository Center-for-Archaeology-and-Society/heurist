import { apiRequest } from './client.js'

function buildQuery(params) {
  const out = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    out[key] = value
  }
  return out
}

export async function searchRecords(options = {}) {
  const { query, q, ids, fields, detail = 'header', limit = 30, offset = 0, sort, signal } = options
  const params = buildQuery({ detail, limit, offset, sort })
  if (query !== undefined && query !== null) {
    params.query = typeof query === 'string' ? query : JSON.stringify(query)
  } else if (q) {
    params.q = q
  }
  if (ids !== undefined && ids !== null) {
    params.ids = Array.isArray(ids) ? ids.join(',') : String(ids)
  }
  if (fields) {
    params.fields = Array.isArray(fields) ? fields.join(',') : fields
  }
  const data = await apiRequest('records', { query: params, signal })
  // The modern REST API streams a flat {records, meta, pagination} document;
  // some legacy endpoints wrap it in {data:{records, count, ...}}
  const payload = (data && typeof data.data === 'object' && data.data) || data || {}
  let records = Array.isArray(payload.records) ? payload.records : undefined
  if (!Array.isArray(records) && Array.isArray(payload.ids)) {
    records = payload.ids.map((id) => ({ rec_ID: Number(id) }))
  }
  const pagination = payload.pagination || {}
  return {
    records: Array.isArray(records) ? records : [],
    total: Number(pagination.total ?? payload.count ?? payload.total ?? payload.reccount ?? (records ? records.length : 0)) || 0,
    offset: Number(pagination.offset ?? offset) || 0,
    limit
  }
}

export async function getRecord(id, { detail = 'detail', signal } = {}) {
  const data = await apiRequest('records/' + encodeURIComponent(id), {
    query: buildQuery({ detail }),
    signal
  })
  const payload = (data && typeof data.data === 'object' && data.data) || data || {}
  if (Array.isArray(payload.records) && payload.records.length) {
    return payload.records[0]
  }
  if (payload && payload.rec_ID !== undefined) {
    return payload
  }
  if (Array.isArray(payload) && payload.length) {
    return payload[0]
  }
  return null
}

export async function createRecord(record, { signal } = {}) {
  return apiRequest('records', { method: 'POST', body: record, signal })
}

export async function updateRecord(id, record, { signal } = {}) {
  return apiRequest('records/' + encodeURIComponent(id), { method: 'PUT', body: record, signal })
}

export async function deleteRecord(id, { signal } = {}) {
  return apiRequest('records/' + encodeURIComponent(id), { method: 'DELETE', signal })
}
