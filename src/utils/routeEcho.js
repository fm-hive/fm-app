// Route helpers for echo navigation (#312).

/**
 * Resolve an `?echo=<name>` route query to a selectable target.
 * Dashboard and search links use the query form; the Echoes view turns it into
 * the canonical `/echoes/:id` route.
 * @param {string} queryEcho - value of route.query.echo
 * @param {Array} echoes - echo list ({id, name})
 * @param {Array} blogs - local blogs ({name})
 * @returns {{kind: 'echo'|'blog', name: string}|null}
 */
export function resolveQueryEcho(queryEcho, echoes, blogs = []) {
  if (typeof queryEcho !== 'string' || !queryEcho) return null
  const echo = (echoes || []).find(e => e.name === queryEcho)
  if (echo) return { kind: 'echo', name: echo.name }
  const blog = (blogs || []).find(b => b.name === queryEcho)
  if (blog) return { kind: 'blog', name: blog.name }
  return null
}
