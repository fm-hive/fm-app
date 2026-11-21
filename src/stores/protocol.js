import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { 
  MAX_MESSAGES, 
  ACTIVE_DAYS_LIMIT, 
  STORAGE_KEY, 
  STORAGE_DEBUG_KEY,
  CLEANUP_DAYS,
  PROTOCOL_TYPES,
  ACTIVITY_CRITERIA,
  DEBUG 
} from '../config/protocol.js'
import { 
  deriveEncryptionKey, 
  encryptData, 
  decryptData,
  isEncryptionAvailable,
  fallbackEncrypt,
  fallbackDecrypt
} from '../services/encryption.js'
import { useIdentityStore } from './identity.js'
import { decodeJwsPayload } from '../services/crypto.js'
import { getVoteState, paramsReady } from '../composables/useProtocolPhases.js'

const ELECTION_PHASES_KEY = 'fm_election_phases'
function loadElectionPhases() {
  try { return JSON.parse(localStorage.getItem(ELECTION_PHASES_KEY) || '{}') } catch { return {} }
}
function saveElectionPhases(map) {
  try { localStorage.setItem(ELECTION_PHASES_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

function loadProtocolSet(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}

function saveProtocolSet(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)) } catch { /* ignore */ }
}

export const useProtocolStore = defineStore('protocol', () => {
  // State
  const messages = ref([])
  const refillRequests = ref([])
  // Authoritative election phase broadcast by the node:
  // { [echoName]: { phase, collectionEnd, votingEnd, candidates, receivedAt } }
  const electionPhases = ref(loadElectionPhases())
  const encryptionKey = ref(null)
  const storageUsage = ref(0)
  const debugMode = ref(DEBUG)

  // Protocols hidden (dismissed) or cancelled by the user, keyed by message_id.
  const HIDDEN_PROTOCOLS_KEY = 'fm_hidden_messages'
  const CANCELLED_PROTOCOLS_KEY = 'fm_cancelled_messages'
  const hiddenProtocols = ref(loadProtocolSet(HIDDEN_PROTOCOLS_KEY))
  const cancelledProtocols = ref(loadProtocolSet(CANCELLED_PROTOCOLS_KEY))
  
  // Getters
  const totalCount = computed(() => messages.value.length)
  const isStorageFull = computed(() => totalCount.value >= MAX_MESSAGES * 0.9) // 90% threshold warning
  const isStorageCritical = computed(() => totalCount.value >= MAX_MESSAGES)
  
  // Initialize store
  async function init() {
    try {
      // Check if encryption is available
      if (!isEncryptionAvailable()) {
        console.warn('Web Crypto API not available, using fallback storage (insecure)')
      }
      
      // Try to load from localStorage
      await loadFromStorage()
      
      // Cleanup old messages
      cleanupOldMessages()
      
      console.log(`Protocol store initialized with ${totalCount.value} messages`)
    } catch (error) {
      console.error('Failed to initialize protocol store:', error)
    }
  }
  
  // Load messages from localStorage
  async function loadFromStorage() {
    try {
      const identity = useIdentityStore()
      
      if (!identity.hasKeys || !identity.privateKey) {
        console.warn('No identity keys available, skipping protocol storage load')
        return
      }
      
      // Derive encryption key from private key
      encryptionKey.value = await deriveEncryptionKey(identity.privateKey)
      
      // Load encrypted data
      const encryptedData = localStorage.getItem(STORAGE_KEY)
      if (!encryptedData) {
        console.log('No protocol messages found in storage')
        return
      }
      
      // Decrypt data
      let decryptedMessages
      try {
        decryptedMessages = await decryptData(encryptionKey.value, encryptedData)
      } catch (decryptError) {
        // Try debug storage as fallback (unencrypted, dev only)
        const debugData = localStorage.getItem(STORAGE_DEBUG_KEY)
        if (debugData && debugMode.value) {
          console.warn('Loading from debug storage (unencrypted)')
          decryptedMessages = JSON.parse(debugData)
        } else {
          // The stored ciphertext was written with another identity key (e.g. a
          // backup with different keys was imported). It can never be decrypted
          // again — drop it instead of failing on every boot.
          console.warn('Dropping protocol messages encrypted with another key')
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(STORAGE_DEBUG_KEY)
          return
        }
      }
      
      // Validate loaded data — merge with anything already in memory (so a poll
      // that ran before init() doesn't get wiped).
      let loadedMessages = []
      let loadedRefillRequests = []
      if (Array.isArray(decryptedMessages)) {
        // Legacy format: a bare array of messages.
        loadedMessages = decryptedMessages
      } else if (decryptedMessages && Array.isArray(decryptedMessages.messages)) {
        loadedMessages = decryptedMessages.messages || []
        loadedRefillRequests = Array.isArray(decryptedMessages.refillRequests) ? decryptedMessages.refillRequests : []
      }

      if (Array.isArray(decryptedMessages) || (decryptedMessages && Array.isArray(decryptedMessages.messages))) {
        // Merge messages by message_id.
        const existingIds = new Set(messages.value.map(m => m.message_id))
        const merged = [...messages.value]
        for (const m of loadedMessages) {
          if (m && m.message_id && !existingIds.has(m.message_id)) {
            merged.push(m)
            existingIds.add(m.message_id)
          }
        }
        merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        messages.value = merged

        // Merge refill requests by messageId.
        const existingRefillIds = new Set(refillRequests.value.map(r => r.messageId))
        for (const r of loadedRefillRequests) {
          if (r && r.messageId && !existingRefillIds.has(r.messageId)) {
            refillRequests.value.push(r)
            existingRefillIds.add(r.messageId)
          }
        }

        console.log(`Loaded ${messages.value.length} protocol messages from storage`)
        updateStorageUsage()
      } else {
        console.error('Invalid protocol messages data format, keeping existing messages')
      }
    } catch (error) {
      console.error('Failed to load protocol messages from storage:', error)
      // Keep existing in-memory messages — don't wipe on error
    }
  }
  
  // Serialize encrypted saves: concurrent fetches must not write stale
  // snapshots out of order (a reload could otherwise lose messages whose
  // packets were already ACKed, #350).
  let saveQueue = Promise.resolve()

  function saveToStorage() {
    const run = async () => {
    try {
      // Derive the encryption key on demand (init() may not have run yet).
      if (!encryptionKey.value) {
        const identity = useIdentityStore()
        if (identity.privateKey) {
          encryptionKey.value = await deriveEncryptionKey(identity.privateKey)
        }
      }
      if (!encryptionKey.value) {
        console.warn('No encryption key available, skipping save')
        return
      }
      
      // Cleanup before save
      cleanupOldMessages()
      
      // Limit number of messages
      if (messages.value.length > MAX_MESSAGES) {
        messages.value = messages.value.slice(-MAX_MESSAGES)
        console.warn(`Truncated protocol messages to ${MAX_MESSAGES} (max limit)`)
      }
      
      // Encrypt data (messages + refill requests so the "refill blocks" survive
      // a reload).
      const payload = { messages: messages.value, refillRequests: refillRequests.value }
      const encryptedData = await encryptData(encryptionKey.value, payload)
      localStorage.setItem(STORAGE_KEY, encryptedData)
      
      // Also save unencrypted copy in debug mode
      if (debugMode.value) {
        localStorage.setItem(STORAGE_DEBUG_KEY, JSON.stringify(payload, null, 2))
      }
      
      updateStorageUsage()
      console.log(`Saved ${messages.value.length} protocol messages to storage`)
    } catch (error) {
      console.error('Failed to save protocol messages to storage:', error)
      
      // Fallback to insecure storage if encryption fails
      if (debugMode.value) {
        console.warn('Using fallback storage (unencrypted) due to encryption error')
        localStorage.setItem(STORAGE_DEBUG_KEY, JSON.stringify({ messages: messages.value, refillRequests: refillRequests.value }))
      }
    }
    }
    saveQueue = saveQueue.then(run, run)
    return saveQueue
  }
  
  // Add new protocol messages
  async function addMessages(newMessages) {
    if (!newMessages || !Array.isArray(newMessages) || newMessages.length === 0) {
      return
    }

    // data travels inside the JWS payload on the wire — recover it before use.
    for (const msg of newMessages) {
      if (msg && !msg.data && typeof msg.jws === 'string' && msg.jws) {
        msg.data = decodeJwsPayload(msg.jws)
      }
    }
    
    // Extract node-broadcast election phase messages (authoritative phase) and
    // keep them out of the regular protocol message list.
    let phasesChanged = false
    for (const msg of newMessages) {
      if (!msg || msg.type !== 'election') continue
      try {
        const d = JSON.parse(msg.data || '{}')
        if (d.type !== 'phase' || !d.echo) continue
        electionPhases.value = {
          ...electionPhases.value,
          [d.echo]: {
            phase: d.phase,
            collectionEnd: d.collection_end || 0,
            votingEnd: d.voting_end || 0,
            candidates: Array.isArray(d.candidates) ? d.candidates : [],
            receivedAt: Date.now(),
          },
        }
        phasesChanged = true
      } catch { /* ignore */ }
    }
    if (phasesChanged) saveElectionPhases(electionPhases.value)

    // Filter for protocol types (excluding refill which goes to right sidebar)
    const protocolMessages = newMessages.filter(msg => {
      if (!msg || !msg.type || !PROTOCOL_TYPES.includes(msg.type) || msg.type === 'refill') return false
      if (msg.type === 'election') {
        try { if (JSON.parse(msg.data || '{}').type === 'phase') return false } catch { /* ignore */ }
      }
      return true
    })
    
    // Process refill messages separately
    const refillMsgs = newMessages.filter(msg => 
      msg && msg.type === 'refill'
    )
    let refillChanged = false
    if (refillMsgs.length > 0) {
      const existingRefillIds = new Set(refillRequests.value.map(r => r.messageId))
      for (const msg of refillMsgs) {
        if (msg.message_id && !existingRefillIds.has(msg.message_id)) {
          try {
            const data = JSON.parse(msg.data || '{}')
            if (data.type === 'request' && data.refill) {
              refillRequests.value.push({
                messageId: msg.message_id,
                from: data.refill.from || data.from || '',
                echoName: data.refill.echo || data.echo || '',
                before: data.refill.before || '',
                timestamp: msg.timestamp,
              })
              refillChanged = true
            }
          } catch {}
        }
      }
    }
    
    if (protocolMessages.length === 0) {
      // Persist refill requests even when there are no other protocol messages.
      if (refillChanged) await saveToStorage()
      return
    }
    
    // Deduplicate by message_id
    const existingIds = new Set(messages.value.map(m => m.message_id))
    const uniqueNewMessages = protocolMessages.filter(msg => 
      msg.message_id && !existingIds.has(msg.message_id)
    )
    
    if (uniqueNewMessages.length === 0) {
      if (refillChanged) await saveToStorage()
      return
    }
    
    // Add new messages
    messages.value.push(...uniqueNewMessages)
    
    // Sort by timestamp (newest first)
    messages.value.sort((a, b) => b.timestamp - a.timestamp)
    
    // Save to storage
    await saveToStorage()
    
    console.log(`Added ${uniqueNewMessages.length} new protocol messages`)
  }
  
  // Get messages filtered by echo name
  function getByEcho(echoName) {
    if (!echoName) return []
    return messages.value.filter(msg => msg.echo_name === echoName)
  }
  
  // Get active protocol messages for an echo
  function getActiveByEcho(echoName) {
    const echoMessages = getByEcho(echoName)
    if (echoMessages.length === 0) return []
    
    // Filter by activity criteria
    const activeMessages = echoMessages.filter(msg => {
      const criteria = ACTIVITY_CRITERIA[msg.type]
      if (criteria) {
        return criteria(msg, echoMessages)
      }
      // Default: check if recent
      const messageDate = new Date(msg.timestamp * 1000)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - ACTIVE_DAYS_LIMIT)
      return messageDate > cutoffDate
    })
    
    // No cap: a policy change can create many chunk votes at once, all of which
    // must be visible.
    return activeMessages
  }
  
  // Active protocols ready for display: one card per protocol. Election posters
  // are merged into a single card (with _merged/_posterCount); hidden/cancelled
  // protocols and internal change_policy chunk carriers are dropped.
  function getActiveProtocols(echoName) {
    const hidden = hiddenProtocols.value
    const cancelled = cancelledProtocols.value
    const msgs = getActiveByEcho(echoName).filter(msg => {
      if (hidden[msg.message_id]) return false
      if (cancelled[msg.message_id]) return false
      if (msg.type === 'vote') {
        try {
          const data = JSON.parse(msg.data)
          return data.type === 'poster' || data.type === 'result'
        } catch {
          return true
        }
      }
      try {
        const data = JSON.parse(msg.data)
        if (data.type === 'cancel' || data.type === 'vote') return false
        // Internal change_policy chunk carriers are not protocols themselves.
        if (msg.type === 'change_policy') {
          if (data.chunk_index !== undefined) return false
          if (msg.sender_address === ':0:0' || data.from === ':0:0') return false
        }
      } catch { /* keep */ }
      return true
    })

    // Group change_policy chunk vote posters into ONE card per policy change:
    // the card lists the chunks (click a chunk to see its text and vote).
    const parseData = (m) => { try { return JSON.parse(m.data) || {} } catch { return {} } }
    const isChangePolicyChunk = (m) => m.type === 'vote' && parseData(m).protocol === 'change_policy'
    const chunkPosters = msgs.filter(isChangePolicyChunk)
    const withoutChunks = msgs.filter(m => !isChangePolicyChunk(m))

    // Diff text lives in the internal carrier messages (type change_policy).
    const carriers = new Map()
    for (const m of getByEcho(echoName)) {
      if (m.type !== 'change_policy') continue
      const d = parseData(m)
      if (d.chunk_index === undefined) continue
      carriers.set(`${d.metadata?.state_key || d.state_key || ''}|${d.chunk_index}`, d)
    }

    const groups = new Map()
    const ungrouped = []
    for (const poster of chunkPosters) {
      const d = parseData(poster)
      const pd = d.protocol_data || {}
      const key = pd.state_key || `${pd.proposer || d.from || ''}|${pd.subject || ''}`
      if (!key || key === '|') {
        ungrouped.push(poster)
        continue
      }
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(poster)
    }
    const changePolicyCards = []
    for (const [stateKey, posters] of groups) {
      const sorted = [...posters].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      const chunks = sorted.map(poster => {
        const d = parseData(poster)
        const pd = d.protocol_data || {}
        const chunkIndex = pd.chunk_index ?? 0
        const carrier = carriers.get(`${stateKey}|${chunkIndex}`)
        return {
          poster,
          chunkIndex,
          totalChunks: pd.total_chunks || posters.length,
          subject: pd.subject || '',
          text: carrier?.message || d.message || '',
        }
      }).sort((a, b) => a.chunkIndex - b.chunkIndex)
      changePolicyCards.push({
        ...sorted[0],
        _changePolicy: true,
        _stateKey: stateKey,
        _chunks: chunks,
      })
    }

    // Merge sessions (#348): all chunk/phase vote posters and the internal
    // merge carriers (data exchange, nodelist, started) become ONE card per
    // state_key. The internal carriers are not protocols of their own and are
    // not shown separately in Active Protocols.
    const allEcho = getByEcho(echoName)
    const isMergeVote = (m) => m.type === 'vote' && parseData(m).protocol === 'merge'
    const isMergeVotePoster = (m) => isMergeVote(m) && parseData(m).type === 'poster'
    const mergeGroups = new Map()
    const mergeGroup = (stateKey) => {
      if (!mergeGroups.has(stateKey)) {
        mergeGroups.set(stateKey, { stateKey, posters: [], carriers: [], finished: false })
      }
      return mergeGroups.get(stateKey)
    }
    for (const m of allEcho) {
      if (m.type !== 'merge') continue
      const d = parseData(m)
      const key = d.state_key || d.protocol_data?.state_key || d.metadata?.state_key
      if (!key) continue
      const group = mergeGroup(key)
      group.carriers.push(m)
      if (d.type === 'result' && (d.result === 'merged' || d.result === 'fail' || d.result === 'failed')) {
        group.finished = true
      }
    }
    const ungroupedMerges = []
    // Merge posters are collected from ALL messages, not just the "active"
    // ones: chunk votes get results one by one, but the session card must keep
    // showing every chunk badge until the merge itself finishes (#350).
    for (const m of allEcho) {
      if (!isMergeVotePoster(m)) continue
      const d = parseData(m)
      const pd = d.protocol_data || {}
      const key = pd.state_key || d.state_key
      if (!key) {
        ungroupedMerges.push(m)
        continue
      }
      mergeGroup(key).posters.push(m)
    }
    const mergeCards = []
    for (const group of mergeGroups.values()) {
      if (group.finished) continue // the result stays in the feed
      const posters = [...group.posters].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      const chunks = []
      const stages = []
      for (const poster of posters) {
        const d = parseData(poster)
        const pd = d.protocol_data || {}
        if (pd.chunk_index !== undefined) {
          chunks.push({
            poster,
            chunkIndex: pd.chunk_index,
            totalChunks: pd.total_chunks || posters.length,
            subject: pd.subject || '',
            text: pd.message || d.message || '',
          })
        } else if (typeof pd.phase === 'number') {
          stages.push({
            poster,
            phase: pd.phase,
            text: pd.message || d.message || '',
          })
        }
      }
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
      stages.sort((a, b) => a.phase - b.phase)
      if (posters.length === 0 && group.carriers.length === 0) continue
      const base = chunks[0]?.poster ||
        stages[stages.length - 1]?.poster ||
        group.carriers.find(m => parseData(m).type === 'started') ||
        group.carriers[0]
      if (!base) continue
      const baseData = parseData(base)
      const pd = baseData.protocol_data || {}
      const infos = [baseData, ...group.carriers.map(parseData)]
      const node1 = pd.node1 || (infos.find(d => d.node1) || {}).node1 || ''
      const node2 = pd.node2 || (infos.find(d => d.node2) || {}).node2 || ''
      // Policies are stored by the phase-0 poster (initiator) and by the data
      // exchange carrier (both nodes, #257); show whichever is available.
      const posterPolicyData = posters
        .map(p => parseData(p).protocol_data || {})
        .find(x => x.policy1 || x.policy2) || {}
      const carrierPolicy = group.carriers
        .map(parseData)
        .find(d => d.policy1 || d.policy2) || {}
      const posterInfoData = posters
        .map(p => parseData(p).protocol_data || {})
        .find(x => x.nodelist1_info || x.nodelist2_info) || {}
      const carrierInfo = group.carriers
        .map(parseData)
        .find(d => d.nodelist1_info || d.nodelist2_info) || {}
      mergeCards.push({
        ...base,
        _merge: true,
        _hideId: `merge:${group.stateKey}`,
        _stateKey: group.stateKey,
        _chunks: chunks,
        _stages: stages,
        _node1: node1,
        _node2: node2,
        _policy1: posterPolicyData.policy1 || carrierPolicy.policy1 || null,
        _policy2: posterPolicyData.policy2 || carrierPolicy.policy2 || null,
        _nodelist1: pd.nodelist1 || (infos.find(d => d.nodelist1) || {}).nodelist1 || null,
        _nodelist2: pd.nodelist2 || (infos.find(d => d.nodelist2) || {}).nodelist2 || null,
        _nodelist1_info: posterInfoData.nodelist1_info || carrierInfo.nodelist1_info || null,
        _nodelist2_info: posterInfoData.nodelist2_info || carrierInfo.nodelist2_info || null,
      })
    }
    const withoutMerge = withoutChunks.filter(m => m.type !== 'merge' && !isMergeVote(m))

    // Merge election POSTERS into a single card; each election RESULT stays its
    // own card so the outcome remains visible.
    const isPoster = (m) => { try { return JSON.parse(m.data).type === 'poster' } catch { return true } }
    const electionPosters = withoutMerge.filter(m => m.type === 'election' && isPoster(m))
    const electionResults = withoutMerge.filter(m => m.type === 'election' && !isPoster(m))
    const nonElection = withoutMerge.filter(m => m.type !== 'election')

    const out = [
      ...nonElection,
      ...electionResults,
      ...ungrouped,
      ...changePolicyCards,
      ...mergeCards.filter(card => !hidden[card._hideId]),
      ...ungroupedMerges,
    ]
    if (electionPosters.length > 0) {
      const sorted = [...electionPosters].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      out.push({
        ...sorted[0],
        _merged: true,
        _posterCount: electionPosters.length,
      })
    }

    // Hide finished votes from the active list (issue #262): the node resolves
    // them at the end of their voting period and posts a result message, which
    // stays in the feed. A grouped change_policy card disappears once every
    // chunk is over.
    void paramsReady()
    const isEndedVote = (poster) => getVoteState(poster)?.phase === 'ended'
    return out.filter(m => {
      if (m._merge) return true // hidden only when the merge result exists
      if (m._changePolicy) return !m._chunks.every(chunk => isEndedVote(chunk.poster))
      if (m.type === 'vote') return !isEndedVote(m)
      return true
    })
  }

  /** Hide (dismiss) a protocol card. */
  function hideProtocol(messageId) {
    if (!messageId) return
    hiddenProtocols.value = { ...hiddenProtocols.value, [messageId]: true }
    saveProtocolSet(HIDDEN_PROTOCOLS_KEY, hiddenProtocols.value)
  }

  /** Mark a protocol as cancelled (optimistically, before the node confirms). */
  function cancelProtocol(messageId) {
    if (!messageId) return
    cancelledProtocols.value = { ...cancelledProtocols.value, [messageId]: true }
    saveProtocolSet(CANCELLED_PROTOCOLS_KEY, cancelledProtocols.value)
  }
  
  // Cleanup messages older than CLEANUP_DAYS
  function cleanupOldMessages() {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_DAYS)
    const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000)
    
    const initialCount = messages.value.length
    messages.value = messages.value.filter(msg => msg.timestamp >= cutoffTimestamp)
    
    const removedCount = initialCount - messages.value.length
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} old protocol messages (older than ${CLEANUP_DAYS} days)`)
      saveToStorage()
    }
  }
  
  // Update storage usage statistics
  function updateStorageUsage() {
    try {
      const data = JSON.stringify(messages.value)
      storageUsage.value = new Blob([data]).size // bytes
    } catch {
      storageUsage.value = 0
    }
  }
  
  // Clear all messages (for testing/debugging)
  async function clearAll() {
    messages.value = []
    refillRequests.value = []
    hiddenProtocols.value = {}
    cancelledProtocols.value = {}
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_DEBUG_KEY)
    localStorage.removeItem(HIDDEN_PROTOCOLS_KEY)
    localStorage.removeItem(CANCELLED_PROTOCOLS_KEY)
    console.log('Cleared all protocol messages')
  }
  
  // Toggle debug mode
  function toggleDebugMode() {
    debugMode.value = !debugMode.value
    if (debugMode.value) {
      console.log('Debug mode enabled')
    }
  }
  
  // Get storage statistics
  function getStorageStats() {
    return {
      totalMessages: totalCount.value,
      maxMessages: MAX_MESSAGES,
      usagePercentage: Math.round((totalCount.value / MAX_MESSAGES) * 100),
      storageBytes: storageUsage.value,
      isStorageFull: isStorageFull.value,
      isStorageCritical: isStorageCritical.value
    }
  }
  
  // Move protocol cards and election phase state when a conference is renamed.
  async function renameEchoState(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return
    let changed = false
    for (const message of messages.value) {
      if (message.echo_name === oldName) {
        message.echo_name = newName
        changed = true
      }
    }
    for (const request of refillRequests.value) {
      if (request.echoName === oldName) {
        request.echoName = newName
        changed = true
      }
    }
    if (electionPhases.value[oldName]) {
      electionPhases.value = {
        ...electionPhases.value,
        [newName]: electionPhases.value[oldName],
      }
      delete electionPhases.value[oldName]
      saveElectionPhases(electionPhases.value)
      changed = true
    }
    if (changed) await saveToStorage()
  }

  // Initialize on store creation
  init()
  
  return {
    // State
    messages,
    refillRequests,
    electionPhases,
    storageUsage,
    debugMode,
    hiddenProtocols,
    cancelledProtocols,
    
    // Getters
    totalCount,
    isStorageFull,
    isStorageCritical,
    
    // Actions
    init,
    loadFromStorage,
    saveToStorage,
    addMessages,
    getByEcho,
    getActiveByEcho,
    getActiveProtocols,
    renameEchoState,
    hideProtocol,
    cancelProtocol,
    cleanupOldMessages,
    clearAll,
    toggleDebugMode,
    getStorageStats,
    updateStorageUsage
  }
})