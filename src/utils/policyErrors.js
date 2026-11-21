/**
 * Friendly messages for policy-flow failures (#83).
 */

/**
 * A 502 from the node means the API is hidden: the network uses a closed policy
 * flow (no/wrong node key) or the registration is missing the invite voucher
 * the network requires. Everything else is passed through.
 *
 * @param {Error} err - error from the API layer (may carry `.status`)
 * @param {object} options
 * @param {boolean} [options.voucherEnabled] - network requires vouchers
 * @param {boolean} [options.hasVoucher] - the client has an invite voucher
 * @param {Function} options.t - i18n translate function
 * @returns {string}
 */
export function policyErrorMessage(err, { voucherEnabled = false, hasVoucher = false, t } = {}) {
  const message = err?.message || ''
  // Node guards (issue #209): the daily per-IP registration cap and the body
  // size limit are worth a concrete hint during registration.
  if (err?.status === 429 || /(^|\D)429(\D|$)|Too many requests/i.test(message)) {
    return t('errors.registrationLimit')
  }
  if (err?.status === 413 || /(^|\D)413(\D|$)|too large/i.test(message)) {
    return t('errors.requestTooLarge')
  }
  const hidden = err?.status === 502 || /502|Bad Gateway/i.test(message)
  if (!hidden) return message || t('policyConfirm.sendError')
  if (voucherEnabled && !hasVoucher) return t('policyConfirm.voucherRequired')
  return t('policyConfirm.nodeHidden')
}
