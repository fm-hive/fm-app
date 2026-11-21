import { describe, it, expect } from 'vitest'
import { apiErrorMessage } from '../../src/utils/apiErrors'
import { policyErrorMessage } from '../../src/utils/policyErrors'

const t = (key) => key

describe('apiErrorMessage (#209)', () => {
  it('maps 429 to the rate limit hint', () => {
    const err = new Error('API error 429: Too many requests')
    err.status = 429
    expect(apiErrorMessage(err, t)).toBe('errors.rateLimited')
    // Also detected from the message when the status is missing.
    expect(apiErrorMessage(new Error('API error 429: Too many requests'), t)).toBe('errors.rateLimited')
  })

  it('maps 429 in the registration context to the daily cap hint', () => {
    const err = new Error('API error 429: Too many requests')
    err.status = 429
    expect(apiErrorMessage(err, t, { registration: true })).toBe('errors.registrationLimit')
  })

  it('maps 413 to the request-too-large hint', () => {
    const err = new Error('API error 413: Request body too large')
    err.status = 413
    expect(apiErrorMessage(err, t)).toBe('errors.requestTooLarge')
  })

  it('passes other errors through', () => {
    expect(apiErrorMessage(new Error('Authentication failed'), t)).toBe('Authentication failed')
    expect(apiErrorMessage({}, t)).toBe('')
  })
})

describe('policyErrorMessage guards (#209)', () => {
  it('maps the registration cap and the body limit', () => {
    const rateLimited = new Error('API error 429: Too many requests')
    rateLimited.status = 429
    expect(policyErrorMessage(rateLimited, { t })).toBe('errors.registrationLimit')

    const tooLarge = new Error('API error 413: Request body too large')
    tooLarge.status = 413
    expect(policyErrorMessage(tooLarge, { t })).toBe('errors.requestTooLarge')
  })

  it('still maps the 502 camouflage', () => {
    const hidden = new Error('API error 502: <html>')
    hidden.status = 502
    expect(policyErrorMessage(hidden, { t })).toBe('policyConfirm.nodeHidden')
    expect(policyErrorMessage(hidden, { voucherEnabled: true, hasVoucher: false, t }))
      .toBe('policyConfirm.voucherRequired')
  })
})
