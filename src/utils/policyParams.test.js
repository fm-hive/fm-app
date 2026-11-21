import { describe, expect, it } from 'vitest'
import { POLICY_PARAM_DEFS, networkNameFromParameters, specialEchoName } from './policyParams'

describe('networkNameFromParameters', () => {
  it('returns the configured network name', () => {
    expect(networkNameFromParameters({ net_name: 'MyNet' })).toBe('MyNet')
  })

  it('trims surrounding whitespace', () => {
    expect(networkNameFromParameters({ net_name: '  MyNet  ' })).toBe('MyNet')
  })

  it('falls back to FM for missing or blank values', () => {
    expect(networkNameFromParameters({})).toBe('FM')
    expect(networkNameFromParameters(null)).toBe('FM')
    expect(networkNameFromParameters({ net_name: '   ' })).toBe('FM')
  })

  it('exposes net_name as an editable policy field', () => {
    const def = POLICY_PARAM_DEFS.find(item => item.key === 'net_name')
    expect(def).toMatchObject({ key: 'net_name', type: 'text' })
  })
})


describe('specialEchoName', () => {
  it('uses the policy name and falls back when absent', () => {
    const params = { special_echogroups: { admin: 'Council', moderators: 'Mods' } }
    expect(specialEchoName(params, 'admin', 'Admin council')).toBe('Council')
    expect(specialEchoName(params, 'moderators', 'Moderators council')).toBe('Mods')
    expect(specialEchoName(params, 'network_news', 'Network news')).toBe('Network news')
    expect(specialEchoName({}, 'admin', 'Admin council')).toBe('Admin council')
    expect(specialEchoName(null, 'admin', 'Admin council')).toBe('Admin council')
  })
})
