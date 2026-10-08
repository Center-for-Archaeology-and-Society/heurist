import { apiRequest, ApiError } from './client.js'

// POST /api/{db}/graph → { query, total, graph: { records, edges, limits } }
// where records are {rec_ID, rec_Title, rec_RecTypeID} and edges are
// {id, source, target, field, relationship} (srv/Records/Graph/GraphResult.php).
// A one-hop expansion from the seed records is requested with the compact
// rule path "*:connected:*" (ExpansionRuleParser); servers that predate the
// rule step fall back to `links: 'all'` (edges among seed records only).
const DEFAULT_LIMITS = { maxNodes: 200, maxEdges: 500, maxDepth: 1 }
const ONE_HOP_RULE = '*:connected:*'

function normalizeNode(raw) {
  if (raw === null || typeof raw !== 'object') {
    return { id: Number(raw), title: '', rectype: null }
  }
  return {
    id: Number(raw.rec_ID ?? raw.id),
    title: String(raw.rec_Title ?? raw.title ?? raw.label ?? ''),
    rectype: raw.rec_RecTypeID ?? raw.rectype ?? null
  }
}

function normalizeEdge(raw) {
  if (raw === null || typeof raw !== 'object') {
    return { id: String(raw), source: NaN, target: NaN }
  }
  return {
    id: String(raw.id ?? raw.source + ':' + raw.target),
    source: Number(raw.source),
    target: Number(raw.target)
  }
}

export async function fetchGraph({ query, q, ids, links, rule = ONE_HOP_RULE, limits, signal } = {}) {
  const body = {}
  if (ids !== undefined && ids !== null && (!Array.isArray(ids) || ids.length)) {
    body.ids = Array.isArray(ids) ? ids.map(Number) : [Number(ids)]
  } else if (query !== undefined && query !== null && query !== '') {
    body.query = query
  } else if (q !== undefined && q !== null && q !== '') {
    body.q = q
  }
  if (links) {
    body.links = links
  } else if (rule) {
    body.rule = rule
  }
  body.limits = { ...DEFAULT_LIMITS, ...limits }

  let data
  try {
    data = await apiRequest('graph', { method: 'POST', body, signal })
  } catch (err) {
    if (rule && err instanceof ApiError && (err.status === 400 || err.status === 422)) {
      return fetchGraph({ query, q, ids, links: 'all', rule: null, limits, signal })
    }
    throw err
  }

  const payload = data && data.data ? data.data : data || {}
  const graph = payload.graph || payload
  const rawNodes = Array.isArray(graph.records)
    ? graph.records
    : Array.isArray(payload.nodes) ? payload.nodes : []
  const rawEdges = Array.isArray(graph.edges)
    ? graph.edges
    : Array.isArray(payload.edges) ? payload.edges : []
  const limitInfo = graph.limits || {}
  return {
    nodes: rawNodes.map(normalizeNode).filter((node) => Number.isFinite(node.id)),
    edges: rawEdges.map(normalizeEdge)
      .filter((edge) => Number.isFinite(edge.source) && Number.isFinite(edge.target)),
    truncated: Boolean(payload.truncated ?? limitInfo.truncated),
    total: Number(payload.total ?? rawNodes.length) || 0
  }
}
