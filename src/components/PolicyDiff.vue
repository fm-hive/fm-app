<template>
  <div class="space-y-4">
    <!-- Nothing to compare with -->
    <p v-if="!diff.hasPrevious" class="text-sm text-gray-500 dark:text-gray-400">
      {{ t('policyConfirm.noPreviousPolicy') }}
    </p>

    <template v-else>
      <!-- No changes -->
      <p v-if="!diff.hasChanges" class="text-sm text-gray-500 dark:text-gray-400">
        {{ t('policyConfirm.noChanges') }}
      </p>

      <template v-else>
        <!-- Parameters -->
        <div v-if="diff.params.length > 0">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {{ t('policyConfirm.parameterChanges') }}
          </h3>
          <div class="bg-gray-50 dark:bg-gray-700/40 rounded p-3 space-y-1">
            <div v-for="change in diff.params" :key="change.key" class="text-xs font-mono">
              <span v-if="change.type === 'changed'" class="text-yellow-600 dark:text-yellow-400">
                ~ <span class="font-semibold">{{ change.key }}</span>: {{ change.old }} → {{ change.new }}
              </span>
              <span v-else-if="change.type === 'added'" class="text-green-600 dark:text-green-400">
                + <span class="font-semibold">{{ change.key }}</span>: {{ change.new }}
              </span>
              <span v-else class="text-red-500 dark:text-red-400">
                − <span class="font-semibold">{{ change.key }}</span>: {{ change.old }}
              </span>
            </div>
          </div>
        </div>

        <!-- Text -->
        <div v-if="diff.text.hunks.length > 0">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {{ t('policyConfirm.textChanges') }}
            </h3>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ t('policyConfirm.linesSummary', { added: diff.text.added, removed: diff.text.removed }) }}
            </span>
          </div>
          <div class="bg-gray-50 dark:bg-gray-700/40 rounded p-2 overflow-auto max-h-80 text-xs font-mono">
            <template v-for="(hunk, index) in diff.text.hunks" :key="index">
              <div v-if="index > 0" class="text-center text-gray-400 dark:text-gray-500 select-none">···</div>
              <div
                v-for="(line, lineIndex) in hunk.lines"
                :key="lineIndex"
                class="px-1 whitespace-pre-wrap break-words"
                :class="lineClass(line.type)"
              >{{ linePrefix(line.type) }}{{ line.text }}</div>
            </template>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { computePolicyDiff } from '../utils/policyDiff'

const { t } = useI18n()

const props = defineProps({
  previousPolicy: { type: Object, default: null },
  policyData: { type: Object, default: null },
})

const diff = computed(() => computePolicyDiff(props.previousPolicy, props.policyData))

function linePrefix(type) {
  if (type === 'add') return '+ '
  if (type === 'remove') return '- '
  return '  '
}

function lineClass(type) {
  if (type === 'add') return 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
  if (type === 'remove') return 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
  return 'text-gray-500 dark:text-gray-400'
}
</script>
