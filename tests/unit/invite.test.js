import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseInviteURL,
  buildInviteURL,
  apiUrlToAppUrl,
  appUrlToApiUrl,
  saveInvite,
  loadInvite,
  clearInvite,
  rememberVoucherDisabled,
  isVoucherDisabled,
  isVouchersDisabledError,
  bytesToBase64,
  nodeAddressFromUser,
} from '../../src/services/invite.js'

describe('invite URL helpers', () => {
  it('converts app URLs to API URLs', () => {
    expect(appUrlToApiUrl('https://host:8443/app')).toBe('https://host:8443/api')
    expect(appUrlToApiUrl('https://host:8443/xyz/app')).toBe('https://host:8443/xyz/api')
    expect(appUrlToApiUrl('https://host:8443')).toBe('https://host:8443/api')
    expect(appUrlToApiUrl('https://host:8443/api')).toBe('https://host:8443/api')
    expect(appUrlToApiUrl('')).toBe('/api')
  })

  it('converts API URLs to app URLs', () => {
    expect(apiUrlToAppUrl('https://host:8443/api')).toBe('https://host:8443/app')
    expect(apiUrlToAppUrl('https://host:8443/xyz/api')).toBe('https://host:8443/xyz/app')
    expect(apiUrlToAppUrl('https://host:8443')).toBe('https://host:8443/app')
  })

  it('builds and parses an invite URL with pubkey and voucher', () => {
    const pubkey = new Uint8Array([1, 2, 3, 4, 250])
    const url = buildInviteURL('https://host:8443/app', { pubkey, voucher: 'abc123' })

    expect(url).toContain('https://host:8443/app/?')
    expect(url).toContain('voucher=abc123')

    const parsed = parseInviteURL(url)
    expect(parsed.appUrl).toBe('https://host:8443/app')
    expect(parsed.baseUrl).toBe('https://host:8443/api')
    expect(parsed.voucher).toBe('abc123')
    expect(Array.from(parsed.pubkey)).toEqual([1, 2, 3, 4, 250])
  })

  it('keeps a random URL path prefix', () => {
    const url = buildInviteURL('https://host:8443/xyz/app', { voucher: 'v1' })
    const parsed = parseInviteURL(url)
    expect(parsed.baseUrl).toBe('https://host:8443/xyz/api')
    expect(parsed.voucher).toBe('v1')
    expect(parsed.pubkey).toBeNull()
  })

  it('parses a plain node URL without params', () => {
    const parsed = parseInviteURL('https://host:8443/app')
    expect(parsed.pubkey).toBeNull()
    expect(parsed.voucher).toBeNull()
  })

  it('derives the node address from a user address', () => {
    expect(nodeAddressFromUser(':0:1')).toBe(':0:0')
    expect(nodeAddressFromUser(':0:1:2')).toBe(':0:1:0')
    expect(nodeAddressFromUser('')).toBe('')
    expect(nodeAddressFromUser(null)).toBe('')
  })

  it('adds a trailing slash to the app directory in QR links (#386)', () => {
    expect(buildInviteURL('https://host:8443/app', { voucher: 'v1' }))
      .toBe('https://host:8443/app/?voucher=v1')
    expect(buildInviteURL('https://host:8443/app/', { voucher: 'v1' }))
      .toBe('https://host:8443/app/?voucher=v1')
    expect(buildInviteURL('https://host:8443', { voucher: 'v1' }))
      .toBe('https://host:8443/?voucher=v1')
  })

  it('carries the node address in the invite URL', () => {
    const url = buildInviteURL('https://host:8443/app', { voucher: 'v1', address: ':0:0' })
    const parsed = parseInviteURL(url)
    expect(parsed.address).toBe(':0:0')
    expect(parsed.voucher).toBe('v1')
  })

  it('encodes bytes as standard base64 for the API', () => {
    expect(bytesToBase64(new Uint8Array([1, 2, 3, 4]))).toBe('AQIDBA==')
    expect(bytesToBase64(new Uint8Array([250]))).toBe('+g==')
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
    expect(bytesToBase64(null)).toBe('')
  })

  it('returns null for invalid input', () => {
    expect(parseInviteURL('')).toBeNull()
    expect(parseInviteURL(null)).toBeNull()
    expect(parseInviteURL(undefined)).toBeNull()
    expect(parseInviteURL('not a url')).toBeNull()
  })
})

describe('invite storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and loads an invite', () => {
    saveInvite({ pubkey: new Uint8Array([9, 8, 7]), voucher: 'code1' })
    const invite = loadInvite()
    expect(invite.voucher).toBe('code1')
    expect(Array.from(invite.pubkey)).toEqual([9, 8, 7])
  })

  it('clears the invite after registration', () => {
    saveInvite({ voucher: 'code1' })
    clearInvite()
    expect(loadInvite()).toBeNull()
  })

  it('ignores empty invites', () => {
    saveInvite({})
    expect(loadInvite()).toBeNull()
  })

  it('remembers disabled vouchers per node', () => {
    expect(isVoucherDisabled('https://a/api')).toBe(false)
    rememberVoucherDisabled('https://a/api')
    expect(isVoucherDisabled('https://a/api')).toBe(true)
    expect(isVoucherDisabled('https://b/api')).toBe(false)
  })

  it('detects the vouchers-disabled error', () => {
    expect(isVouchersDisabledError(new Error('API error 400: Vouchers are disabled'))).toBe(true)
    expect(isVouchersDisabledError(new Error('other error'))).toBe(false)
  })
})
