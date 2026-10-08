import { apiRequest } from './client.js'

export async function fetchGraph({ query, q, ids, links, limits, rule, signal } = {}) {
  const body = {}
  if (ids !== undefined && ids !== null && (!Array.isArray(ids) || ids.length)) {
    body.ids = Array.isArray(ids) ? ids.map(Number) : [Number(ids)]
  } else if (query !== undefined && query !== null) {
    body.query = query
  } else if (q) {
    body.q = q
  }
  if (links) {
    body.links = links
  }
  if (rule) {
    body.rule = rule
  }
  const mergedLimits = Object.assign({ maxNodes: 200, maxDepth: 1 }, limits)
  body.limits = mergedLimits
  const data = await apiRequest('graph', { method: 'POST', body, signal })
  const payload = data && data.data ? data.data : data || {}
  return {
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    edges: Array.isArray(payload.edges) ? payload.edges : (Array.isArray(payload.links) ? payload.links : []),
    truncated: Boolean(payload.truncated)
  }
}
