import { apiRequest, absoluteUrl, serverRoot } from '../api/client.js'
import { useAuth } from '../store/auth.js'

const IMAGE_MIME = /^image\//i

function valuesOf(group) {
  if (Array.isArray(group)) {
    return group
  }
  if (group && typeof group === 'object') {
    return Object.values(group)
  }
  return group === null || group === undefined ? [] : [group]
}

// Details arrive keyed dtyID -> dtlID -> value (or dtyID -> [values]); normalise
// to dtyID -> [values] with empty values dropped.
export function normalizeDetails(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') {
    return out
  }
  for (const [key, group] of Object.entries(raw)) {
    const dty = String(Number(key))
    if (dty === 'NaN') {
      continue
    }
    const values = valuesOf(group).filter((value) => value !== null && value !== undefined && value !== '')
    if (values.length) {
      out[dty] = values
    }
  }
  return out
}

export function fileUrl(db, fileId) {
  if (!db || fileId === null || fileId === undefined || fileId === '') {
    return ''
  }
  return serverRoot() + 'hserv/controller/fileDownload.php?db=' + encodeURIComponent(db) +
    '&file=' + encodeURIComponent(fileId)
}

export function fileThumbUrl(db, fileId) {
  if (!db || fileId === null || fileId === undefined || fileId === '') {
    return ''
  }
  return serverRoot() + 'hserv/controller/fileDownload.php?db=' + encodeURIComponent(db) +
    '&thumb=' + encodeURIComponent(fileId)
}

export function fileValue(db, value) {
  const info = value.file && typeof value.file === 'object' ? value.file : value
  const id = value.fileid ?? info.fileid ?? info.ulf_ObfuscatedFileID ?? info.ulf_ID
  const external = info.ulf_ExternalFileReference || info.external || ''
  const mime = String(info.ulf_MimeExt ?? info.mimeType ?? '')
  const name = info.ulf_OrigFileName || info.ulf_Caption || info.filename || ''
  const url = external ? absoluteUrl(external) : fileUrl(db, id)
  if (!url) {
    return null
  }
  return { url, thumb: IMAGE_MIME.test(mime) ? fileThumbUrl(db, id) : '', name: String(name), image: IMAGE_MIME.test(mime) && Boolean(fileThumbUrl(db, id) || url) }
}

function firstImage(details, db) {
  for (const values of Object.values(details)) {
    for (const value of values) {
      if (value && typeof value === 'object' && (value.file || value.fileid || value.ulf_ObfuscatedFileID)) {
        const file = fileValue(db, value)
        if (file && file.thumb) {
          return file.thumb
        }
      }
    }
  }
  return ''
}

// Accepts a raw API record ({rec_ID, rec_Title, rec_RecTypeID, details}) or an
// already-normalised {id, title, rectypeId} object.
export function normalizeRecord(raw, db) {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const id = Number(raw.rec_ID ?? raw.id)
  if (!Number.isFinite(id) || id <= 0) {
    return null
  }
  const details = normalizeDetails(raw.details ?? raw.d)
  const database = db || useAuth().state.db
  const thumbnailUrl = String(raw.rec_ThumbnailURL ?? raw.thumbnailUrl ?? '') || firstImage(details, database)
  return {
    id,
    title: String(raw.rec_Title ?? raw.title ?? ''),
    rectypeId: Number(raw.rec_RecTypeID ?? raw.rectypeId ?? raw.rectype) || null,
    details,
    thumbnailUrl
  }
}

// The records API returns a flat {records, meta, pagination} document; older
// wrappers may present it as {data: {...}}. Handles both.
export function normalizeSearchResponse(data, { offset = 0, limit = 0 } = {}) {
  const payload = data && typeof data === 'object' && data.data && typeof data.data === 'object'
    ? data.data
    : (data || {})
  const rows = Array.isArray(payload.records) ? payload.records : []
  const records = rows.map((row) => normalizeRecord(row)).filter(Boolean)
  const pagination = payload.pagination || {}
  const reported = Number(pagination.total ?? payload.count ?? payload.total ?? payload.reccount)
  const total = Number.isFinite(reported) && reported >= 0 ? reported : offset + records.length
  return { records, total, offset, limit }
}

export async function queryRecords({ q, ids, detail = 'header', limit = 30, offset = 0, signal } = {}) {
  const params = { detail, limit, offset }
  if (q) {
    params.q = q
  }
  if (ids !== undefined && ids !== null) {
    params.ids = Array.isArray(ids) ? ids.join(',') : String(ids)
  }
  const data = await apiRequest('records', { query: params, signal })
  return normalizeSearchResponse(data, { offset, limit })
}

// Free-text search across all indexed fields; quotes in user input are stripped.
export function freeTextQuery(text) {
  const value = String(text || '').trim().replace(/["*]/g, ' ').trim()
  return value ? 'f:"' + value + '"' : ''
}

export function pointerValues(field, values) {
  return values
    .map((value) => {
      if (value && typeof value === 'object') {
        return { id: Number(value.id ?? value.recordID ?? value.ID ?? 0), title: String(value.title ?? value.label ?? '') }
      }
      return { id: Number(value), title: '' }
    })
    .filter((pointer) => pointer.id > 0)
}

export function geoPoints(values) {
  const points = []
  for (const value of values) {
    let wkt = ''
    if (value && typeof value === 'object') {
      const geo = value.geo && typeof value.geo === 'object' ? value.geo : value
      wkt = String(geo.wkt ?? geo.WKT ?? '')
      if (!wkt && Number.isFinite(Number(geo.lat ?? geo.latitude)) && Number.isFinite(Number(geo.lon ?? geo.lng ?? geo.longitude))) {
        points.push({ lat: Number(geo.lat ?? geo.latitude), lon: Number(geo.lon ?? geo.lng ?? geo.longitude) })
        continue
      }
    } else if (typeof value === 'string') {
      wkt = value
    }
    const match = wkt.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i)
    if (match) {
      // WKT axis order for Heurist geo values is lon lat
      points.push({ lon: Number(match[1]), lat: Number(match[2]) })
    }
  }
  return points
}

export function temporalText(value) {
  const parse = (input) => {
    if (input && typeof input === 'object') {
      const parts = [input.earliest ?? input.start ?? input.from, input.latest ?? input.end ?? input.to]
        .map((part) => (part === null || part === undefined || part === '' ? '' : String(part)))
      const unique = Array.from(new Set(parts.filter(Boolean)))
      if (unique.length) {
        return unique.join(' – ')
      }
      return ''
    }
    const text = String(input ?? '').trim()
    if (text.startsWith('{')) {
      try {
        return parse(JSON.parse(text))
      } catch {
        return text
      }
    }
    return text
  }
  return parse(value)
}

export function fieldText(field, value, termLabel) {
  if (value === null || value === undefined) {
    return ''
  }
  if (field.type === 'date' || field.type === 'year') {
    return temporalText(value)
  }
  if (typeof value !== 'object') {
    if ((field.type === 'enum' || field.type === 'relationtype') && termLabel) {
      return termLabel(value)
    }
    return String(value)
  }
  const text = value.text ?? value.label ?? value.title ?? value.value ?? value.wkt ?? ''
  return String(text)
}

export function isUrlText(text) {
  return /^https?:\/\//i.test(String(text || ''))
}
