/**
 * Whether an echo belongs to the sidebar list (#388).
 *
 * A conference is visible when the node reports a subscription, when it is a
 * system echo delivered automatically (`no_subscribe`), or when the local
 * subscription state still knows about it. The helper is shared by the echo
 * list and the "new echoes" badge so both always agree.
 */
export function isEchoVisibleInSidebar(echoItem, { subscribedEchoes = [], isSubscribed = () => false } = {}) {
  if (!echoItem) return false
  if (echoItem.subscribed) return true
  if (echoItem.no_subscribe) return true
  if (subscribedEchoes.includes(echoItem.name)) return true
  return Boolean(isSubscribed(echoItem.name))
}
