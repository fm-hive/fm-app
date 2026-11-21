import { apiUrlToAppUrl } from '../services/invite'

/**
 * Public app URL stored in full exports (#359).
 *
 * The backup carries the web app URL, not the API endpoint: clients derive the
 * API URL with appUrlToApiUrl ("/app" -> "/api", otherwise append "/api").
 * The value is always absolute and has no trailing slash.
 */
export function fullExportAppUrl(
  apiBaseUrl,
  origin = (typeof window !== 'undefined' ? window.location.origin : 'http://localhost'),
) {
  const raw = String(apiBaseUrl || '/api').trim()
  let absolute
  try {
    const url = new URL(raw, origin)
    url.search = ''
    url.hash = ''
    absolute = url.href.replace(/\/+$/, '')
  } catch {
    absolute = raw.replace(/\/+$/, '')
  }
  return apiUrlToAppUrl(absolute)
}
