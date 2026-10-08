import { apiRequest } from './client.js'

// External lookup services exposed by POST /api/{db}/lookup/{service} with
// body {value} (hserv/controller/LookupController.php::applyDirectValueLookup).
export const LOOKUP_SERVICES = [
  { id: 'bnflibrary_bib', label: 'BnF catalogue', hint: 'ISBN / EAN book codes' },
  { id: 'geonames', label: 'GeoNames', hint: 'Place names' },
  { id: 'tlcmap', label: 'TLCMap', hint: 'Australian places' },
  { id: 'nomisma', label: 'Nomisma', hint: 'Numismatic identifiers' },
  { id: 'orcid', label: 'ORCID', hint: 'Researcher IDs' }
]

const ISBN_RE = /^(97[89][-\s]?)?\d{9}[\dxX]$|^97[89][-\s]?\d{1,5}[-\s]?\d+[-\s]?\d+[-\s]?[\dxX]$/
const EAN_RE = /^\d{13}$/
const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$|orcid\.org\//i

export function suggestService(code) {
  const value = String(code || '').trim()
  if (ORCID_RE.test(value)) {
    return 'orcid'
  }
  if (EAN_RE.test(value) || ISBN_RE.test(value.replace(/[-\s]/g, ''))) {
    return 'bnflibrary_bib'
  }
  return 'geonames'
}

function joinValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => joinValue(item)).filter(Boolean).join('; ')
  }
  if (value === null || value === undefined || value === '') {
    return ''
  }
  return String(value)
}

function scalarFields(object, keys) {
  const fields = []
  for (const [label, key] of keys) {
    const text = joinValue(object[key])
    if (text) {
      fields.push([label, text])
    }
  }
  return fields
}

function bnfEntries(data) {
  const rows = data && Array.isArray(data.result) ? data.result : []
  return rows.map((row) => {
    const authors = row.author ? Object.values(row.author) : []
    const authorText = authors
      .map((a) => [a && (a.surname || a.name), a && a.firstname].filter(Boolean).join(', '))
      .filter(Boolean).join('; ')
    const publishers = Array.isArray(row.publisher)
      ? row.publisher.map((p) => [p && p.name, p && p.location].filter(Boolean).join(' ')).filter(Boolean).join('; ')
      : ''
    const fields = [
      ['Author', authorText],
      ['Publisher', publishers],
      ...scalarFields(row, [
        ['Date', 'date'], ['ISBN', 'isbn'], ['Language', 'language'],
        ['Description', 'description'], ['URL', 'biburl']
      ])
    ].filter(([, value]) => value)
    return {
      id: row.BnF_ID || row.biburl || '',
      title: joinValue(row.title) || 'BnF record',
      subtitle: joinValue(row.type),
      fields
    }
  })
}

function geonamesEntries(data) {
  const rows = data && (Array.isArray(data.geonames) ? data.geonames : Array.isArray(data.postalcodes) ? data.postalcodes : [])
  return rows.map((row) => ({
    id: row.geonameId || row.id || '',
    title: joinValue(row.name || row.placeName) || 'Place',
    subtitle: joinValue(row.countryCode || row.countryName),
    fields: scalarFields(row, [
      ['Country', 'countryName'], ['Region', 'adminName1'], ['Latitude', 'lat'],
      ['Longitude', 'lng'], ['Population', 'population']
    ])
  }))
}

function tlcmapEntries(data) {
  const features = data && Array.isArray(data.features) ? data.features : []
  return features.map((feature) => {
    const props = (feature && feature.properties) || {}
    const coords = feature && feature.geometry && feature.geometry.coordinates
    const fields = scalarFields(props, [
      ['State', 'state'], ['Local government', 'lga'], ['Type', 'category'],
      ['Description', 'description'], ['Latitude', 'latitude'], ['Longitude', 'longitude'], ['TLCMap', 'tlcmap_url']
    ])
    return {
      id: props.id || '',
      title: joinValue(props.name) || 'Place',
      subtitle: props.state ? joinValue(props.state) : '',
      fields,
      coordinates: Array.isArray(coords) ? coords.slice(0, 2) : null
    }
  })
}

function orcidEntries(data) {
  if (!data || typeof data !== 'object') {
    return []
  }
  const title = [data['given-names'], data['family-name']].filter(Boolean).join(' ')
  return [{
    id: joinValue(data.orcid),
    title: title || 'ORCID record',
    subtitle: joinValue(data.employment),
    fields: scalarFields(data, [
      ['ORCID', 'orcid'], ['Employment', 'employment'], ['Keywords', 'keywords'], ['URL', 'url']
    ])
  }]
}

function genericEntry(object) {
  const fields = []
  let title = ''
  for (const [key, value] of Object.entries(object)) {
    const text = joinValue(value && typeof value === 'object' ? '' : value)
    if (!text) {
      continue
    }
    if (!title && /^(title|name|label)$/i.test(key)) {
      title = text
    } else if (fields.length < 8) {
      fields.push([key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), text])
    }
  }
  return { title: title || 'Result', fields }
}

function genericEntries(data) {
  const rows = Array.isArray(data) ? data
    : data && typeof data === 'object'
      ? (Object.values(data).find(Array.isArray) || [data])
      : []
  return rows
    .filter((row) => row && typeof row === 'object')
    .map(genericEntry)
    .map((entry) => ({ id: '', subtitle: '', ...entry }))
}

export function normalizeLookupResult(service, data) {
  if (!data || typeof data !== 'object') {
    return []
  }
  if (service.startsWith('bnf')) {
    return bnfEntries(data)
  }
  if (service === 'geonames') {
    return geonamesEntries(data)
  }
  if (service === 'tlcmap') {
    return tlcmapEntries(data)
  }
  if (service === 'orcid') {
    return orcidEntries(data)
  }
  return genericEntries(data)
}

export async function lookup(service, value, { signal } = {}) {
  if (!service) {
    throw new TypeError('lookup: service is required')
  }
  const data = await apiRequest('lookup/' + encodeURIComponent(service), {
    method: 'POST',
    body: { value },
    signal
  })
  const payload = data && data.data ? data.data : data
  return {
    service,
    value,
    raw: payload,
    entries: normalizeLookupResult(service, payload)
  }
}
