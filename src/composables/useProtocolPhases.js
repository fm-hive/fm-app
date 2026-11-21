/**
 * Shared phase computation for election, vote, and excommunicate protocols.
 * Used by ActiveProtocolsList.vue and Echoes.vue Protocols popup.
 */
import { ref } from 'vue'

let _paramsReady = ref(false)
let _fetching = null

function parseJwsPayload(jws) {
  const parts = jws.split('.')
  if (parts.length !== 3) return null
  try {
    const raw = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(raw)
  } catch { return null }
}

export async function ensurePolicyParams() {
  if (localStorage.getItem('fm_policy_params')) {
    _paramsReady.value = true
    return
  }
  if (_fetching) return _fetching

  _fetching = (async () => {
    try {
      const { apiService } = await import('../services/api')
      const response = await apiService.policy(null, false)
      if (response?.policy) {
        const payload = parseJwsPayload(response.policy)
        if (payload?.policy?.parameters) {
          localStorage.setItem('fm_policy_params', JSON.stringify(payload.policy.parameters))
        }
      }
    } catch (e) {
      console.warn('Failed to fetch policy params for phase computation:', e)
    } finally {
      _paramsReady.value = true
      _fetching = null
    }
  })()

  return _fetching
}

export function paramsReady() {
  return _paramsReady.value
}

export function getPolicyParams() {
  try {
    const raw = localStorage.getItem('fm_policy_params')
    if (raw) return JSON.parse(raw)
  } catch {}

  // Trigger async fetch — will update _paramsReady when complete
  ensurePolicyParams()
  return null
}

export function formatRemaining(remainingSec) {
  const days = Math.floor(remainingSec / 86400)
  const hours = Math.floor((remainingSec % 86400) / 3600)
  const minutes = Math.floor((remainingSec % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const DURATION_UNITS = { d: 86400, h: 3600, m: 60, s: 1 }

/**
 * Parse a policy duration into seconds. A plain number means days; units
 * `d/h/m/s` support fractions and compounds: "0.5d", "12h", "1d12h", "30m".
 * Returns null for missing/invalid values.
 */
export function parsePolicyDurationSeconds(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value * 86400 : null
  }
  const raw = String(value).trim()
  if (!raw) return null
  if (/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
    return Number(raw) * 86400
  }
  let total = 0
  let pos = 0
  while (pos < raw.length) {
    const match = /^([0-9]+(?:\.[0-9]+)?)([dhms])/.exec(raw.slice(pos))
    if (!match) return null
    total += Number(match[1]) * DURATION_UNITS[match[2]]
    pos += match[0].length
  }
  return total
}

/** Same as parsePolicyDurationSeconds but falls back to a number of days. */
export function policyDurationSeconds(value, fallbackDays = 0) {
  const parsed = parsePolicyDurationSeconds(value)
  return parsed === null ? fallbackDays * 86400 : parsed
}

export function formatDate(ts) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Count election votes per candidate, mirroring the node's computeElectionState:
 * group by voter, keep only the latest maxModerators votes per voter, and drop
 * voters whose latest vote is a retraction (empty `to` and `candidate_address`).
 * Returns { candidateVotes, totalVotes }.
 */
export function countElectionVotes(allMessages = [], maxModerators = 1) {
  const limit = parseInt(maxModerators) || 1
  const byVoter = {}
  for (const m of allMessages) {
    if (m.type !== 'election') continue
    let d
    try { d = JSON.parse(m.data) } catch { continue }
    if (d.type !== 'vote') continue
    const voter = d.from || m.sender_address
    if (!voter) continue
    if (!byVoter[voter]) byVoter[voter] = []
    byVoter[voter].push({
      ts: m.timestamp || 0,
      to: d.to || '',
      candidate_address: d.candidate_address || '',
    })
  }

  const candidateVotes = {}
  let totalVotes = 0
  for (const voter of Object.keys(byVoter)) {
    const votes = byVoter[voter].sort((a, b) => b.ts - a.ts)
    const latest = votes[0]
    if (!latest.to && !latest.candidate_address) continue // retracted
    const n = Math.min(limit, votes.length)
    for (let i = 0; i < n; i++) {
      const cand = votes[i].to || votes[i].candidate_address
      if (cand) {
        candidateVotes[cand] = (candidateVotes[cand] || 0) + 1
        totalVotes++
      }
    }
  }
  return { candidateVotes, totalVotes }
}

/**
 * Whether a vote poster already has a result message (#252). Finished votes
 * leave the active protocols list and stay in the feed as the result card, so
 * the poster card is hidden. Results reference the poster either by its text
 * (poster_message) or by its message id (originalMessageId).
 */
export function hasVoteResult(posterMsg, allMessages = []) {
  if (!posterMsg) return false
  let posterData = {}
  try { posterData = JSON.parse(posterMsg.data) } catch { return false }
  if (posterData.type !== 'poster') return false
  return (allMessages || []).some(m => {
    if (!m || m.type !== 'vote') return false
    let d
    try { d = JSON.parse(m.data) } catch { return false }
    if (d.type !== 'result') return false
    if (d.poster_message && d.poster_message === posterData.message) return true
    if (d.originalMessageId && d.originalMessageId === posterMsg.message_id) return true
    return false
  })
}

/**
 * Network tag of a stored merge vote ('' for local votes). Merge votes of the
 * peer network are stored with their network letter on the envelope
 * (`A::0:1` / `B::0:1`, #249); the signed inner `from` stays unchanged.
 */
export function networkTagOf(msg) {
  const sender = String(msg?.sender_address || '')
  if (sender.startsWith('A:') || sender.startsWith('B:')) return sender.slice(0, 2)
  return ''
}

/**
 * Stable voter identity of a vote message. Peer merge votes of two networks
 * with equal addresses (both `:0:1`) must not collapse into one voter, so the
 * stored network tag is part of the key; local votes are prefixed with
 * `local:` (a user address can never look like that).
 */
export function voterIdentity(msg, data) {
  const sender = String(msg?.sender_address || '')
  if (sender.startsWith('A:') || sender.startsWith('B:')) return sender
  return 'local:' + (data?.from || sender)
}

/**
 * Count votes for a vote poster, mirroring the node's computeVoteState:
 * keep only the latest vote per voter and drop voters whose latest vote is a
 * retraction (empty `vote`). Returns { counts, voters }, where `voters` is the
 * list of latest non-retracted vote messages (used for the voter icons).
 */
export function countVoteVariants(posterMessage, allMessages = []) {
  const byVoter = {}
  for (const m of allMessages) {
    if (m.type !== 'vote') continue
    let d
    try { d = JSON.parse(m.data) } catch { continue }
    if (d.type !== 'vote' || d.poster_message !== posterMessage) continue
    const voter = voterIdentity(m, d)
    if (!voter) continue
    const prev = byVoter[voter]
    if (!prev || (m.timestamp || 0) > prev.ts) {
      byVoter[voter] = { ts: m.timestamp || 0, vote: d.vote || '', msg: m }
    }
  }

  const counts = {}
  const voters = []
  for (const voter of Object.keys(byVoter)) {
    const rec = byVoter[voter]
    if (!rec.vote) continue // retracted
    counts[rec.vote] = (counts[rec.vote] || 0) + 1
    voters.push(rec.msg)
  }
  return { counts, voters }
}

/**
 * Own confirmed vote variant for a poster ('' = not voted/retracted). Only
 * local votes count: a peer network's merge vote is stored with a network tag
 * and may carry the same user address (two simple nodes, #249).
 */
export function myVoteVariantFor(posterMsg, allMessages = [], me = '') {
  if (!posterMsg || !me) return ''
  let posterData
  try { posterData = JSON.parse(posterMsg.data) } catch { return '' }
  if (!posterData?.message) return ''
  let best = null
  for (const m of allMessages) {
    if (m.type !== 'vote') continue
    let d
    try { d = JSON.parse(m.data) } catch { continue }
    if (d.type !== 'vote' || d.poster_message !== posterData.message) continue
    if (voterIdentity(m, d) !== 'local:' + me) continue
    const ts = m.timestamp || 0
    if (!best || ts >= best.ts) best = { ts, vote: d.vote || '' }
  }
  return best ? best.vote : ''
}

/**
 * Election: collection (candidate_collection_period) → voting (voting_period) → ended
 * Collection starts when second candidate appears.
 */
export function getElectionState(msg, allMessages = [], nodePhase = null) {
  try {
    const data = JSON.parse(msg.data)
    const params = getPolicyParams()
    if (!params) return null
    const collectionSeconds = policyDurationSeconds(params.candidate_collection_period, 14)
    const votingSeconds = policyDurationSeconds(params.voting_period, 30)
    const now = Math.floor(Date.now() / 1000)

    // Get all election poster messages (candidates who applied)
    const posters = allMessages.filter(m => {
      if (m.type !== 'election') return false
      try {
        const d = JSON.parse(m.data)
        return d.type === 'poster' && d.from
      } catch { return false }
    })

    // Get poster timestamps for phase calculation (first candidate starts collection)
    const posterTss = posters.map(m => m.timestamp || 0).sort((a, b) => a - b)

    const collectionStart = posterTss.length > 0 ? posterTss[0] : (msg.timestamp || 0)
    let collectionEnd = collectionStart + collectionSeconds
    let votingEnd = collectionEnd + votingSeconds

    // Build candidate list from poster messages
    const candidateAddresses = [...new Set(posters.map(m => {
      try { const d = JSON.parse(m.data); return d.from || m.sender_address }
      catch { return m.sender_address }
    }))]

    // Count votes per candidate (per-voter latest votes, retractions honoured).
    const { candidateVotes, totalVotes } = countElectionVotes(allMessages, params.max_moderators)

    // The node is authoritative: when it has broadcast a phase message for this
    // echo, use its phase and boundaries instead of recomputing them locally
    // (the node sees every poster, the client may not).
    let phase
    if (nodePhase && nodePhase.phase) {
      phase = nodePhase.phase
      if (typeof nodePhase.collectionEnd === 'number' && nodePhase.collectionEnd > 0) collectionEnd = nodePhase.collectionEnd
      if (typeof nodePhase.votingEnd === 'number' && nodePhase.votingEnd > 0) votingEnd = nodePhase.votingEnd
    } else {
      phase = now < collectionEnd ? 'collection' : now < votingEnd ? 'voting' : 'ended'
    }

    // Build phases array with visual timeline info from the resolved boundaries.
    const phases = [
      {
        name: 'Collection',
        start: collectionStart,
        end: collectionEnd,
        active: phase === 'collection',
        past: phase === 'voting' || phase === 'ended',
      },
      {
        name: 'Voting',
        start: collectionEnd,
        end: votingEnd,
        active: phase === 'voting',
        past: phase === 'ended',
      },
      {
        name: 'Ended',
        start: votingEnd,
        end: 0,
        active: phase === 'ended',
        past: false,
      },
    ]

    const phaseEnd = phase === 'collection' ? collectionEnd : phase === 'voting' ? votingEnd : 0
    const remaining = phaseEnd ? Math.max(0, phaseEnd - now) : 0

    return {
      phase,
      remaining,
      phaseEnd,
      phases,
      candidates: candidateAddresses,
      candidateVotes,
      minCandidates: parseInt(params.min_candidates) || 2,
      totalVotes: totalVotes,
      collectionEnd,
      votingEnd,
    }
  } catch { return null }
}

/**
 * Vote: voting (voting_period) → ended
 */
export function getVoteState(msg) {
  try {
    const data = JSON.parse(msg.data)
    const params = getPolicyParams()
    if (!params) return null
    // Votes started by a protocol use that protocol's period on the node
    // (internal/protocols/vote.go + helpers.go defaults): policy-change chunks,
    // echo-creation proposals and merge chunks each have their own duration and
    // fall back to 3 days, not to the generic voting_period.
    let periodValue = params.voting_period
    let defaultDays = 30
    if (data.protocol === 'change_policy') {
      periodValue = params.change_policy_vote_period ?? 3
      defaultDays = 3
    } else if (data.protocol === 'create_echo') {
      periodValue = params.create_echo_with_rules_council_vote_period ?? 3
      defaultDays = 3
    } else if (data.protocol === 'appeal') {
      // Appeals use their own period (#222); 0 = decided as soon as the
      // network has voted.
      periodValue = params.appeal_vote_period ?? 3
      defaultDays = 3
    } else if (data.protocol === 'merge') {
      // Two-phase merge (#212): every phase has its own period.
      const phase = Number(data.protocol_data?.phase ?? 1)
      if (phase === 0) periodValue = params.merge_phase0_vote_period ?? 1
      else if (phase === 2) periodValue = params.merge_phase2_vote_period ?? 1
      else periodValue = params.merge_phase1_vote_period ?? 1
      defaultDays = 1
    }
    // The poster freezes the effective period (max of both policies for a
    // merge, #257). It wins over local policy, including 0 (decide at once).
    const posterSeconds = parsePolicyDurationSeconds(data.protocol_data?.vote_period)
    let votingSeconds = posterSeconds !== null
      ? posterSeconds
      : policyDurationSeconds(periodValue, defaultDays)
    // The node treats 0 as "use the default" for these protocols (unlike
    // appeal/merge, where 0 means decide immediately).
    if ((data.protocol === 'change_policy' || data.protocol === 'create_echo') && votingSeconds <= 0) {
      votingSeconds = defaultDays * 86400
    }
    const posterTs = msg.timestamp || 0
    const now = Math.floor(Date.now() / 1000)
    const votingEnd = posterTs + votingSeconds

    const phase = now < votingEnd ? 'voting' : 'ended'
    const phases = [
      {
        name: 'Voting',
        start: posterTs,
        end: votingEnd,
        active: phase === 'voting',
        past: phase === 'ended',
      },
      {
        name: 'Ended',
        start: votingEnd,
        end: 0,
        active: phase === 'ended',
        past: false,
      },
    ]

    const remaining = Math.max(0, votingEnd - now)
    return {
      phase,
      remaining,
      phaseEnd: phase === 'voting' ? votingEnd : 0,
      phases,
      votingEnd,
    }
  } catch { return null }
}

/**
 * Excommunicate: voting (voting_period) → ended, then read_only penalty (read_only_days)
 */
export function getExcommunicateState(msg, allMessages = []) {
  try {
    const data = JSON.parse(msg.data)
    const params = getPolicyParams()
    if (!params) return null
    const votingSeconds = policyDurationSeconds(params.voting_period, 30)
    const readOnlyDays = parseInt(params.read_only_days) || 30
    const posterTs = msg.timestamp || 0
    const now = Math.floor(Date.now() / 1000)
    const votingEnd = posterTs + votingSeconds

    // Check if there's a result message
    const resultMsg = allMessages.find(m => {
      if (m.type !== 'excommunicate') return false
      try {
        const d = JSON.parse(m.data)
        return d.type === 'result'
      } catch { return false }
    })

    let resultData = null
    let readOnlyEnd = 0
    if (resultMsg) {
      try {
        resultData = JSON.parse(resultMsg.data)
        const resultTs = resultMsg.timestamp || 0
        readOnlyEnd = resultTs + readOnlyDays * 86400
      } catch {}
    }

    const variant = resultData?.vote || 'read-only'
    const isPermanent = variant === 'excommunicate'

    let phase, phases
    if (!resultMsg) {
      // Still in voting phase
      phase = 'voting'
      phases = [
        { name: 'Voting', start: posterTs, end: votingEnd, active: now < votingEnd, past: false },
        { name: 'Read-only', start: votingEnd, end: 0, active: false, past: false },
      ]
      if (now >= votingEnd) {
        phase = 'ended'
        phases[0].active = false
        phases[0].past = true
        phases[1].active = true
        phases[1].past = false
      }
    } else if (isPermanent) {
      // Permanent excommunication
      phase = 'permanent'
      phases = [
        { name: 'Voting', start: posterTs, end: votingEnd, active: false, past: true },
        { name: 'Permanent', start: votingEnd, end: 0, active: true, past: false },
      ]
    } else if (now < readOnlyEnd) {
      // Read-only penalty active
      phase = 'read_only'
      phases = [
        { name: 'Voting', start: posterTs, end: votingEnd, active: false, past: true },
        { name: 'Read-only', start: votingEnd, end: readOnlyEnd, active: true, past: false },
      ]
    } else {
      // Read-only expired → permanent removal
      phase = 'removed'
      phases = [
        { name: 'Voting', start: posterTs, end: votingEnd, active: false, past: true },
        { name: 'Removed', start: votingEnd, end: 0, active: true, past: false },
      ]
    }

    const remaining = (phase === 'voting')
      ? Math.max(0, votingEnd - now)
      : (phase === 'read_only')
        ? Math.max(0, readOnlyEnd - now)
        : 0

    return {
      phase,
      remaining,
      phaseEnd: phase === 'voting' ? votingEnd : phase === 'read_only' ? readOnlyEnd : 0,
      phases,
      votingEnd,
      readOnlyEnd,
      variant,
      isPermanent,
      target: data.protoAddress || data.to || msg.sender_address,
    }
  } catch { return null }
}
