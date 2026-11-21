/**
 * Downscale/compress an image file via canvas.
 * Returns a data URL (JPEG) at max dimension and quality.
 * If the image is smaller than the limit, returns it as-is (no upscaling).
 * @param {File} file - image file
 * @param {number} maxDim - max width/height in px (default 1280)
 * @param {number} quality - JPEG quality 0..1 (default 0.8)
 * @returns {Promise<string>} data URL
 */
export function transcodeImage(file, maxDim = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const { width, height } = img
        // Only downscale if larger than the limit
        if (width <= maxDim && height <= maxDim) {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('Failed to read file'))
          reader.readAsDataURL(file)
          return
        }
        const scale = Math.min(maxDim / width, maxDim / height)
        const w = Math.round(width * scale)
        const h = Math.round(height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        // Preserve transparency for PNG, otherwise JPEG
        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        resolve(canvas.toDataURL(mime, quality))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}
