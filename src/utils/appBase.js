/**
 * Runtime deployment paths (#338 follow-up): the app is built without a URL —
 * the deployment sets the base path in `fm-config.js`, which the index.html
 * bootstrap turns into a `<base>` tag before the assets load. Everything in
 * the app derives its paths from the document base at runtime:
 *
 *   base path   /<prefix>/app/   (router, deep links)
 *   API         /<prefix>/api    (sibling of the app directory)
 *   docs        /<prefix>/docs   (sibling of the app directory)
 */

/** Deployment path of the app from the document base, always with a trailing slash. */
export function appBasePath() {
  let path = '/'
  try {
    path = new URL(document.baseURI || window.location.href, window.location.href).pathname
  } catch {
    path = window.location.pathname || '/'
  }
  return path.endsWith('/') ? path : path + '/'
}

/** Sibling path of the app base: …/app/ → …/<name>. */
function siblingPath(name) {
  const base = appBasePath().replace(/\/+$/, '') // /pre/app
  const parent = base.replace(/\/[^/]*$/, '') // /pre ('' when the app is at the root)
  return `${parent}/${name}`
}

/** Node API base (the app and the API are siblings: …/app → …/api). */
export function apiBasePath() {
  return siblingPath('api')
}

/** Documentation base (…/app → …/docs). */
export function docsBasePath() {
  return siblingPath('docs')
}
