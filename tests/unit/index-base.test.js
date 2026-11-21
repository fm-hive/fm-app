import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

function extractScripts(source) {
  return [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
}

const scripts = extractScripts(html)
const detect = scripts.find(s => s.includes('/app'))
const apply = scripts.find(s => s.includes('__FM_CONFIG__'))
const staticBase = (html.match(/<base href="([^"]*)" \/>/) || [])[1]

function makeTag(tagName) {
  return {
    tagName,
    attrs: {},
    parentNode: null,
    setAttribute(name, value) {
      this.attrs[name] = value
    },
    getAttribute(name) {
      return this.attrs[name] ?? null
    },
  }
}

function makeHead(staticHref) {
  const head = {
    tags: [],
    firstChild: {},
    insertBefore(node) {
      node.parentNode = head
      head.tags.unshift(node)
    },
    removeChild(node) {
      const i = head.tags.indexOf(node)
      if (i >= 0) head.tags.splice(i, 1)
    },
    querySelector(sel) {
      return sel === 'base' ? head.tags.find(t => t.tagName === 'base') || null : null
    },
  }
  if (staticHref) {
    const tag = makeTag('base')
    tag.setAttribute('href', staticHref)
    tag.parentNode = head
    head.tags.push(tag)
  }
  return head
}

// Runs the real inline scripts from index.html (path detection first, then
// the fm-config.js value) with stubbed globals; returns the final base href.
function runBootstrap(pathname, cfg, staticHref = staticBase) {
  const document = {
    head: makeHead(staticHref),
    createElement(tagName) {
      return makeTag(tagName)
    },
  }
  const window = { __FM_CONFIG__: cfg, location: { pathname } }
  const run = src => new Function('window', 'document', src)(window, document)
  run(detect)
  run(apply)
  const base = document.head.querySelector('base')
  return base ? base.getAttribute('href') : null
}

describe('deployment base bootstrap (#343)', () => {
  it('finds the static default, both scripts, and their order', () => {
    expect(staticBase).toBe('/app/')
    expect(detect).toBeTruthy()
    expect(apply).toBeTruthy()
    expect(html.indexOf(staticBase)).toBeLessThan(html.indexOf(detect))
    const configAt = html.indexOf('src="./fm-config.js"')
    expect(html.indexOf(detect)).toBeLessThan(configAt)
    expect(configAt).toBeLessThan(html.indexOf(apply))
  })

  it('keeps a deploy.sh-patched base on a deep link', () => {
    expect(runBootstrap('/msoijwer43asdf/app/echoes/8', undefined, '/msoijwer43asdf/app/')).toBe(
      '/msoijwer43asdf/app/'
    )
  })

  it('recovers the base from a deep link when only fm-config.js was edited', () => {
    expect(runBootstrap('/pre/app/echoes/8', undefined)).toBe('/pre/app/')
    expect(
      runBootstrap('/sdfglj54t05jslkfls/app/echoes/1/reader/vote_:0:0_1792095232_b465161a', undefined)
    ).toBe('/sdfglj54t05jslkfls/app/')
  })

  it('handles paths without a trailing slash and the plain /app/ deployment', () => {
    expect(runBootstrap('/pre/app', undefined)).toBe('/pre/app/')
    expect(runBootstrap('/app', undefined)).toBe('/app/')
    expect(runBootstrap('/app/echoes/1', undefined)).toBe('/app/')
  })

  it('takes the first /app/ segment (routes may contain "app" too)', () => {
    expect(runBootstrap('/pre/app/echoes/app/1', undefined)).toBe('/pre/app/')
  })

  it('keeps a more specific configured base (prefix containing /app/)', () => {
    expect(runBootstrap('/app/x/app/echoes/1', undefined, '/app/x/app/')).toBe('/app/x/app/')
  })

  it('lets the fm-config.js base win over the detection', () => {
    expect(runBootstrap('/pre/app/echoes/8', { base: '/other/app/' })).toBe('/other/app/')
    expect(runBootstrap('/pre/app/', { base: '/pre/app/' })).toBe('/pre/app/')
  })

  it('uses the config when the path has no /app/ (non-standard mount)', () => {
    expect(runBootstrap('/vanilla/echoes/8', { base: '/vanilla/' })).toBe('/vanilla/')
  })

  it('inserts nothing without a config and without /app/ in the path', () => {
    expect(runBootstrap('/echoes/1', undefined)).toBe(null)
    expect(runBootstrap('/', {})).toBe(null)
  })
})
