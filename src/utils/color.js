/**
 * Deterministic HSL color for an address/string: the same address always gets
 * the same color (author stripes, voter icons, reader ribbon tiles).
 */
export function stringToColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue}, 55%, 42%)`
}
