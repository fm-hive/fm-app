<template>
  <div class="fixed top-4 right-4 z-50 space-y-3 w-80">
    <div
      v-for="notification in notifications"
      :key="notification.id"
      class="p-4 rounded-lg shadow-lg border transform transition-all duration-300 ease-in-out"
      :class="notificationClasses(notification)"
      role="alert"
    >
      <div class="flex">
        <!-- Icon -->
        <div class="flex-shrink-0 mr-3">
          <svg v-if="notification.type === 'success'" class="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          <svg v-else-if="notification.type === 'error'" class="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
          <svg v-else-if="notification.type === 'warning'" class="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          <svg v-else class="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
        </div>
        
         <!-- Content -->
        <div class="flex-1">
          <div v-if="notification.title" class="font-semibold">
            {{ notification.title }}
          </div>
          <div class="text-sm mt-1">
            {{ notification.message }}
          </div>
          <!-- Actions -->
          <div v-if="notification.actions && notification.actions.length > 0" class="mt-2 space-x-2">
            <button
              v-for="action in notification.actions"
              :key="action.label"
              @click="handleAction(action, notification.id)"
              class="px-3 py-1 text-xs font-medium rounded border"
              :class="action.type === 'primary' ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200' : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
        
        <!-- Dismiss button -->
        <button
          v-if="notification.dismissible"
          @click="dismiss(notification.id)"
          class="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useNotificationsStore } from '../stores/notifications'

const store = useNotificationsStore()
const notifications = computed(() => store.notifications)

function notificationClasses(notification) {
  const base = 'bg-white'
  const typeClasses = {
    info: 'border-blue-200 text-blue-800',
    success: 'border-green-200 text-green-800',
    warning: 'border-yellow-200 text-yellow-800',
    error: 'border-red-200 text-red-800'
  }
  return `${base} ${typeClasses[notification.type] || typeClasses.info}`
}

function dismiss(id) {
  store.removeNotification(id)
}

function handleAction(action, notificationId) {
  if (action.handler) {
    action.handler()
  }
  // Optionally dismiss notification after action
  if (action.dismiss !== false) {
    store.removeNotification(notificationId)
  }
}
</script>