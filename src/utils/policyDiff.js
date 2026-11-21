/**
 * Policy diff utilities: line hunks for the policy text and a value diff for
 * the policy parameters. Pure functions, no dependencies.
 */

const IGNORED_PARAMETERS = ['special_echogroups']

function splitLines(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n')
  if (normalized === '') return []
  const lines = normalized.split('\n')
  // A trailing newline produces a final empty element; drop it so that adding
  // a newline at the end does not look like an added empty line.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * Longest common subsequence of two arrays of strings.
 * Returns a list of operations in order: {type:'same'|'remove'|'add', text}.
 */
function lcsOps(oldLines, newLines) {
  const n = oldLines.length
  const m = newLines.length
  // dp[i][j] = LCS length of oldLines[i..] and newLines[j..]
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'same', text: oldLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', text: oldLines[i] })
      i++
    } else {
      ops.push({ type: 'add', text: newLines[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'remove', text: oldLines[i++] })
  while (j < m) ops.push({ type: 'add', text: newLines[j++] })
  return ops
}

/**
 * Line diff of two texts, grouped into hunks with `context` unchanged lines
 * around each change (git-style). Returns
 * {hunks:[{oldStart,newStart,lines:[{type,text}]}], added, removed}.
 */
export function diffTextLines(oldText, newText, { context = 3 } = {}) {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  const ops = lcsOps(oldLines, newLines)

  // Mark which ops are inside a hunk: changes plus `context` neighbours.
  const keep = new Array(ops.length).fill(false)
  ops.forEach((op, index) => {
    if (op.type === 'same') return
    const from = Math.max(0, index - context)
    const to = Math.min(ops.length - 1, index + context)
    for (let k = from; k <= to; k++) keep[k] = true
  })

  const hunks = []
  let oldLine = 1
  let newLine = 1
  let current = null
  let added = 0
  let removed = 0

  ops.forEach((op, index) => {
    if (op.type === 'add') added++
    if (op.type === 'remove') removed++
    if (!keep[index]) {
      if (op.type !== 'add') oldLine++
      if (op.type !== 'remove') newLine++
      current = null
      return
    }
    if (!current) {
      current = { oldStart: oldLine, newStart: newLine, lines: [] }
      hunks.push(current)
    }
    current.lines.push({ type: op.type, text: op.text })
    if (op.type !== 'add') oldLine++
    if (op.type !== 'remove') newLine++
  })

  return { hunks, added, removed }
}

/**
 * Value diff of the policy parameters (values are compared as strings).
 * Returns [{type:'added'|'removed'|'changed', key, old, new}].
 */
export function diffPolicyParams(oldParams, newParams, { ignore = IGNORED_PARAMETERS } = {}) {
  const prev = oldParams || {}
  const next = newParams || {}
  const ignored = new Set(ignore)
  const changes = []
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const key of [...keys].sort()) {
    if (ignored.has(key)) continue
    // Nested maps (rate_limit) are compared per key with dotted labels.
    if (key === 'rate_limit') {
      const prevLimits = prev[key] && typeof prev[key] === 'object' ? prev[key] : {}
      const nextLimits = next[key] && typeof next[key] === 'object' ? next[key] : {}
      const innerKeys = new Set([...Object.keys(prevLimits), ...Object.keys(nextLimits)])
      for (const inner of [...innerKeys].sort()) {
        const hasOldInner = prevLimits[inner] !== undefined
        const hasNewInner = nextLimits[inner] !== undefined
        const oldInner = hasOldInner ? String(prevLimits[inner]) : undefined
        const newInner = hasNewInner ? String(nextLimits[inner]) : undefined
        if (oldInner === newInner) continue
        if (!hasOldInner) changes.push({ type: 'added', key: `${key}.${inner}`, old: null, new: newInner })
        else if (!hasNewInner) changes.push({ type: 'removed', key: `${key}.${inner}`, old: oldInner, new: null })
        else changes.push({ type: 'changed', key: `${key}.${inner}`, old: oldInner, new: newInner })
      }
      continue
    }
    const hasOld = prev[key] !== undefined
    const hasNew = next[key] !== undefined
    const oldValue = hasOld ? String(prev[key]) : undefined
    const newValue = hasNew ? String(next[key]) : undefined
    if (oldValue === newValue) continue
    if (!hasOld) changes.push({ type: 'added', key, old: null, new: newValue })
    else if (!hasNew) changes.push({ type: 'removed', key, old: oldValue, new: null })
    else changes.push({ type: 'changed', key, old: oldValue, new: newValue })
  }
  return changes
}

function policyText(payload) {
  return payload?.policy?.text ?? ''
}

function policyParams(payload) {
  return payload?.policy?.parameters ?? {}
}

/**
 * Full diff between two policy payloads (as stored in localStorage).
 * `hasPrevious` is false when there is nothing to compare with.
 */
export function computePolicyDiff(previousPolicy, nextPolicy) {
  const hasPrevious = !!(previousPolicy && previousPolicy.policy)
  const text = diffTextLines(policyText(previousPolicy), policyText(nextPolicy))
  const params = hasPrevious ? diffPolicyParams(policyParams(previousPolicy), policyParams(nextPolicy)) : []
  const hasChanges = text.hunks.length > 0 || params.length > 0
  return { hasPrevious, text, params, hasChanges }
}
