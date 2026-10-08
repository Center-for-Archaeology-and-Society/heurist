import { apiRequest } from './client.js'

export async function fetchMapFeatures({ query, q, ids, bbox, limit = 2000, signal } = {}) {
  const body = {}
  if (ids !== undefined && ids !== null) {
    body.ids = Array.isArray(ids) ? ids.map(Number) : [Number(ids)]
  } else if (query !== undefined && query !== null) {
    body.query = query
  } else if (q) {
    body.q = q
  } else {
    body.q = ''
  }
  if (bbox) {
    body.bbox = bbox
  }
  if (limit) {
    body.limit = limit
  }
  const data = await apiRequest('map', { method: 'POST', body, signal })
  if (data && Array.isArray(data.features)) {
    return data
  }
  if (data && data.data && Array.isArray(data.data.features)) {
    return data.data
  }
  return { type: 'FeatureCollection', features: [] }
}
