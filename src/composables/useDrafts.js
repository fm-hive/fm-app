import { ref } from 'vue'

// Ключ localStorage для хранения черновиков
const STORAGE_KEY = 'fm_drafts'

// Счётчик для генерации уникальных ID черновиков (на основе timestamp)
let draftIdCounter = Date.now()

/** Генерирует уникальный ID черновика вида draft_<число> */
function generateId() {
  return 'draft_' + (draftIdCounter++)
}

/**
 * Композабл для управления черновиками сообщений.
 * Черновики хранятся в localStorage, структура каждого черновика:
 * {
 *   id: string,          // уникальный ID
 *   type: 'echo'|'netmail',  // тип черновика
 *   createdAt: number,   // timestamp создания
 *   updatedAt: number,   // timestamp последнего изменения
 *   echoName: string|null,   // эха (для echo-черновиков)
 *   recipient: string|null,  // получатель (для netmail-черновиков)
 *   subject: string,
 *   body: string,
 *   quote: Object|null       // цитируемое сообщение
 * }
 */
export function useDrafts() {
  // Реактивный массив черновиков, загружается из localStorage
  const drafts = ref(loadDrafts())

  /** Загружает черновики из localStorage */
  function loadDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  /** Сохраняет черновики в localStorage */
  function saveDrafts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts.value))
    } catch { /* игнорируем ошибки localStorage */ }
  }

  /** Добавляет новый черновик */
  function addDraft(type, fields) {
    const draft = {
      id: generateId(),
      type,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      echoName: fields.echoName || null,
      recipient: fields.recipient || null,
      subject: fields.subject || '',
      body: fields.body || '',
      quote: fields.quote || null,
    }
    drafts.value.push(draft)
    saveDrafts()
    return draft
  }

  /** Обновляет существующий черновик (частичное обновление полей) */
  function updateDraft(id, fields) {
    const idx = drafts.value.findIndex(d => d.id === id)
    if (idx === -1) return
    Object.assign(drafts.value[idx], fields, { updatedAt: Date.now() })
    saveDrafts()
  }

  /** Удаляет черновик по ID */
  function deleteDraft(id) {
    drafts.value = drafts.value.filter(d => d.id !== id)
    saveDrafts()
  }

  /** Возвращает черновики для указанной эхи (сортировка: сначала свежие) */
  function getDraftsForEcho(echoName) {
    return drafts.value
      .filter(d => d.type === 'echo' && d.echoName === echoName)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Возвращает все netmail-черновики (сортировка: сначала свежие) */
  function getNetmailDrafts() {
    return drafts.value
      .filter(d => d.type === 'netmail')
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Возвращает черновик по ID или null */
  function getDraft(id) {
    return drafts.value.find(d => d.id === id) || null
  }

  return {
    drafts,
    addDraft,
    updateDraft,
    deleteDraft,
    getDraftsForEcho,
    getNetmailDrafts,
    getDraft,
  }
}
