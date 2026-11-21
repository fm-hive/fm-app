/**
 * Diff-baseline selection for the policy confirmation dialog. Pure helpers
 * around localStorage so the re-sign flow can be unit tested.
 *
 * Two baselines are considered:
 *  - fm_policy_accepted: the last policy this client actually signed (primary,
 *    guarded by the node key so a baseline from another node is never used).
 *  - fm_policy_prev: the last DISTINCT policy seen, kept for clients that
 *    signed before fm_policy_accepted existed.
 */

export function samePolicyId(a, b) {
  return !!(a?.id && b?.id && a.id === b.id)
}

export function readStoredPolicy(key, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Store the policy cached in fm_policy_full as fm_policy_prev when it differs
 * from the freshly fetched one. Must be called BEFORE fm_policy_full is
 * overwritten, so repeated fetches of the same current policy leave the
 * previous baseline untouched (issue #248).
 */
export function rememberPreviousPolicy(currentPolicy, storage = globalThis.localStorage) {
  if (!currentPolicy?.id) return
  const cached = readStoredPolicy('fm_policy_full', storage)
  if (cached?.policy && !samePolicyId(cached, currentPolicy)) {
    try {
      storage.setItem('fm_policy_prev', JSON.stringify(cached))
    } catch { /* ignore quota errors */ }
  }
}

/** Resolve the baseline to diff against, or null when there is none. */
export function selectPreviousPolicy({ accepted, prev, nodeKey, currentPolicy } = {}) {
  if (accepted?.nodeKey && accepted.nodeKey === nodeKey && accepted.payload?.policy) {
    return accepted.payload
  }
  if (prev?.policy && !samePolicyId(prev, currentPolicy)) {
    return prev
  }
  return null
}
