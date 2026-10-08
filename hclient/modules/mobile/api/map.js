import { apiRequest } from './client.js'

// POST /api/{db}/map → streamed GeoJSON FeatureCollection with a trailing
// `meta` block ({totalRecords, returnedRecords, returnedFeatures, isPartial}).
// Viewport is passed as `extent` ([west, south, east, north]), the contract
// understood by srv/Records/Map/MapFeatureService.php.
export async function fetchMapFeatures({ query, q, ids, extent, limit = 2000, signal } = {}) {
  const body = {}
  if (ids !== undefined && ids !== null) {
    body.ids = Array.isArray(ids) ? ids.map(Number) : [Number(ids)]
  } else if (query !== undefined && query !== null) {
    body.query = query
  } else if (q !== undefined && q !== null && q !== '') {
    body.q = q
  }
  if (extent) {
    body.extent = extent
  }
  if (limit) {
    body.limit = limit
  }
  const data = await apiRequest('map', { method: 'POST', body, signal })
  const payload = data && data.data && Array.isArray(data.data.features) ? data.data : data
  const features = payload && Array.isArray(payload.features) ? payload.features : []
  const meta = (payload && payload.meta) || null
  return {
    features,
    meta,
    total: Number((meta && meta.totalRecords) ?? features.length) || 0,
    truncated: Boolean(meta && meta.isPartial)
  }
}
