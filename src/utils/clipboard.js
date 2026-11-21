/**
 * Extract image files from a clipboard DataTransfer (paste event).
 * Looks at `items` first (kind === 'file'), then falls back to `files`.
 * Non-image entries are ignored. Returns [] for null/empty input.
 *
 * @param {DataTransfer|null} dataTransfer
 * @returns {File[]}
 */
export function imageFilesFromClipboard(dataTransfer) {
  if (!dataTransfer) return []

  const files = []
  const push = (file) => {
    if (file && typeof file.type === 'string' && file.type.startsWith('image/')) {
      files.push(file)
    }
  }

  if (dataTransfer.items && typeof dataTransfer.items.length === 'number') {
    for (const item of dataTransfer.items) {
      if (!item || item.kind !== 'file') continue
      push(item.getAsFile())
    }
  }

  if (files.length === 0 && dataTransfer.files) {
    for (const file of dataTransfer.files) {
      push(file)
    }
  }

  return files
}
