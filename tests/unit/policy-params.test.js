import { describe, it, expect } from 'vitest'
import {
  POLICY_PARAM_DEFS,
  RATE_LIMIT_KEYS,
  NESTED_POLICY_PARAMS,
  extraPolicyParamKeys,
  editablePolicyParams,
} from '../../src/utils/policyParams'
import { policyErrorMessage } from '../../src/utils/policyErrors'

// Keys of the node's default policy (internal/models/data/default_policy.json).
// Kept here as a fixture so a new node-side parameter cannot silently disappear
// from the edit dialog (#83).
const DEFAULT_POLICY_KEYS = [
  'read_only_days', 'read_only_echo_limit', 'election_result_days', 'candidate_collection_period',
  'voting_period', 'min_candidates', 'min_moderators', 'max_moderators', 'refill_days',
  'time_since_last_vote', 'min_percent_for_network_decisions', 'fast_network_votes',
  'change_policy_vote_period', 'merge_phase0_vote_period', 'merge_phase1_vote_period',
  'merge_phase2_vote_period', 'excommunicate_cooldown_days', 'warnings_per_punishment',
  'punishments_per_read_only', 'max_message_size', 'max_attachments_per_message',
  'max_attachment_size', 'message_id_depth_days', 'create_echo_with_rules',
  'create_echo_with_rules_council_votes', 'create_echo_with_rules_council_vote_period',
  'max_create_echo_requests', 'voucher_enable', 'voucher_autologin', 'encrypted_policy_flow',
  'rate_limit', 'special_echogroups',
]

describe('policy parameters in the edit dialog (#83)', () => {
  it('covers every parameter of the default policy', () => {
    const known = new Set(POLICY_PARAM_DEFS.map(d => d.key))
    const missing = DEFAULT_POLICY_KEYS.filter(
      k => !known.has(k) && !NESTED_POLICY_PARAMS.includes(k),
    )
    expect(missing).toEqual([])
  })

  it('has voucher and encrypted flow parameters with boolean selects', () => {
    for (const key of ['voucher_enable', 'voucher_autologin', 'encrypted_policy_flow']) {
      const def = POLICY_PARAM_DEFS.find(d => d.key === key)
      expect(def, key).toBeTruthy()
      expect(def.type).toBe('select')
      expect(def.options).toEqual(['true', 'false'])
    }
  })

  it('marks voting periods as duration fields', () => {
    for (const key of [
      'voting_period', 'candidate_collection_period', 'change_policy_vote_period',
      'appeal_vote_period', 'merge_phase0_vote_period', 'merge_phase1_vote_period',
      'merge_phase2_vote_period', 'merge_connect_timeout',
      'create_echo_with_rules_council_vote_period',
    ]) {
      const def = POLICY_PARAM_DEFS.find(d => d.key === key)
      expect(def, key).toBeTruthy()
      expect(def.type, key).toBe('duration')
    }
  })

  it('lists the rate limit kinds edited separately', () => {
    expect(RATE_LIMIT_KEYS).toEqual(['vote', 'echomail', 'reaction', 'netmail', 'poster'])
  })

  it('exposes unknown parameters as generic fields', () => {
    const params = { voting_period: '30', brand_new_param: 'x', rate_limit: {}, special_echogroups: {} }
    expect(extraPolicyParamKeys(params)).toEqual(['brand_new_param'])
    const fields = editablePolicyParams(params)
    const extra = fields.find(f => f.key === 'brand_new_param')
    expect(extra).toMatchObject({ type: 'text', unknown: true })
    // Known parameters keep their definitions.
    expect(fields.find(f => f.key === 'voting_period').type).toBe('duration')
  })

  it('returns no extra fields for a fully known policy', () => {
    const params = Object.fromEntries(DEFAULT_POLICY_KEYS.map(k => [k, '1']))
    expect(extraPolicyParamKeys(params)).toEqual([])
  })
})

describe('policy error messages (#83)', () => {
  const t = (key) => key

  it('maps a 502 to the voucher hint when vouchers are required and none is present', () => {
    const err = new Error('API error 502: <html>...')
    err.status = 502
    expect(policyErrorMessage(err, { voucherEnabled: true, hasVoucher: false, t }))
      .toBe('policyConfirm.voucherRequired')
  })

  it('maps a 502 to the generic hidden-node message otherwise', () => {
    const err = new Error('API error 502: <html>...')
    err.status = 502
    expect(policyErrorMessage(err, { voucherEnabled: true, hasVoucher: true, t }))
      .toBe('policyConfirm.nodeHidden')
    expect(policyErrorMessage(err, { voucherEnabled: false, hasVoucher: false, t }))
      .toBe('policyConfirm.nodeHidden')
    // Also detected from the message when the status is missing.
    expect(policyErrorMessage(new Error('API error 502: Bad Gateway'), { t }))
      .toBe('policyConfirm.nodeHidden')
  })

  it('passes other errors through', () => {
    expect(policyErrorMessage(new Error('Invalid signature'), { t })).toBe('Invalid signature')
    expect(policyErrorMessage({}, { t })).toBe('policyConfirm.sendError')
  })
})
