import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import NodeListDialog from '../../src/components/NodeListDialog.vue'
import { apiService } from '../../src/services/api'
import en from '../../src/i18n/locales/en.json'

vi.mock('../../src/services/api', () => ({
  apiService: { getNodes: vi.fn() },
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('NodeListDialog (#363)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and renders nodes with their clients', async () => {
    apiService.getNodes.mockResolvedValue([
      { address: ':0:1:0', name: 'Node A', url: 'http://a/api', clients: [{ address: ':0:1:1', name: 'Alice' }] },
    ])
    const wrapper = mount(NodeListDialog, { props: { visible: true }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(apiService.getNodes).toHaveBeenCalled()
    expect(wrapper.text()).toContain(':0:1:0')
    expect(wrapper.text()).toContain('Node A')
    expect(wrapper.text()).toContain(':0:1:1')
    expect(wrapper.text()).toContain('Alice')
    wrapper.unmount()
  })

  it('shows an error when the node list cannot be loaded', async () => {
    apiService.getNodes.mockRejectedValue(new Error('offline'))
    const wrapper = mount(NodeListDialog, { props: { visible: true }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain('offline')
    wrapper.unmount()
  })
})
