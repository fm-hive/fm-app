import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref([])
  const nextId = ref(1)

  function addNotification(notification) {
    const id = nextId.value++
    const defaults = {
      id,
      type: 'info',
      title: '',
      message: '',
      duration: 5000,
      dismissible: true,
      actions: []
    }
    
    const fullNotification = { ...defaults, ...notification }
    notifications.value.push(fullNotification)
    
    // Auto-remove if duration is set
    if (fullNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, fullNotification.duration)
    }
    
    return id
  }

  function removeNotification(id) {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  function clearNotifications() {
    notifications.value = []
  }

  // Helper methods for common notification types
  function info(message, title = 'Info') {
    return addNotification({ type: 'info', title, message })
  }

  function success(message, title = 'Success') {
    return addNotification({ type: 'success', title, message })
  }

  function warning(message, title = 'Warning') {
    return addNotification({ type: 'warning', title, message })
  }

  function error(message, title = 'Error') {
    return addNotification({ type: 'error', title, message, duration: 10000 })
  }

  return {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
    info,
    success,
    warning,
    error
  }
})