<template>
  <span class="sender-label" :class="{ compact }">
    <span v-if="isMe" class="sender-main">{{ meLabel }}</span>
    <span v-else-if="tipNames.length" class="sender-main" tabindex="0">
      {{ address }}<template v-if="displayedName"> (<span class="sender-name" :class="{ multi: hasAlternates }">{{ displayedName }}</span>)</template>
      <span class="tip-box" role="tooltip">
        {{ mainTipText }}
      </span>
    </span>
    <span v-else class="sender-main">{{ address }}</span>
    <span v-if="hasAlternates" class="sender-star" tabindex="0" aria-label="*">*
      <span class="tip-box" role="tooltip">
        {{ t('sender.pastNames', { names: alternatesList.join(', ') }) }}
      </span>
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNamesStore } from '../stores/names'
import { useIdentityStore } from '../stores/identity'

const props = defineProps({
  address: { type: String, default: '' },
  /** sender_name, пришедшее в самом сообщении (если есть) */
  nameFromMessage: { type: String, default: '' },
  /** Explicit name override (e.g. a voter name or a contact name) */
  name: { type: String, default: '' },
  /** Render "Me" instead of the address when it belongs to the current user */
  me: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const { t } = useI18n()
const names = useNamesStore()

const nameOverride = computed(() => (props.name || props.nameFromMessage || '').trim())

// Own address ("Me"): used in netmail headers and search results.
const identity = useIdentityStore()
const isMe = computed(() => props.me && !!props.address && props.address === identity.user?.address)
const meLabel = computed(() => t('netmail.me'))

// Имена из справочника для этого адреса (свежие первыми).
const dirNames = computed(() => names.namesFor(props.address))

// Показываем имя из САМОГО сообщения (каким его подписал автор). Справочник
// используем только как фолбэк для сообщений, где имени не было.
const displayedName = computed(() => {
  return nameOverride.value || dirNames.value[0] || ''
})

// Все известные имена (для тултипа), иначе — имя из сообщения.
const tipNames = computed(() => {
  if (dirNames.value.length) return dirNames.value
  return nameOverride.value ? [nameOverride.value] : []
})

// Другие имена адреса, отличные от показанного (для звёздочки).
const alternatesList = computed(() =>
  dirNames.value.filter(n => n !== displayedName.value)
)
const hasAlternates = computed(() => alternatesList.value.length > 0)

const mainTipText = computed(() => {
  const addr = props.address
  if (dirNames.value.length > 1) {
    return `${addr} — ${t('sender.knownNames', { names: dirNames.value.join(', ') })}`
  }
  const single = dirNames.value[0] || displayedName.value
  return single ? `${addr} (${single})` : addr
})
</script>

<style scoped>
.sender-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  position: relative;
}
.sender-main {
  cursor: help;
  white-space: nowrap;
  outline: none;
}
.sender-name.multi {
  color: var(--color-accent, #b45309);
  border-bottom: 1px dotted currentColor;
}
.sender-star {
  cursor: help;
  color: var(--color-accent, #b45309);
  font-weight: bold;
  line-height: 1;
  outline: none;
}
.compact .sender-main {
  font-size: 0.875em;
}

/* Кастомный тултип (hover + tap/focus), т.к. нативный title не работает на тач */
.sender-main,
.sender-star {
  position: relative;
}
.tip-box {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 60;
  margin-top: 4px;
  max-width: 260px;
  white-space: normal;
  background: #1f2937;
  color: #f9fafb;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.75rem;
  line-height: 1.35;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  text-align: left;
}
.sender-main:hover .tip-box,
.sender-main:focus .tip-box,
.sender-star:hover .tip-box,
.sender-star:focus .tip-box {
  display: block;
}
</style>
