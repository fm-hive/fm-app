// Default reaction emoji list shared by the settings store, settings UI and
// backup export. Exports omit the list while it is unchanged, so backups do not
// carry ~30 default emojis on every run (#373).
export const DEFAULT_CUSTOM_EMOJIS = [
  '👍','👎','❤️','💯','😄','😊','😍','🎉','🎊','👏','💪','🚀','🔥','😁','😂','🤣','🥰','😘','🤗','🎈','🎁','🏆','⭐','😎','🤩','🥳','😤','😭','🫂','🤝','😢','😞','😡','🤔','👀','🙏',
]

export function isDefaultEmojis(list) {
  if (!Array.isArray(list)) return true
  if (list.length !== DEFAULT_CUSTOM_EMOJIS.length) return false
  return list.every((emoji, index) => emoji === DEFAULT_CUSTOM_EMOJIS[index])
}

// Returns settings data without ui.customEmojis when the list is unchanged.
// Changed lists stay in the export so the import can restore them.
export function settingsWithoutDefaultEmojis(data) {
  if (!data?.ui || !isDefaultEmojis(data.ui.customEmojis)) return data
  const copy = { ...data, ui: { ...data.ui } }
  delete copy.ui.customEmojis
  return copy
}
