import { describe, it, expect } from 'vitest'
import { imageFilesFromClipboard } from '../../src/utils/clipboard'

const img = (name = 'a.png', type = 'image/png') => ({ name, type })
const txt = () => ({ name: 'a.txt', type: 'text/plain' })

function dt({ items = null, files = null }) {
  return { items, files }
}

function fileItem(file) {
  return { kind: 'file', getAsFile: () => file }
}

describe('imageFilesFromClipboard', () => {
  it('returns image files from clipboard items', () => {
    const png = img('shot.png')
    const result = imageFilesFromClipboard(dt({
      items: [fileItem(png), { kind: 'string', getAsFile: () => null }],
    }))
    expect(result).toEqual([png])
  })

  it('ignores non-image items', () => {
    const result = imageFilesFromClipboard(dt({
      items: [fileItem(txt()), { kind: 'string', getAsFile: () => null }],
    }))
    expect(result).toEqual([])
  })

  it('falls back to dataTransfer.files', () => {
    const jpg = img('photo.jpg', 'image/jpeg')
    const result = imageFilesFromClipboard(dt({ files: [jpg, txt()] }))
    expect(result).toEqual([jpg])
  })

  it('keeps only images from a mixed files list', () => {
    const a = img('a.png')
    const b = img('b.gif', 'image/gif')
    const result = imageFilesFromClipboard(dt({ files: [a, txt(), b] }))
    expect(result).toEqual([a, b])
  })

  it('is null-safe', () => {
    expect(imageFilesFromClipboard(null)).toEqual([])
    expect(imageFilesFromClipboard(undefined)).toEqual([])
    expect(imageFilesFromClipboard({})).toEqual([])
  })
})
