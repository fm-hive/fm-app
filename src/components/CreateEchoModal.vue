<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-lg dark:text-white">{{ t('createEcho.title') }}</h3>
        <button @click="$emit('close')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
      </div>
      <form @submit.prevent="handleSubmit" class="space-y-6">
        <div class="flex flex-row justify-between">
          <div class="flex flex-col">
            <!-- Echo Name -->
            <div>
              <label class="block text-sm font-medium mb-2">
                {{ t('createEcho.name') }} <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.name"
                type="text"
                class="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="{ 'border-red-300': errors.name }"
                :placeholder="t('createEcho.name')"
                @blur="validateName"
                @input="clearError('name')"
              />
              <div v-if="errors.name" class="mt-1 text-sm text-red-600">
                {{ errors.name }}
              </div>
              <div v-if="nameAvailability" class="mt-1 text-sm">
                <div v-if="nameAvailability === 'checking'" class="text-gray-600 flex items-center">
                  <svg class="animate-spin h-4 w-4 mr-2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {{ t('createEcho.checking') }}
                </div>
                <div v-else :class="nameAvailability === 'available' ? 'text-green-600' : 'text-red-600'">
                  {{ nameAvailability === 'available' ? t('createEcho.nameAvailable') : t('createEcho.nameTakenMsg') }}
                </div>
              </div>
            </div>

            <!-- Description -->
            <div>
              <MarkdownEditor
                v-model="form.description"
                :label="t('createEcho.description')"
                :rows="3"
                :placeholder="t('createEcho.description')"
                @update:model-value="clearError('description')"
              />
              <div v-if="errors.description" class="mt-1 text-sm text-red-600">
                {{ errors.description }}
              </div>
              <div class="mt-1 text-xs text-gray-500">
                {{ t('createEcho.descHint') }}              </div>
            </div>
          </div>
          <div class="flex flex-col">

            <!-- Echo Type -->
            <div>
              <label class="block text-sm font-medium mb-2">
                {{ t('createEcho.echoType') }} <span class="text-red-500">*</span>
              </label>
              <div class="space-y-2">
                <label class="flex items-center">
                  <input
                    v-model="form.echoType"
                    type="radio"
                    value="local"
                    class="mr-3"
                  />
                  <div>
                    <div class="font-medium">{{ t('createEcho.local') }}</div>
                    <div class="text-sm text-gray-500">{{ t('createEcho.localHint') }}</div>
                  </div>
                </label>
                <label class="flex items-center">
                  <input
                    v-model="form.echoType"
                    type="radio"
                    value="with_rules"
                    class="mr-3"
                  />
                  <div>
                    <div class="font-medium">{{ t('createEcho.withRules') }}</div>
                    <div class="text-sm text-gray-500">{{ t('createEcho.withRulesHint') }}</div>
                  </div>
                </label>
                <label class="flex items-center">
                  <input
                    v-model="form.echoType"
                    type="radio"
                    value="blog"
                    class="mr-3"
                  />
                  <div>
                    <div class="font-medium">{{ t('createEcho.blog') }}</div>
                    <div class="text-sm text-gray-500">{{ t('createEcho.blogHint') }}</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-row">

          <!-- Rules Editor (only for with_rules) -->
          <div v-if="form.echoType === 'with_rules'" class="w-full">
            <RulesEditor
              v-model="form.rulesObj"
              :label="t('createEcho.rulesJson')"
              :rows="8"
            />
            <div v-if="errors.rules" class="mt-1 text-sm text-red-600">
              {{ errors.rules }}
            </div>
            <div class="mt-2 text-sm text-gray-600">
              <p class="font-medium">{{ t('createEcho.templateIncludes') }}</p>
              <ul class="list-disc pl-5 mt-1 space-y-1">
                <li>{{ t('createEcho.templateTextRules') }}</li>
                <li>{{ t('createEcho.templateParams') }}</li>
                <li>{{ t('createEcho.templateEchoname') }}</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="flex flex-row">

          <!-- Writers & elect_writers_from (both echo types) -->
          <div v-if="form.echoType !== 'blog'" class="border rounded-lg p-4 bg-gray-50">
            <h3 class="font-medium mb-3 text-sm">{{ t('createEcho.writersTitle') }}</h3>
            <div class="space-y-3">
              <div>
                <label class="block text-sm mb-1">{{ t('createEcho.writers') }}</label>
                <input v-model="form.writers" type="text"
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  :placeholder="t('createEcho.writersPlaceholder')" />
                <div class="mt-1 text-xs text-gray-500">{{ t('createEcho.writersHint') }}</div>
              </div>
              <div>
                <label class="block text-sm mb-1">{{ t('createEcho.electWritersFrom') }}</label>
                <input v-model="form.electWritersFrom" type="text"
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  :placeholder="t('createEcho.electWritersFromPlaceholder')" />
                <div class="mt-1 text-xs text-gray-500">{{ t('createEcho.electWritersFromHint') }}</div>
              </div>
              <div class="flex items-center gap-2">
                <input id="retract_vote" type="checkbox" v-model="form.retractVote" class="rounded text-blue-600" />
                <label for="retract_vote" class="text-sm">{{ t('createEcho.retractVote') }}</label>
                <span class="text-xs text-gray-500">{{ t('createEcho.retractVoteHint') }}</span>
              </div>
              <div v-if="form.retractVote" class="flex items-center gap-2">
                <label class="text-sm">{{ t('createEcho.retractVoteDays') }}</label>
                <input v-model.number="form.retractVoteDays" type="number" min="1" max="365"
                  class="w-20 border rounded px-2 py-1 text-sm" />
              </div>
              <div v-if="form.echoType === 'with_rules'" class="flex items-center gap-2">
                <input id="network_channel" type="checkbox" v-model="form.networkChannel" class="rounded text-blue-600" />
                <label for="network_channel" class="text-sm">{{ t('createEcho.networkChannel') }}</label>
                <span class="text-xs text-gray-500">{{ t('createEcho.networkChannelHint') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-row">
          <!-- Form Actions -->
          <div class="flex space-x-4 pt-6 border-t">
            <button
              type="button"
              @click="$emit('close')"
              class="px-6 py-2 border rounded-lg hover:bg-gray-50"
            >
              {{ t('createEcho.cancel') }}
            </button>
            <button
              type="submit"
              :disabled="isSubmitting || !isFormValid"
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="isSubmitting">{{ t('createEcho.loading') }}</span>
              <span v-else>{{ t('createEcho.create') }}</span>
            </button>
          </div>

          <!-- Error Message -->
          <div v-if="submitError" class="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div class="flex items-center">
              <div class="text-red-600 font-medium">Error:</div>
              <div class="ml-2 text-red-600">{{ submitError }}</div>
            </div>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useNotificationsStore } from '../stores/notifications'
import { apiService } from '../services/api'
import RulesEditor from '../components/RulesEditor.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import * as blogStore from '../services/blogStore'

const props = defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'created'])

const { t } = useI18n()
const identity = useIdentityStore()
const notifications = useNotificationsStore()

// Default rules template from docs/default_echo_rules.json
const defaultRulesObject = {
  text: '1. В конференции {echoname} обсуждаются следующие вопросы:\n  1. Котики и всё что с ними связано.\n1. В конференции {echoname} недопустимы:\n   1. оффтопик\n   1. оскорбления\n   1. спам\n   1. коммерческая деятельность',
  parameters: {
    min_moderators: '1',
    max_moderators: '2',
    announcements_enable: false,
    announcements_max_for_address: '1',
    refill_days: '7',
    max_message_size: '1048576',
    max_attachments_per_message: '5',
    max_attachment_size: '5242880',
  },
}

// Form state
const form = ref({
  name: '',
  description: '',
  echoType: 'local',
  rulesObj: JSON.parse(JSON.stringify(defaultRulesObject)),
  writers: '',
  electWritersFrom: '',
  retractVote: false,
  retractVoteDays: 1,
  networkChannel: false
})

const errors = ref({})
const submitError = ref('')
const isSubmitting = ref(false)
const nameAvailability = ref(null) // null, 'checking', 'available', 'taken'

// Computed properties
const isFormValid = computed(() => {
  const hasErrors = Object.keys(errors.value).length > 0
  const hasRequiredFields = form.value.name.trim() &&
    (form.value.echoType === 'local' || form.value.echoType === 'blog' || (form.value.echoType === 'with_rules' && (form.value.rulesObj?.text?.trim() || Object.keys(form.value.rulesObj?.parameters || {}).length > 0)))
  return !hasErrors && hasRequiredFields && !isSubmitting.value
})


// Validation functions
function validateName() {
  const name = form.value.name.trim()
  if (!name) {
    setError('name', t('createEcho.nameRequired'))
    return false
  }
  if (name.length < 3) {
    setError('name', t('createEcho.nameMinLength'))
    return false
  }
  if (name.length > 50) {
    setError('name', t('createEcho.nameMaxLength'))
    return false
  }

  // Check name availability (simulate API call)
  checkNameAvailability(name)

  clearError('name')
  return true
}

let nameCheckTimeout = null

async function checkNameAvailability(name) {
  if (!name || name.length < 3) {
    nameAvailability.value = null
    return
  }

  // Clear previous timeout
  if (nameCheckTimeout) {
    clearTimeout(nameCheckTimeout)
  }

  // Debounce check
  nameCheckTimeout = setTimeout(async () => {
    nameAvailability.value = 'checking'
    try {
      // Get all echoes from API + local blogs
      const [echoes, blogs] = await Promise.all([
        apiService.getEchoes(),
        blogStore.getBlogs(),
      ])
      const allNames = [
        ...echoes.map(e => e.name),
        ...blogs.map(b => b.name),
      ]
      const exists = allNames.some(n => n.toLowerCase() === name.toLowerCase())
      nameAvailability.value = exists ? 'taken' : 'available'
    } catch (error) {
      console.error('Failed to check name availability:', error)
      nameAvailability.value = null
    }
  }, 500)
}

function validateDescription() {
  const desc = form.value.description
  if (desc && desc.length > 200) {
    setError('description', t('createEcho.descriptionMaxLength'))
    return false
  }
  clearError('description')
  return true
}

function validateRules() {
  if (form.value.echoType !== 'with_rules') return true
  const text = form.value.rulesObj?.text?.trim() || ''
  const params = form.value.rulesObj?.parameters || {}
  if (!text && Object.keys(params).length === 0) {
    setError('rules', t('createEcho.rulesRequired'))
    return false
  }
  clearError('rules')
  return true
}

// Helper functions
function setError(field, message) {
  errors.value[field] = message
}

function clearError(field) {
  delete errors.value[field]
}

function clearAllErrors() {
  errors.value = {}
}

// Form submission
async function handleSubmit() {
  clearAllErrors()
  submitError.value = ''

  // Validate all fields
  const isNameValid = validateName()
  const isDescValid = validateDescription()
  const isRulesValid = validateRules()

  if (!isNameValid || !isDescValid || !isRulesValid) {
    return
  }

  if (nameAvailability.value === 'taken') {
    setError('name', t('createEcho.nameTaken'))
    return
  }

  if (!identity.hasKeys || !identity.user?.address) {
    submitError.value = t('createEcho.needIdentity')
    return
  }

  isSubmitting.value = true

  try {
    // Local blog: create in browser IndexedDB, never sent to the node
    if (form.value.echoType === 'blog') {
      const blog = await blogStore.createBlog({
        name: form.value.name.trim(),
        description: form.value.description.trim(),
      })
      console.log('Local blog created:', blog)
      notifications.success(t('createEcho.blogSuccess'), t('createEcho.title'))
      emit('created', { type: 'blog', name: blog.name })
      emit('close')
      return
    }

    const formData = {
      name: form.value.name.trim(),
      description: form.value.description.trim(),
      network_channel: form.value.networkChannel
    }

    // Build writers and elect_writers_from arrays
    let writersArr = []
    let sourcesArr = []
    if (form.value.writers.trim()) {
      writersArr = form.value.writers.split(',').map(w => w.trim()).filter(Boolean)
    }
    if (form.value.electWritersFrom.trim()) {
      sourcesArr = form.value.electWritersFrom.split(',').map(s => s.trim()).filter(Boolean)
    }
    const retractVoteStr = form.value.retractVote ? 'enable' : ''
    const retractVoteDaysStr = String(form.value.retractVoteDays || 1)

    // Prepare rules if needed
    if (form.value.echoType === 'with_rules') {
      try {
        const rulesObj = JSON.parse(JSON.stringify(form.value.rulesObj || {}))
        // Replace {echoname} in rules text with actual name
        if (rulesObj.text) {
          rulesObj.text = rulesObj.text.replace(/{echoname}/g, form.value.name.trim())
        }
        // Add writers/elect_writers_from to parameters
        if (!rulesObj.parameters) rulesObj.parameters = {}
        if (writersArr.length > 0) rulesObj.parameters.writers = writersArr
        if (sourcesArr.length > 0) rulesObj.parameters.elect_writers_from = sourcesArr
        if (retractVoteStr) rulesObj.parameters.retract_vote = retractVoteStr
        rulesObj.parameters.retract_vote_days = retractVoteDaysStr
        formData.rules = rulesObj
      } catch (e) {
        submitError.value = t('createEcho.invalidRules') + ': ' + e.message
        isSubmitting.value = false
        return
      }
    } else {
      // For local echo: add as top-level fields
      if (writersArr.length > 0) formData.writers = writersArr
      if (sourcesArr.length > 0) formData.elect_writers_from = sourcesArr
      if (retractVoteStr) formData.retract_vote = retractVoteStr
      formData.retract_vote_days = retractVoteDaysStr
    }

    // Call appropriate API
    let response
    if (form.value.echoType === 'local') {
      response = await apiService.createLocalEcho(formData)
    } else {
      response = await apiService.createEchoWithRules(formData)
    }

    // Success - notify parent to refresh and close
    console.log('Echo created:', response)

    // Show success message and close (parent refreshes the echo list)
    notifications.success(t('createEcho.success'), t('createEcho.title'))
    emit('created', { type: form.value.echoType === 'local' ? 'echo' : 'echo_rules', name: form.value.name.trim() })
    emit('close')

  } catch (error) {
    console.error('Failed to create echo:', error)
    submitError.value = error.message || t('errors.unknownError')
    notifications.error(error.message || t('errors.unknownError'), t('createEcho.title'))
  } finally {
    isSubmitting.value = false
  }
}

// Cleanup
onUnmounted(() => {
  if (nameCheckTimeout) {
    clearTimeout(nameCheckTimeout)
  }
})
</script>
