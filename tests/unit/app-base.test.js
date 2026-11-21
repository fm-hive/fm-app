import { describe, it, expect, afterEach } from 'vitest'
import { appBasePath, apiBasePath, docsBasePath } from '../../src/utils/appBase'

function setBase(href) {
  document.head.querySelectorAll('base').forEach(b => b.remove())
  if (href) {
    const base = document.createElement('base')
    base.href = href
    document.head.appendChild(base)
  }
}

describe('runtime deployment paths (#338)', () => {
  afterEach(() => setBase(null))

  it('defaults to the document path (jsdom root)', () => {
    expect(appBasePath()).toBe('/')
    expect(apiBasePath()).toBe('/api')
    expect(docsBasePath()).toBe('/docs')
  })

  it('derives the router, API and docs paths from the <base> tag', () => {
    setBase('/sjlkhfgiuwerti/app/')
    expect(appBasePath()).toBe('/sjlkhfgiuwerti/app/')
    expect(apiBasePath()).toBe('/sjlkhfgiuwerti/api')
    expect(docsBasePath()).toBe('/sjlkhfgiuwerti/docs')
  })

  it('works for the plain /app/ deployment', () => {
    setBase('/app/')
    expect(appBasePath()).toBe('/app/')
    expect(apiBasePath()).toBe('/api')
    expect(docsBasePath()).toBe('/docs')
  })

  it('normalizes a base without a trailing slash', () => {
    setBase('/app')
    expect(appBasePath()).toBe('/app/')
    expect(apiBasePath()).toBe('/api')
  })
})
