// Protocol messages configuration
export const MAX_MESSAGES = 1000;
export const ACTIVE_DAYS_LIMIT = 7;
export const STORAGE_KEY = 'fm_protocol_messages_encrypted';
export const STORAGE_DEBUG_KEY = 'fm_protocol_messages_debug';
export const CLEANUP_DAYS = 30; // Clean messages older than 30 days

// Protocol types to filter from regular messages
export const PROTOCOL_TYPES = [
  'election',
  'vote', 
  'merge',
  'conflict',
  'recover',
  'refill',
  'change_policy',
  'change_rules',
  'remove_echo',
  'excommunicate',
  'appeal',
  'remote_subscribe'
];

// Activity criteria for each protocol type
export const ACTIVITY_CRITERIA = {
  // refill: request without response (matching messageId)
  refill: (msg, allMessages) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === 'request' && data.refill && data.refill.messageId) {
        const hasResponse = allMessages.some(m => {
          try {
            const mData = JSON.parse(m.data);
            return mData.type === 'response' && 
                   mData.refill && 
                   mData.refill.messageId === data.refill.messageId &&
                   m.type === 'refill' &&
                   m.echo_name === msg.echo_name;
          } catch {
            return false;
          }
        });
        return !hasResponse;
      }
      return false;
    } catch {
      return false;
    }
  },
  
  // election: poster active until result appears; the result stays visible
  // (until dismissed) so users can see who won and the vote distribution.
  election: (msg, allMessages) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === 'poster') {
        const hasResult = allMessages.some(m => {
          try {
            const d = JSON.parse(m.data);
            return d.type === 'result' && m.echo_name === msg.echo_name && m.type === 'election';
          } catch { return false; }
        });
        return !hasResult;
      }
      if (data.type === 'result') {
        return isMessageRecent(msg, ACTIVE_DAYS_LIMIT);
      }
      return false;
    } catch {
      return false;
    }
  },
  
  // vote: no result field
  vote: (msg, allMessages) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.result !== undefined && data.result !== null) return false;
      if (data.type === 'poster') {
        const hasResult = allMessages.some(m => {
          try {
            const d = JSON.parse(m.data);
            return d.type === 'result' && d.poster_message === data.message;
          } catch { return false; }
        });
        if (hasResult) return false;
      }
      return true;
    } catch {
      return false;
    }
  },
  
  // merge, conflict, recover: not resolved and recent
  merge: (msg, all) => checkResolvedAndRecent(msg) && !hasCancelResult(msg, all),
  conflict: (msg, all) => checkResolvedAndRecent(msg) && !hasCancelResult(msg, all),
  recover: (msg, all) => checkResolvedAndRecent(msg) && !hasCancelResult(msg, all),
  
  // change_policy, remove_echo, excommunicate: recent only.
  // Internal change_policy chunk carriers (with chunk_index) are not protocols
  // themselves — the per-chunk vote posters are the active protocols.
  change_policy: (msg, all) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.chunk_index !== undefined) return false;
    } catch { /* keep */ }
    return checkRecentOnly(msg) && !hasCancelResult(msg, all);
  },
  remove_echo: (msg, all) => checkRecentOnly(msg) && !hasCancelResult(msg, all),
  excommunicate: (msg, all) => checkRecentOnly(msg) && !hasCancelResult(msg, all),
  appeal: (msg, all) => checkRecentOnly(msg) && !hasCancelResult(msg, all)
};

// Helper functions
function checkResolvedAndRecent(msg) {
  try {
    const data = JSON.parse(msg.data);
    const isResolved = data.resolved === true;
    const isRecent = isMessageRecent(msg, ACTIVE_DAYS_LIMIT);
    return !isResolved && isRecent;
  } catch {
    return false;
  }
}

function checkRecentOnly(msg) {
  return isMessageRecent(msg, ACTIVE_DAYS_LIMIT);
}

function isMessageRecent(msg, daysLimit) {
  const messageDate = new Date(msg.timestamp * 1000);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysLimit);
  return messageDate > cutoffDate;
}

// Debug mode
export const DEBUG = import.meta.env.DEV || false;
function hasCancelResult(msg, allMessages) {
  try {
    const data = JSON.parse(msg.data);
    if (data.type === 'cancel') return true;

    // Check optimistic localStorage cancels first
    const cancelled = JSON.parse(localStorage.getItem('fm_cancelled_messages') || '{}');
    if (cancelled[msg.message_id]) return true;

    if (!allMessages) return false;
    const targetId = msg.message_id;
    return allMessages.some(m => {
      try {
        const d = JSON.parse(m.data);
        // Cancel message referencing this poster
        if (d.type === 'cancel' && d.original_message_id === targetId) return true;
        if (m.type !== msg.type) return false;
        // Result message for this specific poster  
        if (d.type === 'result' && d.result === 'cancelled') {
          if (d.poster_message && d.poster_message === data.message) return true;
          if (d.originalMessageId && d.originalMessageId === targetId) return true;
        }
        return false;
      } catch { return false; }
    });
  } catch { return false; }
}
