import { beforeEach, describe, expect, it } from 'vitest'
import { saveRecoveryNode, loadRecoveryNode, clearRecoveryNode } from './recoveryNode'

describe('recoveryNode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the recovery endpoint', () => {
    saveRecoveryNode({
      apiUrl: 'https://recovery.example/api',
      nodePubkeyB64: 'AAAA',
      appUrl: 'https://recovery.example/app',
    })

    expect(loadRecoveryNode()).toEqual({
      apiUrl: 'https://recovery.example/api',
      nodePubkeyB64: 'AAAA',
      appUrl: 'https://recovery.example/app',
    })
  })

  it('ignores records without an api url', () => {
    saveRecoveryNode({ apiUrl: '', nodePubkeyB64: 'AAAA' })
    expect(loadRecoveryNode()).toBeNull()
  })

  it('ignores malformed storage', () => {
    localStorage.setItem('fm_recovery_node', '{not json')
    expect(loadRecoveryNode()).toBeNull()
  })

  it('clears the recovery endpoint', () => {
    saveRecoveryNode({ apiUrl: 'https://recovery.example/api' })
    clearRecoveryNode()
    expect(loadRecoveryNode()).toBeNull()
  })
})
