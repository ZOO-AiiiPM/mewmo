import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { call } from './tauriCall'
import { invoke } from '@tauri-apps/api/core'

const mockInvoke = vi.mocked(invoke)

describe('tauriCall', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  test('returns result on first success', async () => {
    mockInvoke.mockResolvedValueOnce({ data: 'ok' })
    const result = await call<{ data: string }>('get_notes')
    expect(result).toEqual({ data: 'ok' })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(mockInvoke).toHaveBeenCalledWith('get_notes', undefined)
  })

  test('passes args to invoke', async () => {
    mockInvoke.mockResolvedValueOnce('done')
    await call('save_note', { id: '123', content: 'hi' })
    expect(mockInvoke).toHaveBeenCalledWith('save_note', { id: '123', content: 'hi' })
  })

  test('retries on Tauri injection timing error (undefined)', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('Cannot read properties of undefined'))
      .mockRejectedValueOnce(new Error('Cannot read properties of undefined'))
      .mockResolvedValueOnce('success')

    const result = await call<string>('cmd')
    expect(result).toBe('success')
    expect(mockInvoke).toHaveBeenCalledTimes(3)
  })

  test('retries on __TAURI error', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('__TAURI_INTERNALS__ not found'))
      .mockResolvedValueOnce('ok')

    const result = await call<string>('cmd')
    expect(result).toBe('ok')
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  test('throws immediately on non-injection business error', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Note not found'))
    await expect(call('get_note', { id: 'x' })).rejects.toThrow('Note not found')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  test('throws last error after 10 retries exhausted', async () => {
    mockInvoke.mockRejectedValue(new Error('undefined is not a function'))
    await expect(call('cmd')).rejects.toThrow('undefined')
    expect(mockInvoke).toHaveBeenCalledTimes(10)
  })
})
