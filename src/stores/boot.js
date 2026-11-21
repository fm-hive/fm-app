import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Boot states constants
export const BOOT_STATE = {
  IDLE: 'idle',
  LOADING: 'loading',
  NEEDS_KEY_GENERATION: 'needs_key_generation',
  NEEDS_PASSWORD: 'needs_password',
  NEEDS_POLICY: 'needs_policy',
  READY: 'ready',
  ERROR: 'error',
}

export const useBootStore = defineStore('boot', () => {
  // State
  const bootState = ref(BOOT_STATE.IDLE)
  const error = ref(null)
  const showPasswordDialog = ref(false)
  const showPolicyConfirm = ref(false)
  const isNewKeys = ref(false)

  // Computed properties for easy access
  const isLoading = computed(() => bootState.value === BOOT_STATE.LOADING)
  const needsKeyGeneration = computed(() => bootState.value === BOOT_STATE.NEEDS_KEY_GENERATION)
  const needsPassword = computed(() => bootState.value === BOOT_STATE.NEEDS_PASSWORD)
  const needsPolicy = computed(() => bootState.value === BOOT_STATE.NEEDS_POLICY)
  const isReady = computed(() => bootState.value === BOOT_STATE.READY)
  const hasError = computed(() => bootState.value === BOOT_STATE.ERROR)

  // Actions to update state
  function setState(state) {
    bootState.value = state
  }

  function setError(err) {
    error.value = err
    bootState.value = BOOT_STATE.ERROR
  }

  function setPasswordDialog(visible) {
    showPasswordDialog.value = visible
  }

  function setPolicyConfirm(visible) {
    showPolicyConfirm.value = visible
  }

  function reset() {
    bootState.value = BOOT_STATE.IDLE
    error.value = null
    showPasswordDialog.value = false
    showPolicyConfirm.value = false
  }

  return {
    // State
    bootState,
    error,
    showPasswordDialog,
    showPolicyConfirm,
    isNewKeys,

    // Computed
    isLoading,
    needsKeyGeneration,
    needsPassword,
    needsPolicy,
    isReady,
    hasError,

    // Actions
    setState,
    setError,
    setPasswordDialog,
    setPolicyConfirm,
    reset,
  }
})