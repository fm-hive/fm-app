import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/api', () => ({
  apiService: {
    service: vi.fn(async () => [{ index: 0, status: 'request_accepted' }]),
  },
}))

import { keyService } from '../../src/services/keyService'
import { useNotificationsStore } from '../../src/stores/notifications'

describe('key request notification (#275)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows translated text instead of raw i18n keys', async () => {
    await keyService.requestPublicKey(':0:9', false)
    const notifications = useNotificationsStore().notifications
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).not.toContain('netmail.')
    expect(notifications[0].message).not.toContain('netmail.')
    expect(notifications[0].message).toContain(':0:9')
    expect(notifications[0].type).toBe('info')
  })

  it('shows translated text when the request is rejected', async () => {
    const { apiService } = await import('../../src/services/api')
    apiService.service.mockResolvedValueOnce([{ index: 0, status: 'rejected' }])
    await keyService.requestPublicKey(':0:9', false)
    const notifications = useNotificationsStore().notifications
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('error')
    expect(notifications[0].title).not.toContain('netmail.')
    expect(notifications[0].message).not.toContain('netmail.')
  })
})
