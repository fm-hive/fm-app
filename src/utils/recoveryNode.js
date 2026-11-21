// Persistent recovery/open-node endpoint. When set, boot talks to this node
// instead of the deployment-relative API; the user can leave recovery mode.
const KEY = 'fm_recovery_node'

export function saveRecoveryNode({ apiUrl, nodePubkeyB64, appUrl }) {
  if (!apiUrl) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ apiUrl, nodePubkeyB64: nodePubkeyB64 || '', appUrl: appUrl || '' }))
  } catch { /* ignore */ }
}

export function loadRecoveryNode() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data?.apiUrl ? data : null
  } catch {
    return null
  }
}

export function clearRecoveryNode() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
