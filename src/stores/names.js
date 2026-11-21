import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'fm_addr_names'
const MAX_NAMES_PER_ADDR = 20

/**
 * Справочник «адрес → имена отправителя», которые клиент видел в сообщениях.
 * Каждое имя хранится один раз; порядок — от самого свежего к старому.
 * Используется при отображении отправителя (`addr (Name)*`) и его тултипов.
 */
export const useNamesStore = defineStore('names', () => {
  // address -> { seen: string[] }  (most recent first)
  const byAddress = ref(load())

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const out = {}
      for (const addr of Object.keys(raw || {})) {
        const seen = Array.isArray(raw[addr]?.seen) ? raw[addr].seen.filter(n => typeof n === 'string' && n.trim() !== '') : []
        if (seen.length > 0) out[addr] = { seen }
      }
      return out
    } catch {
      return {}
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(byAddress.value))
    } catch { /* ignore */ }
  }

  const count = computed(() => Object.keys(byAddress.value).length)

  /** Вернуть все известные имена адреса (свежие первыми) */
  function namesFor(address) {
    if (!address) return []
    const e = byAddress.value[address]
    return e ? e.seen : []
  }

  /** Самое свежее известное имя адреса */
  function currentName(address) {
    const list = namesFor(address)
    return list.length ? list[0] : ''
  }

  /** Имена адреса, отличные от показанного (для звёздочки) */
  function alternates(address) {
    return namesFor(address).slice(1)
  }

  /** Записать имя, увиденное для адреса */
  function record(address, name) {
    const addr = typeof address === 'string' ? address.trim() : ''
    const nm = typeof name === 'string' ? name.trim() : ''
    if (!addr || !nm || nm === addr) return
    const e = byAddress.value[addr] || { seen: [] }
    // Переместить (или добавить) имя в начало — как самое свежее
    const idx = e.seen.indexOf(nm)
    if (idx !== -1) e.seen.splice(idx, 1)
    e.seen.unshift(nm)
    if (e.seen.length > MAX_NAMES_PER_ADDR) e.seen.length = MAX_NAMES_PER_ADDR
    byAddress.value[addr] = e
    save()
  }

  /** Переписать адрес в справочнике (мерж сетей / смена адреса). */
  function renameAddress(oldAddress, newAddress) {
    if (!oldAddress || !newAddress || oldAddress === newAddress) return
    const e = byAddress.value[oldAddress]
    if (!e) return
    delete byAddress.value[oldAddress]
    const target = byAddress.value[newAddress] || { seen: [] }
    // Имена старого адреса — как самые свежие у нового, без дубликатов
    const merged = [...e.seen]
    for (const n of target.seen) {
      if (!merged.includes(n)) merged.push(n)
    }
    if (merged.length > MAX_NAMES_PER_ADDR) merged.length = MAX_NAMES_PER_ADDR
    byAddress.value[newAddress] = { seen: merged }
    save()
  }

  function clear() {
    byAddress.value = {}
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  return {
    byAddress,
    count,
    namesFor,
    currentName,
    alternates,
    record,
    renameAddress,
    clear,
  }
})
