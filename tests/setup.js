// Test setup file
import { vi } from 'vitest'

// Mock crypto.subtle for Node.js environment
if (!global.crypto) {
  global.crypto = {
    subtle: {
      digest: vi.fn(),
      importKey: vi.fn(),
      encrypt: vi.fn(),
      decrypt: vi.fn(),
    },
    getRandomValues: vi.fn((arr) => arr),
  }
}