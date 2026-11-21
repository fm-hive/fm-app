import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  formatJsonWithDataChips,
  dataUrlLabel,
  installCopyChipHandler,
  DATA_CHIP_MIN_LEN,
} from '../../src/utils/sourceFormat'

const LONG_DATA_URL = 'data:image/png;base64,' + 'A'.repeat(400)
const SHORT_DATA_URL = 'data:image/png;base64,AAAA'

describe('source formatting with data: copy chips (#316)', () => {
  it('collapses long data: URIs into a copy chip with type and size', () => {
    const html = formatJsonWithDataChips({ data: LONG_DATA_URL })
    expect(html).toContain('class="fm-data-chip"')
    expect(html).toContain('📋 image/png · 300 B')
    // Only the hidden span keeps the full value; the visible part is short
    const visible = html.replace(/<span id="[^"]+" hidden>[^<]*<\/span>/g, '')
    expect(visible).not.toContain('A'.repeat(100))
    // The full value stays in the DOM (hidden span) for the copy handler
    const id = html.match(/data-fm-copy-el="([^"]+)"/)[1]
    const hidden = html.match(new RegExp(`<span id="${id}" hidden>([^<]*)</span>`))
    expect(hidden[1]).toBe(LONG_DATA_URL)
  })

  it('keeps short data: URIs inline', () => {
    const html = formatJsonWithDataChips({ data: SHORT_DATA_URL })
    expect(html).not.toContain('fm-data-chip')
    expect(html).toContain(SHORT_DATA_URL)
  })

  it('collapses data: URIs embedded in JSON strings (protocol data field)', () => {
    const inner = JSON.stringify({ body: 'see', attachments: [{ data: LONG_DATA_URL }] })
    const html = formatJsonWithDataChips(inner)
    expect(html).toContain('fm-data-chip')
    const visible = html.replace(/<span id="[^"]+" hidden>[^<]*<\/span>/g, '')
    expect(visible).not.toContain('A'.repeat(100))
  })

  it('collapses long JWS compact serializations too', () => {
    const jws = 'eyJhbGciOiJFZERTQSJ9.' + 'A'.repeat(300) + '.' + 'B'.repeat(100)
    const html = formatJsonWithDataChips({ jws })
    expect(html).toContain('📋 jws · ')
    const visible = html.replace(/<span id="[^"]+" hidden>[^<]*<\/span>/g, '')
    expect(visible).not.toContain('A'.repeat(100))
    const id = html.match(/data-fm-copy-el="([^"]+)"/)[1]
    expect(html).toContain(`<span id="${id}" hidden>${jws}</span>`)
  })

  it('keeps a data: URI with a JWS-looking payload as one chip', () => {
    const url = 'data:application/json;base64,' + 'eyJhbGciOiJub25lIn0.' + 'A'.repeat(200)
    const html = formatJsonWithDataChips({ data: url })
    expect((html.match(/fm-data-chip/g) || [])).toHaveLength(1)
    expect(html).toContain('📋 application/json · ')
  })

  it('escapes HTML in the surrounding JSON', () => {
    const html = formatJsonWithDataChips({ subject: '<script>alert(1)</script>', data: LONG_DATA_URL })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('uses the provided labels for the tooltip and the copied state', () => {
    const html = formatJsonWithDataChips({ data: LONG_DATA_URL }, { copyTitle: 'Копировать', copiedLabel: '✓ Скопировано' })
    expect(html).toContain('title="Копировать"')
    expect(html).toContain('data-copied-label="✓ Скопировано"')
  })

  it('labels the payload size from the base64 length', () => {
    expect(dataUrlLabel('data:image/png;base64,' + 'A'.repeat(4000))).toBe('image/png · 2.9 KB')
    expect(dataUrlLabel('data:text/plain,hello')).toBe('text/plain · 5 B')
  })
})

describe('copy chip click handler (#316)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } })
  })

  it('copies the hidden value and shows feedback', async () => {
    installCopyChipHandler()
    const html = formatJsonWithDataChips({ data: LONG_DATA_URL }, { copiedLabel: '✓ Copied' })
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    container.querySelector('.fm-data-chip').click()
    await new Promise(r => setTimeout(r, 0))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LONG_DATA_URL)
    expect(container.querySelector('.fm-data-chip').textContent).toBe('✓ Copied')
    expect(container.querySelector('.fm-data-chip').classList.contains('fm-data-chip-copied')).toBe(true)
  })

  it('leaves clicks elsewhere alone', async () => {
    installCopyChipHandler()
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.click()
    await new Promise(r => setTimeout(r, 0))
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })
})

describe('data chip threshold', () => {
  it('uses 100 characters by default', () => {
    expect(DATA_CHIP_MIN_LEN).toBe(100)
  })
})
