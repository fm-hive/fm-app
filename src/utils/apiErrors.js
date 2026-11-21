/**
 * Friendly messages for API failures the user can act on (issue #209).
 */

/**
 * Map an API error to a human-readable message.
 *
 * - 429: the node's request rate limit (or the daily per-IP registration cap
 *   when the caller passes `registration: true`);
 * - 413: the request body is over the node's size limit;
 * - everything else is passed through unchanged.
 *
 * @param {Error} err - error from the API layer (may carry `.status`)
 * @param {Function} t - i18n translate function
 * @param {object} [options]
 * @param {boolean} [options.registration] - registration context (daily cap hint)
 * @returns {string}
 */
export function apiErrorMessage(err, t, { registration = false } = {}) {
  const message = err?.message || ''
  if (err?.status === 429 || /(^|\D)429(\D|$)|Too many requests/i.test(message)) {
    return registration ? t('errors.registrationLimit') : t('errors.rateLimited')
  }
  if (err?.status === 413 || /(^|\D)413(\D|$)|too large/i.test(message)) {
    return t('errors.requestTooLarge')
  }
  return message
}
