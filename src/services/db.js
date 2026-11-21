import { openDB } from 'idb'

const DB_NAME = 'fm_messages'
const STORE_NAMES_KEY = 'fm_idb_stores'
const FOLDERS_KEY = 'fm_netmail_folders'

/** Возвращает каноническое имя ObjectStore для эхи */
export function echoStoreName(echoName) {
  return `echo_${echoName}`
}

/** Возвращает каноническое имя ObjectStore для папки netmail */
export function netmailStoreName(folder) {
  return `netmail_${folder}`
}

// ---- Custom netmail folders ----

/** Список кастомных папок netmail (slug-имя -> отображаемое имя) */
export function getNetmailFolders() {
  try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) || '{}') } catch { return {} }
}

function saveNetmailFolders(folders) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
}

/** Создать кастомную папку netmail. Возвращает slug или null, если имя занято. */
export function createNetmailFolder(name) {
  const clean = String(name || '').trim()
  if (!clean) return null
  const slug = clean.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '_').replace(/^_+|_+$/g, '') || `folder_${Date.now()}`
  const folders = getNetmailFolders()
  if (Object.prototype.hasOwnProperty.call(folders, slug)) return null
  folders[slug] = clean
  saveNetmailFolders(folders)
  // Ensure the IndexedDB store exists
  ensureNetmailStore(slug).catch(e => console.warn('[db] ensure netmail store', e))
  return slug
}

/** Удалить кастомную папку netmail и её содержимое */
export function deleteNetmailFolder(slug) {
  const folders = getNetmailFolders()
  delete folders[slug]
  saveNetmailFolders(folders)
  return _deleteStoreByName(netmailStoreName(slug))
}

async function _deleteStoreByName(storeName) {
  try {
    const db = await getDB()
    if (!db.objectStoreNames.contains(storeName)) return
    const v = getLastVersion()
    db.close()
    const newVersion = v + 1
    setLastVersion(newVersion)
    const currentNames = Array.from(db.objectStoreNames)
    await openDB(DB_NAME, newVersion, {
      upgrade(db) {
        if (db.objectStoreNames.contains(storeName)) {
          db.deleteObjectStore(storeName)
        }
        for (const name of currentNames) {
          if (name !== storeName && !db.objectStoreNames.contains(name)) {
            if (name === '__trash__') {
              const store = db.createObjectStore(name, { autoIncrement: true })
              store.createIndex('by_deleted_at', 'deletedAt')
            } else if (name === '__drafts__') {
              db.createObjectStore(name, { autoIncrement: true })
            } else {
              const store = db.createObjectStore(name, { keyPath: 'message_id' })
              store.createIndex('by_time', 'timestamp')
              store.createIndex('by_sender', 'sender_address')
            }
          }
        }
      },
    })
    _dbPromise = openMessageDB()
    await _dbPromise
  } catch (e) {
    console.warn('[db] delete store failed', storeName, e)
  }
}

/** Убедиться, что ObjectStore для кастомной папки существует */
export async function ensureNetmailStore(slug) {
  const storeName = netmailStoreName(slug)
  const db = await getDB()
  if (db.objectStoreNames.contains(storeName)) return
  const v = getLastVersion()
  const newVersion = v + 1
  db.close()
  setLastVersion(newVersion)
  const currentNames = Array.from(db.objectStoreNames)
  await openDB(DB_NAME, newVersion, {
    upgrade(db) {
      for (const name of currentNames) {
        if (!db.objectStoreNames.contains(name)) {
          if (name === '__trash__') {
            const store = db.createObjectStore(name, { autoIncrement: true })
            store.createIndex('by_deleted_at', 'deletedAt')
          } else if (name === '__drafts__') {
            db.createObjectStore(name, { autoIncrement: true })
          } else {
            const store = db.createObjectStore(name, { keyPath: 'message_id' })
            store.createIndex('by_time', 'timestamp')
            store.createIndex('by_sender', 'sender_address')
          }
        }
      }
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: 'message_id' })
        store.createIndex('by_time', 'timestamp')
        store.createIndex('by_sender', 'sender_address')
      }
    },
  })
  _dbPromise = openMessageDB()
  await _dbPromise
}

/** Базовые stores, которые всегда существуют */
function baseStores() {
  return [
    '__netmail__',
    netmailStoreName('inbox'),
    netmailStoreName('sent'),
    netmailStoreName('bad'),
    netmailStoreName('dup'),
    '__trash__',
    '__drafts__',
  ]
}

/** Получить последнюю версию БД из localStorage */
function getLastVersion() {
  try { return parseInt(localStorage.getItem('fm_idb_version') || '0', 10) } catch { return 0 }
}

/** Сохранить новую версию БД */
function setLastVersion(v) {
  localStorage.setItem('fm_idb_version', String(v))
}

/** Сохранить список известных ObjectStore имён */
function saveStoreNames(names) {
  localStorage.setItem(STORE_NAMES_KEY, JSON.stringify([...names]))
}

/** Загрузить список известных ObjectStore имён */
function loadStoreNames() {
  try {
    const raw = localStorage.getItem(STORE_NAMES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/** Вычислить все ObjectStore имена, которые должны существовать */
function computeStoreNames(echoNames) {
  const names = new Set(baseStores())
  for (const name of echoNames) {
    names.add(echoStoreName(name))
  }
  return names
}

let _dbPromise = null

/** Открывает (или переоткрывает) БД с нужным набором ObjectStore */
async function openMessageDB(echoNames = []) {
  const neededStores = computeStoreNames(echoNames)
  const currentVersion = getLastVersion()
  const newVersion = currentVersion > 0 ? currentVersion : 1

  const db = await openDB(DB_NAME, newVersion, {
    upgrade(db) {
      for (const name of neededStores) {
        if (!db.objectStoreNames.contains(name)) {
          if (name === '__trash__') {
            const store = db.createObjectStore(name, { autoIncrement: true })
            store.createIndex('by_deleted_at', 'deletedAt')
          } else if (name === '__drafts__') {
            db.createObjectStore(name, { autoIncrement: true })
          } else {
            const store = db.createObjectStore(name, { keyPath: 'message_id' })
            store.createIndex('by_time', 'timestamp')
            store.createIndex('by_sender', 'sender_address')
          }
        }
      }
    },
  })

  // Release this connection whenever a higher-version open (schema bump) is
  // requested by this or another tab/page. Without this, the versionchange
  // request waits forever for the connection to close and openDB hangs.
  db.onversionchange = () => {
    try { db.close() } catch { /* ignore */ }
  }

  const existingNames = new Set(Array.from(db.objectStoreNames))
  const missing = [...neededStores].filter(n => !existingNames.has(n))
  if (missing.length > 0) {
    db.close()
    const bumpedVersion = currentVersion + 1
    setLastVersion(bumpedVersion)
    saveStoreNames(neededStores)
    return openMessageDB(echoNames)
  }

  saveStoreNames(neededStores)
  return db
}

/** Получить объект БД (инициализирует при первом вызове) */
async function getDB() {
  if (!_dbPromise) {
    _dbPromise = openMessageDB()
  }
  return _dbPromise
}

/** Инициализация БД с известными эхами (вызывается из App.vue) */
export async function initDB(echoNames = []) {
  _dbPromise = openMessageDB(echoNames)
  await _dbPromise
}

/**
 * Закрыть текущее соединение с БД и сбросить кэш. Нужно перед операциями,
 * повышающими версию схемы (например, импорт), иначе openDB с новым набором
 * store повиснет на versionchange, пока старое соединение открыто.
 */
export async function closeMessageDB() {
  if (_dbPromise) {
    try {
      const db = await _dbPromise
      db.close()
    } catch { /* ignore */ }
  }
  _dbPromise = null
}

/**
 * Удалить всю базу сообщений. Используется при импорте бекапа с другими
 * ключами: старые сообщения прошлой идентичности прочитать уже нельзя.
 */
export async function deleteMessageDB() {
  await closeMessageDB()
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

/**
 * Открыть отдельное (например, временное/для чтения) соединение с fm_messages,
 * которое автоматически закрывается, когда другой код запрашивает повышение
 * версии схемы. Нужно вместо прямого indexedDB.open('fm_messages') в компонентах,
 * иначе открытая «чужая» коннекция заблокирует versionchange и схема-бамп повиснет.
 */
export function openReadConnection() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME)
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        try { db.close() } catch { /* ignore */ }
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Создать ObjectStore для новых эх (вызывается когда список эх обновлён) */
export async function ensureEchoStores(echoNames) {
  const needed = computeStoreNames(echoNames)
  // Check the LIVE database, not the localStorage hint: a store may have been
  // recorded via markStoreExists before it was actually created, which used to
  // make this function skip creation and silently drop messages.
  const db = await getDB()
  const existing = new Set(Array.from(db.objectStoreNames))
  const missing = [...needed].filter(n => !existing.has(n))
  if (missing.length === 0) return

  db.close()
  const v = getLastVersion()
  setLastVersion(v + 1)
  _dbPromise = openMessageDB(echoNames)
  await _dbPromise
}

/**
 * Move all locally stored messages of an echo to its new name. IndexedDB has
 * no store rename operation, so the records are copied into the target store
 * and the old store is removed. Trash entries remember their source echo name
 * and are updated too, so restoring them later still works.
 */
export async function renameEchoStore(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return
  const oldStore = echoStoreName(oldName)
  const newStore = echoStoreName(newName)

  let db = await getDB()
  if (!db.objectStoreNames.contains(oldStore)) return
  if (!db.objectStoreNames.contains(newStore)) {
    await ensureEchoStores([newName])
    db = await getDB()
  }

  const messages = await db.getAll(oldStore)
  if (messages.length > 0) {
    const tx = db.transaction(newStore, 'readwrite')
    for (const message of messages) {
      tx.store.put(message)
    }
    await tx.done
  }

  const trash = await db.getAll('__trash__')
  const renamedTrash = trash.filter(entry => entry._sourceEcho === oldName)
  if (renamedTrash.length > 0) {
    const tx = db.transaction('__trash__', 'readwrite')
    for (const entry of renamedTrash) {
      tx.store.put({ ...entry, _sourceEcho: newName })
    }
    await tx.done
  }

  await _deleteStoreByName(oldStore)
}

/**
 * Удалить все сохранённые сообщения эхи. Подписка и сам ObjectStore
 * сохраняются: новые сообщения продолжат приходить и записываться сюда же.
 */
export async function clearEchoMessages(echoName) {
  const store = echoStoreName(echoName)
  try {
    const d = await getDB()
    if (!d.objectStoreNames.contains(store)) return
    const tx = d.transaction(store, 'readwrite')
    await tx.store.clear()
    await tx.done
    // Deleted messages of this echo also belong to its local copy.
    const trashed = (await d.getAll('__trash__')).filter(entry => entry._sourceEcho === echoName)
    if (trashed.length > 0) {
      const trashTx = d.transaction('__trash__', 'readwrite')
      for (const entry of trashed) trashTx.store.delete(entry.id)
      await trashTx.done
    }
  } catch (e) {
    console.warn('[db] clearEchoMessages failed', e)
  }
}

/** Сохранить одно сообщение в соответствующий store */
export async function putMessage(echoName, msg) {
  const store = echoName.startsWith('__') || echoName.startsWith('netmail_')
    ? echoName
    : echoStoreName(echoName)
  let d = await getDB()
  // Ensure custom netmail folder store exists before writing
  if (store.startsWith('netmail_') && !d.objectStoreNames.contains(store)) {
    const slug = store.slice('netmail_'.length)
    await ensureNetmailStore(slug)
    d = await getDB()
  } else if (!store.startsWith('__') && !store.startsWith('netmail_') && !d.objectStoreNames.contains(store)) {
    // Echo store missing (e.g. brand-new subscription) — create it, then write.
    await ensureEchoStores([echoName])
    d = await getDB()
  }
  await d.put(store, msg)
}

/** Массово сохранить сообщения */
export async function bulkPutMessages(echoName, messages) {
  const store = echoName.startsWith('__') || echoName.startsWith('netmail_')
    ? echoName
    : echoStoreName(echoName)
  let d = await getDB()
  // Echo store missing (e.g. message arrives before the echo list is loaded) —
  // create it, otherwise the write throws and the message is lost on reload.
  if (!store.startsWith('__') && !store.startsWith('netmail_') && !d.objectStoreNames.contains(store)) {
    await ensureEchoStores([echoName])
    d = await getDB()
  }
  const tx = d.transaction(store, 'readwrite')
  for (const msg of messages) {
    tx.store.put(msg)
  }
  await tx.done
}

/** Загрузить все сообщения одной эхи/папки */
export async function getAllMessages(echoName) {
  const d = await getDB()
  const store = echoName.startsWith('__') || echoName.startsWith('netmail_')
    ? echoName
    : echoStoreName(echoName)
  if (!d.objectStoreNames.contains(store)) return []
  return d.getAll(store)
}

/**
 * Вернуть timestamp последнего сообщения в эхе (0, если пусто/нет store).
 * Использует индекс by_time в обратном направлении — одна запись, без чтения
 * всего стора. Для сортировки списка эх «по дате последнего сообщения».
 */
export async function getLastMessageTimestamp(echoName) {
  const d = await getDB()
  const store = echoName.startsWith('__') || echoName.startsWith('netmail_')
    ? echoName
    : echoStoreName(echoName)
  if (!d.objectStoreNames.contains(store)) return 0
  try {
    const index = d.transaction(store, 'readonly').store.index('by_time')
    const cursor = await index.openCursor(null, 'prev')
    if (!cursor || !cursor.value) return 0
    const ts = cursor.value.timestamp
    const n = typeof ts === 'string' ? parseInt(ts, 10) : Number(ts)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

/** Получить сообщение по message_id */
export async function getMessage(echoName, messageId) {
  const d = await getDB()
  const store = echoName.startsWith('__') || echoName.startsWith('netmail_')
    ? echoName
    : echoStoreName(echoName)
  if (!d.objectStoreNames.contains(store)) return null
  return d.get(store, messageId)
}

/** Удалить сообщение из store */
export async function deleteMessage(echoName, messageId) {
  const d = await getDB()
  const store = echoName.startsWith('__') || echoName.startsWith('netmail_')
    ? echoName
    : echoStoreName(echoName)
  await d.delete(store, messageId)
}

/** Пометить существование store (чтобы ensureEchoStores знал) */
export function markStoreExists(echoName) {
  const names = new Set(loadStoreNames())
  const store = echoName.startsWith('__') || echoName.startsWith('netmail_')
    ? echoName
    : echoStoreName(echoName)
  names.add(store)
  saveStoreNames(names)
}

// ---- Trash ----

/** Переместить сообщение в корзину */
export async function moveToTrash(echoName, msg) {
  const d = await getDB()
  await deleteMessage(echoName, msg.message_id)
  await d.put('__trash__', { ...msg, deletedAt: Date.now(), _sourceEcho: echoName })
}

/** Восстановить из корзины */
export async function restoreFromTrash(trashId) {
  const d = await getDB()
  const entry = await d.get('__trash__', trashId)
  if (!entry) return
  const sourceEcho = entry._sourceEcho
  const targetStore = sourceEcho.startsWith('__') || sourceEcho.startsWith('netmail_')
    ? sourceEcho
    : echoStoreName(sourceEcho)
  await d.put(targetStore, entry)
  await d.delete('__trash__', trashId)
}

/** Получить все записи в корзине */
export async function getTrash() {
  const d = await getDB()
  return d.getAll('__trash__')
}

/** Очистить корзину старше N дней */
export async function cleanTrash(days) {
  const d = await getDB()
  const cutoff = Date.now() - days * 86400000
  const all = await d.getAll('__trash__')
  const toDelete = all.filter(e => e.deletedAt < cutoff)
  const tx = d.transaction('__trash__', 'readwrite')
  for (const entry of toDelete) {
    tx.store.delete(entry.id)
  }
  await tx.done
  return toDelete.length
}

// ---- Drafts ----

/** Сохранить черновик */
export async function putDraft(draft) {
  const d = await getDB()
  const tx = d.transaction('__drafts__', 'readwrite')
  await tx.store.put(draft)
  await tx.done
}

/** Загрузить все черновики */
export async function getAllDrafts() {
  const d = await getDB()
  return d.getAll('__drafts__')
}

/** Удалить черновик */
export async function deleteDraft(draftId) {
  const d = await getDB()
  await d.delete('__drafts__', draftId)
}

// ---- Search ----

/** Искать сообщения по критериям */
export async function searchMessages({ query, echoName, type, senderAddress, fromDate, toDate, limit = 50 }) {
  const d = await getDB()
  const allStoreNames = Array.from(d.objectStoreNames)
  const results = []
  let count = 0

  for (const storeName of allStoreNames) {
    if (storeName === '__trash__' || storeName === '__drafts__') continue
    if (echoName) {
      const expected = echoStoreName(echoName)
      if (storeName !== expected && storeName !== echoName) continue
    }

    let messages = []

    try {
      if (fromDate || toDate) {
        const lower = fromDate || 0
        const upper = toDate || Date.now() / 1000 + 86400
        const range = IDBKeyRange.bound(lower, upper)
        messages = await d.getAllFromIndex(storeName, 'by_time', range)
      } else {
        messages = await d.getAll(storeName)
      }
    } catch (readErr) {
      console.warn('[search] read error for store', storeName, readErr)
      continue
    }

    for (const msg of messages) {
      if (count >= limit) break
      if (senderAddress && msg.sender_address !== senderAddress) continue
      if (type && msg.type !== type) continue

      if (query) {
        const lowerQ = query.toLowerCase()
        const dataStr = (typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)).toLowerCase()
        if (!dataStr.includes(lowerQ)) continue
      }

      results.push({ ...msg, _store: storeName })
      count++
    }
    if (count >= limit) break
  }

  return results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, limit)
}
