/**
 * Network policy parameters edited in the "Edit policy" dialog.
 *
 * The list is the source of truth for the dialog fields; parameters present in
 * the policy but missing here are still rendered (as plain text inputs) so a
 * new node-side parameter never becomes invisible in the UI (#83).
 */

export const POLICY_PARAM_DEFS = [
  { key: 'net_name', type: 'text', maxLength: 64 },
  { key: 'voting_period', type: 'duration' },
  { key: 'candidate_collection_period', type: 'duration' },
  { key: 'min_candidates', type: 'number', min: 1 },
  { key: 'min_moderators', type: 'number', min: 1 },
  { key: 'max_moderators', type: 'number', min: 1 },
  { key: 'read_only_days', type: 'number', min: 1 },
  { key: 'read_only_echo_limit', type: 'number', min: 1 },
  { key: 'election_result_days', type: 'number', min: 1 },
  { key: 'refill_days', type: 'number', min: 1 },
  { key: 'time_since_last_vote', type: 'number', min: 0 },
  { key: 'min_percent_for_network_decisions', type: 'number', min: 0 },
  { key: 'change_policy_vote_period', type: 'duration' },
  { key: 'merge_phase0_vote_period', type: 'duration' },
  { key: 'merge_phase1_vote_period', type: 'duration' },
  { key: 'merge_phase2_vote_period', type: 'duration' },
  { key: 'merge_connect_timeout', type: 'duration' },
  { key: 'appeal_vote_period', type: 'duration' },
  { key: 'fast_network_votes', type: 'select', options: ['true', 'false'] },
  { key: 'excommunicate_cooldown_days', type: 'number', min: 0 },
  { key: 'warnings_per_punishment', type: 'number', min: 1 },
  { key: 'punishments_per_read_only', type: 'number', min: 1 },
  { key: 'max_message_size', type: 'number', min: 1 },
  { key: 'max_attachments_per_message', type: 'number', min: 1 },
  { key: 'max_attachment_size', type: 'number', min: 1 },
  { key: 'max_create_echo_requests', type: 'number', min: 1 },
  { key: 'message_id_depth_days', type: 'number', min: 1 },
  { key: 'create_echo_with_rules', type: 'select', options: ['council', 'node', 'any'] },
  { key: 'create_echo_with_rules_council_votes', type: 'text' },
  { key: 'create_echo_with_rules_council_vote_period', type: 'duration' },
  { key: 'voucher_enable', type: 'select', options: ['true', 'false'] },
  { key: 'voucher_autologin', type: 'select', options: ['true', 'false'] },
  { key: 'encrypted_policy_flow', type: 'select', options: ['true', 'false'] },
]

/** Network rate limits (nested map, edited separately). */
export const RATE_LIMIT_KEYS = ['vote', 'echomail', 'reaction', 'netmail', 'poster']

/** Nested parameters that are not flat editable fields. */
export const NESTED_POLICY_PARAMS = ['rate_limit', 'special_echogroups']

/**
 * Keys of policy parameters that are not covered by POLICY_PARAM_DEFS and are
 * not nested maps — they get a generic text field in the dialog.
 * @param {object} params - policy parameters
 * @returns {string[]}
 */
export function extraPolicyParamKeys(params) {
  const known = new Set(POLICY_PARAM_DEFS.map(d => d.key))
  return Object.keys(params || {}).filter(key => !known.has(key) && !NESTED_POLICY_PARAMS.includes(key))
}

/**
 * Full editable field list: the known definitions plus a generic text field for
 * every unknown parameter.
 * @param {object} params - policy parameters
 */
export function editablePolicyParams(params) {
  return [
    ...POLICY_PARAM_DEFS,
    ...extraPolicyParamKeys(params).map(key => ({ key, type: 'text', unknown: true })),
  ]
}

/**
 * Network display name from policy parameters. Older policies without the
 * parameter fall back to the historical "FM" name.
 * @param {object} params - policy parameters
 * @returns {string}
 */
export function networkNameFromParameters(params) {
  const value = typeof params?.net_name === 'string' ? params.net_name.trim() : ''
  return value || 'FM'
}

/** Special echo name from `special_echogroups` with a fallback. */
export function specialEchoName(parameters, key, fallback) {
  const groups = parameters?.special_echogroups
  const value = groups && typeof groups[key] === 'string' ? groups[key].trim() : ''
  return value || fallback
}
