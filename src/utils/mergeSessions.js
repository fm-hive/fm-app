// Active merge sessions (#212) as they appear in the Admin council.
//
// The merge protocol stores its state in ordinary echo messages: phase posters
// and chunk posters are vote posters (`protocol: "merge"`), chunk winners are
// vote results and the final outcome is a `merge` result message. This helper
// folds those messages into one entry per session (state_key).

/** Build the list of merge sessions from the Admin council messages. */
export function buildMergeSessions(messages) {
  const sessions = new Map()
  const session = (stateKey) => {
    if (!stateKey) return null
    if (!sessions.has(stateKey)) {
      sessions.set(stateKey, { stateKey, phase: 0, target: '', chunks: [], accept: 0, reject: 0, result: '' })
    }
    return sessions.get(stateKey)
  }

  for (const msg of messages || []) {
    const isMergeResult = msg.type === 'merge'
    const isMergeVote = msg.type === 'vote'
    if (!isMergeResult && !isMergeVote) continue

    let data
    try { data = JSON.parse(msg.data) } catch { continue }
    if (isMergeVote && data.protocol !== 'merge') continue
    const stateKey = data.state_key || data.protocol_data?.state_key
    if (!stateKey) continue
    const s = session(stateKey)
    const pd = data.protocol_data || {}

    if (pd.node2 && !s.target) s.target = pd.node2
    // Merge messages (e.g. the informational "started" record of a
    // single-node merge, #247) carry node2 at the top level.
    if (data.node2 && !s.target) s.target = data.node2

    if (isMergeResult) {
      // Final result of the session (merged / fail).
      if (data.type === 'result') {
        s.result = data.result === 'merged' ? 'merged' : 'failed'
      }
      continue
    }
    if (data.type === 'poster') {
      if (typeof pd.phase === 'number') s.phase = Math.max(s.phase, pd.phase)
      if (typeof pd.chunk_index === 'number' && pd.total_chunks > 0) {
        s.phase = Math.max(s.phase, 1)
        if (!s.chunks.some(c => c.index === pd.chunk_index)) {
          s.chunks.push({ index: pd.chunk_index, winner: '' })
        }
      }
      continue
    }
    // Votes are attributed to the session by their poster reference: the
    // poster text always carries the state key.
    if (data.type === 'vote' && String(data.poster_message || '').includes(stateKey)) {
      if (data.vote === 'accept') s.accept++
      else if (data.vote === 'reject') s.reject++
      continue
    }
    if (data.type === 'result' && typeof pd.chunk_index === 'number') {
      const chunk = s.chunks.find(c => c.index === pd.chunk_index)
      if (chunk) chunk.winner = data.variant || ''
    }
  }

  return Array.from(sessions.values()).sort((a, b) => b.phase - a.phase)
}
