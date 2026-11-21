import { useSettingsStore } from '../stores/settings'
import { useNamesStore } from '../stores/names'
import { useProtocolStore } from '../stores/protocol'
import { keyService } from '../services/keyService'
import * as db from '../services/db'
import * as blogStore from '../services/blogStore'

/**
 * Import helpers shared between the password dialog and Settings page.
 * The full export file (see fullExport in Settings.vue) has the shape:
 *   { appUrl, settings, emojis, keys, user, subscriptions, structure:{echoes,netmailFolders,blogs},
 *     messages:{ "echo_<name>":[], "__netmail__":[], "netmail_<slug>":[] }, blogPosts:[...] }
 *
 * Base netmail folders (inbox/sent/errors/bad/dup) are NOT separate object
 * stores — they are views over the single "__netmail__" store, so a base folder
 * import filters the messages of that store by the same classification the UI
 * uses (see Netmail.vue folderCount/currentMessages).
 */

const BASE_NETMAIL_FOLDERS = ['inbox', 'sent', 'errors', 'bad', 'dup']

/**
 * localStorage keys that belong to the current identity. They are dropped when
 * an import brings different keys: the old session password no longer matches
 * the imported key, stale policy/client-sync data belongs to the previous
 * address, and ciphertext from the old key can not be decrypted anymore.
 */
const IDENTITY_SCOPED_KEYS = [
  'fm_session_password',
  'fm_policy_params',
  'fm_policy_full',
  'fm_policy_accepted',
  'fm_policy_prev',
  'fm_node_public_key',
  'fm_echo_last_read',
  'fm_echo_catalog',
  'fm_echo_groups',
  'fm_netmail_last_read',
  'fm_dismissed_messages',
  'fm_my_refills',
  'fm_drafts',
  'fm_client_id',
  'fm_client_sync_known',
  'fm_addr_names',
]

/**
 * Drop state of the previous identity before restoring a backup with different
 * keys (see IDENTITY_SCOPED_KEYS). Exported for tests.
 */
export async function clearIdentityScopedState() {
  for (const key of IDENTITY_SCOPED_KEYS) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }
  try { useProtocolStore().clearAll() } catch (err) { console.warn('[import] protocol clear failed:', err) }
  try { keyService.clearCache() } catch (err) { console.warn('[import] key cache clear failed:', err) }
  try { useNamesStore().clear() } catch (err) { console.warn('[import] names clear failed:', err) }
  // Messages of the previous identity cannot be decrypted with the new keys.
  try { await db.deleteMessageDB() } catch (err) { console.warn('[import] message db reset failed:', err) }
}

/** Merge the exported address→names directory into the current one. */
function restoreNames(names) {
  if (!names) return
  try {
    const imported = typeof names === 'string' ? JSON.parse(names) : names
    if (!imported || typeof imported !== 'object') return
    let current = {}
    try { current = JSON.parse(localStorage.getItem('fm_addr_names') || '{}') } catch { current = {} }
    const merged = { ...imported }
    for (const [address, entry] of Object.entries(current)) {
      const seen = Array.isArray(entry?.seen) ? entry.seen : []
      const importedSeen = Array.isArray(merged[address]?.seen) ? merged[address].seen : []
      merged[address] = { seen: [...new Set([...seen, ...importedSeen])].slice(0, 20) }
    }
    localStorage.setItem('fm_addr_names', JSON.stringify(merged))
  } catch (err) {
    console.warn('[import] failed to restore names:', err)
  }
}

/** Creates a hidden file input and resolves with the parsed JSON, or null on cancel. */
export function pickExportFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        const text = await file.text()
        resolve(JSON.parse(text))
      } catch (err) {
        console.error('[import] failed to parse file:', err)
        resolve({ parseError: err.message })
      }
    }
    input.click()
  })
}

/** Split __netmail__ messages into base folders, mirroring Netmail.vue classification. */
function classifyBaseNetmail(msgs, me) {
  const out = { inbox: [], sent: [], errors: [], bad: [], dup: [] }
  for (const m of msgs || []) {
    if (m._isDup) { out.dup.push(m); continue }
    if (m._decryptError) { out.bad.push(m); continue }
    let isError = false
    try {
      const d = typeof m.data === 'string' ? JSON.parse(m.data) : m.data
      isError = !!(d && d.type === 'error')
    } catch { /* ignore */ }
    if (isError) { out.errors.push(m); continue }
    if (me && m.sender_address === me) { out.sent.push(m); continue }
    out.inbox.push(m)
  }
  return out
}

/**
 * Analyse an export file for the import dialog.
 * @returns {object} available importable content
 */
export function analyzeExport(data) {
  const me = data.user?.address || null
  const messages = data.messages || {}

  // Echoes that actually carry messages in the file.
  const echoes = []
  for (const [storeName, msgs] of Object.entries(messages)) {
    if (storeName.startsWith('echo_') && Array.isArray(msgs)) {
      echoes.push({ name: storeName.slice('echo_'.length), count: msgs.length })
    }
  }
  echoes.sort((a, b) => a.name.localeCompare(b.name))

  // Base netmail folders (derived from __netmail__).
  const baseNetmail = messages['__netmail__'] || []
  const baseCounts = classifyBaseNetmail(baseNetmail, me)
  const netmailBaseFolders = BASE_NETMAIL_FOLDERS
    .filter(f => (baseCounts[f] || []).length > 0)
    .map(f => ({ folder: f, count: baseCounts[f].length }))

  // Custom netmail folder stores (netmail_<slug>).
  const folderMap = data.structure?.netmailFolders || data.netmailFolders || {}
  const netmailCustom = []
  for (const [storeName, msgs] of Object.entries(messages)) {
    if (storeName.startsWith('netmail_') && Array.isArray(msgs) && msgs.length > 0) {
      const slug = storeName.slice('netmail_'.length)
      netmailCustom.push({
        slug,
        store: storeName,
        label: folderMap[slug] || slug,
        count: msgs.length,
      })
    }
  }
  netmailCustom.sort((a, b) => a.label.localeCompare(b.label))

  return {
    version: data.version,
    parseError: data.parseError,
    hasSettings: !!data.settings,
    hasKeys: !!(data.keys?.publicKey && data.keys?.encryptedPrivateKey),
    hasStructure: !!(data.structure || data.subscriptions),
    echoes,
    netmailBaseFolders,
    netmailCustom,
    netmailPresent: baseNetmail.length > 0 || netmailCustom.length > 0,
    blogCount: Array.isArray(data.blogPosts) ? data.blogPosts.length : 0,
  }
}

/**
 * Apply an import from a parsed export file.
 * @param {object} data parsed export JSON
 * @param {object} options
 *   - core: bool          import settings + keys + user + subscriptions + folder structure
 *   - echoes: string[]    echo names whose message stores to import
 *   - netmailBase: string[] base folder names (inbox/sent/errors/bad/dup) to import
 *   - netmailCustom: string[] custom store names (netmail_<slug>) to import
 *   - blogs: bool         import blog posts
 * @returns {Promise<{failedStores:number}>}
 */
export async function applyImport(data, options = {}) {
  const {
    core = true,
    echoes = [],
    netmailBase = [],
    netmailCustom = [],
    blogs = false,
  } = options

  const settings = useSettingsStore()
  let failedStores = 0

  // Close any open fm_messages connection first: restoring folder stores / echo
  // stores bumps the DB version and would otherwise block on versionchange until
  // the previous connection is released. The app reloads after import anyway.
  await db.closeMessageDB()

  // ---- Core: settings + keys + user + subscriptions + folder structure ----
  if (core) {
    // Different keys mean a different identity: drop the previous identity's
    // state before restoring (stale ciphertext and the old session password
    // otherwise break the boot after the reload).
    const importedPubKey = data.keys?.publicKey
    const currentPubKey = (() => {
      try { return localStorage.getItem('fm_public_key') } catch { return null }
    })()
    if (importedPubKey && importedPubKey !== currentPubKey) {
      await clearIdentityScopedState()
    }

    // The display name has a single home: user.name in fm_user (the mirror of
    // users.name on the node, #296). Backups made before that refactor stored
    // it only in settings.userProfile.displayName — keep reading that as a
    // fallback, but never write it back into the settings.
    const importedDisplayName = (
      data.user?.name ||
      data.settings?.userProfile?.displayName ||
      ''
    ).trim()

    // Restore settings. The imported profile may still carry the legacy
    // displayName — it is not written back (the name lives in fm_user now).
    const importedProfile = { ...(data.settings?.userProfile || {}) }
    delete importedProfile.displayName
    if (data.settings || importedDisplayName) {
      await settings.updateSettings({
        application: { ...settings.application, ...(data.settings?.application || {}) },
        privacy: { ...settings.privacy, ...(data.settings?.privacy || {}) },
        ui: { ...settings.ui, ...(data.settings?.ui || {}) },
        network: { ...settings.network, ...(data.settings?.network || {}) },
        storage: { ...settings.storage, ...(data.settings?.storage || {}) },
        security: { ...settings.security, ...(data.settings?.security || {}) },
        userProfile: {
          ...settings.userProfile,
          ...importedProfile,
        },
      })
    }

    // Restore the address→names directory (sender names)
    restoreNames(data.names)

    // Restore emojis
    if (data.emojis?.length) {
      settings.updateSettings({ ui: { ...settings.ui, customEmojis: data.emojis } })
    }

    // Restore keys — write raw localStorage values (preserves encryption password)
    if (data.keys) {
      try {
        if (data.keys.publicKey) {
          localStorage.setItem('fm_public_key', data.keys.publicKey)
        }
        if (data.keys.encryptedPrivateKey) {
          localStorage.setItem('fm_encrypted_private_key', data.keys.encryptedPrivateKey)
        }
        if (data.keys.metadata) {
          localStorage.setItem('fm_key_metadata', typeof data.keys.metadata === 'string' ? data.keys.metadata : JSON.stringify(data.keys.metadata))
        }
        // The node public key: restored clients must encrypt their requests,
        // otherwise the node answers 502 (encrypted policy flow).
        if (data.keys.nodePublicKey) {
          localStorage.setItem('fm_node_public_key', String(data.keys.nodePublicKey))
        }
      } catch (keyErr) {
        console.warn('[import] failed to restore keys:', keyErr)
      }
    }

    // Restore user address. Roles (isAdmin/isModerator) are server-owned and
    // are re-confirmed from the node after the reload — never from a backup.
    if (data.user) {
      const { isAdmin, isModerator, ...userData } = data.user
      // Keep the display name in fm_user even when the backup stored it only
      // in settings.userProfile (pre-#296 backups).
      if (!userData.name && importedDisplayName) userData.name = importedDisplayName
      localStorage.setItem('fm_user', JSON.stringify(userData))
      // A restored name must reach the node too: the boot sync pushes this
      // marker once the identity is loaded (#296).
      if (importedDisplayName) {
        localStorage.setItem('fm_name_pending_push', importedDisplayName)
      }
    }

    // Restore subscriptions
    if (data.subscriptions) {
      localStorage.setItem('fm_subscriptions', JSON.stringify(data.subscriptions))
    }

    // (a) netmail custom folders: ensure the stores exist (structure only)
    if (data.structure?.netmailFolders || data.netmailFolders) {
      try {
        const folderMap = data.structure?.netmailFolders || data.netmailFolders
        for (const slug of Object.keys(folderMap)) {
          if (!Object.prototype.hasOwnProperty.call(db.getNetmailFolders(), slug)) {
            db.createNetmailFolder(folderMap[slug])
          }
        }
      } catch (e) {
        console.warn('[import] netmail folders restore failed', e)
      }
    }
    // (b) local blogs: restore blog records (posts restored separately below)
    const blogsToRestore = data.structure?.blogs?.length ? data.structure.blogs : (data.blogs || [])
    for (const b of blogsToRestore) {
      if (!b?.id) continue
      try {
        await blogStore.putBlog({ ...b, updatedAt: Date.now() })
      } catch (e) {
        console.warn('[import] blog record restore failed', b.id, e)
      }
    }
  }

  // ---- Content: echo message stores ----
  const messages = data.messages || {}
  let echoNames = []
  if (echoes.length > 0) {
    echoNames = echoes.filter(n => messages[`echo_${n}`]?.length)
    if (echoNames.length > 0) {
      try {
        const { initDB } = await import('../services/db')
        await initDB(echoNames)
      } catch (e) {
        console.warn('[import] init echo stores failed', e)
      }
      for (const n of echoNames) {
        try {
          await db.bulkPutMessages(n, messages[`echo_${n}`])
        } catch (dbErr) {
          console.warn('[import] failed to restore echo store', n, dbErr)
          failedStores++
        }
      }
    }
  }

  // ---- Content: netmail base folders (from __netmail__) ----
  const baseStore = messages['__netmail__'] || []
  if (baseStore.length > 0 && netmailBase.length > 0) {
    const me = data.user?.address || null
    const baseCounts = classifyBaseNetmail(baseStore, me)
    const wanted = []
    for (const f of netmailBase) {
      wanted.push(...(baseCounts[f] || []))
    }
    if (wanted.length > 0) {
      try {
        await db.bulkPutMessages('__netmail__', wanted)
      } catch (dbErr) {
        console.warn('[import] failed to restore base netmail:', dbErr)
        failedStores++
      }
    }
  }

  // ---- Content: custom netmail folder stores ----
  for (const storeName of netmailCustom) {
    const msgs = messages[storeName]
    if (!Array.isArray(msgs) || msgs.length === 0) continue
    const slug = storeName.startsWith('netmail_') ? storeName.slice('netmail_'.length) : storeName
    try {
      await db.ensureNetmailStore(slug)
      await db.bulkPutMessages(storeName, msgs)
    } catch (dbErr) {
      console.warn('[import] failed to restore custom netmail store', storeName, dbErr)
      failedStores++
    }
  }

  // ---- Content: blog posts ----
  if (blogs && Array.isArray(data.blogPosts) && data.blogPosts.length > 0) {
    try {
      await blogStore.importBlogsData([], data.blogPosts)
    } catch (e) {
      console.warn('[import] blog posts restore failed', e)
      failedStores++
    }
  }

  return { failedStores }
}
