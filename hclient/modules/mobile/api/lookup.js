import { apiRequest } from './client.js'

export async function lookup(service, value, { signal } = {}) {
  if (!service) {
    throw new TypeError('lookup: service is required')
  }
  const data = await apiRequest('lookup/' + encodeURIComponent(service), {
    method: 'POST',
    body: { value },
    signal
  })
  return data && data.data ? data.data : data
}
