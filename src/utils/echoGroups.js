// User-defined conference groups (issue #366).
//
// Stored in localStorage as:
//   { groups: [{ id, name, echoes: [echoName] }], expanded: { [id]: false } }
// The system "Unread" and "Ungrouped" sections are computed by Echoes.vue and
// are not stored here.

export const ECHO_GROUPS_KEY = 'fm_echo_groups'
export const UNREAD_GROUP_ID = '__unread__'
export const UNGROUPED_GROUP_ID = '__ungrouped__'

export function emptyEchoGroups() {
  return {
    groups: [],
    expanded: { [UNREAD_GROUP_ID]: true, [UNGROUPED_GROUP_ID]: true },
  }
}

export function loadEchoGroups() {
  try {
    const raw = JSON.parse(localStorage.getItem(ECHO_GROUPS_KEY) || 'null')
    if (!raw || !Array.isArray(raw.groups)) return emptyEchoGroups()
    return {
      groups: raw.groups
        .filter(group => group && typeof group.id === 'string' && typeof group.name === 'string')
        .map(group => ({
          id: group.id,
          name: group.name,
          echoes: Array.isArray(group.echoes) ? group.echoes.filter(name => typeof name === 'string') : [],
        })),
      expanded: raw.expanded && typeof raw.expanded === 'object' ? { ...raw.expanded } : {},
    }
  } catch {
    return emptyEchoGroups()
  }
}

export function saveEchoGroups(state) {
  try {
    localStorage.setItem(ECHO_GROUPS_KEY, JSON.stringify({
      groups: state.groups || [],
      expanded: state.expanded || {},
    }))
  } catch { /* ignore */ }
}

export function newEchoGroupId() {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Move the selected echoes into [targetGroupId] (or out of every group when it
 * is empty). A conference belongs to at most one user group.
 */
export function assignEchoesToGroup(groups, echoNames, targetGroupId) {
  const selected = new Set(echoNames || [])
  const next = groups.map(group => ({
    ...group,
    echoes: group.echoes.filter(name => !selected.has(name)),
  }))
  if (targetGroupId) {
    const target = next.find(group => group.id === targetGroupId)
    if (target) {
      for (const name of selected) {
        if (!target.echoes.includes(name)) target.echoes.push(name)
      }
    }
  }
  return next
}

/**
 * Remove a saved group. Its conferences are not touched: once the group is
 * gone they fall into the computed "Ungrouped" section (#388).
 */
export function removeEchoGroup(groups, groupId) {
  if (!groupId) return groups
  return groups.filter(group => group.id !== groupId)
}

/** Replace a conference name in every group after a server-side rename. */
export function renameEchoInGroups(groups, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return groups
  return groups.map(group => ({
    ...group,
    echoes: [...new Set(group.echoes.map(name => name === oldName ? newName : name))],
  }))
}
