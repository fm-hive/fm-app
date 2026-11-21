import { describe, expect, it } from 'vitest'
import { fullExportAppUrl } from '../../src/utils/fullExport.js'

describe('full export app URL', () => {
  it('converts an API base with a deployment prefix to the app URL', () => {
    expect(fullExportAppUrl('https://2.28.13.140/msoijwer43asdf/api'))
      .toBe('https://2.28.13.140/msoijwer43asdf/app')
  })

  it('resolves a relative API base against the current origin', () => {
    expect(fullExportAppUrl('/prefix/api', 'https://host.example'))
      .toBe('https://host.example/prefix/app')
  })

  it('does not produce a double /api and drops query/hash', () => {
    expect(fullExportAppUrl('https://host/prefix/api/?x=1#top'))
      .toBe('https://host/prefix/app')
  })

  it('keeps the deployment prefix when the API suffix is absent', () => {
    expect(fullExportAppUrl('https://host/prefix', 'https://host'))
      .toBe('https://host/prefix/app')
  })
})
