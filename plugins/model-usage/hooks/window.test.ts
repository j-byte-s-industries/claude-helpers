import { test, expect } from 'claude-code/testing'

// The pane's "Limit window" buttons pick which usage limit the cost split covers.
for (const surface of ['desktop', 'terminal'] as const) {
  test(`limit window toggles to weekly on ${surface}`, async ($, on) => {
    const store = new Map<string, unknown>()
    const ver = new Map<string, number>()
    on('state.get', async (_$, e) => {
      const k = `${(e as any).plugin}.${(e as any).key}`
      return { value: { value: store.get(k), version: ver.get(k) ?? 0 } } as never
    })
    on('state.set', async (_$, e) => {
      const k = `${(e as any).plugin}.${(e as any).key}`
      store.set(k, (e as any).value); ver.set(k, (ver.get(k) ?? 0) + 1)
      return { value: { isSet: true, version: ver.get(k) } } as never
    })
    store.set('model-usage.daily', { 'claude-opus-5-5': { '2026-10-08': 1234 } })
    const m = await $.ui.mount({
      plugin: 'model-usage', surface, component: 'Pane', requestId: 'model-usage',
      props: { title: 'Usage', isFocused: false, bodyColumns: 100, placement: 'dock' } as never,
      viewport: { columns: 100, rows: 40 } as never,
    })
    await (m as any).press({ key: 'window-7d' })
    expect(store.get('model-usage.limitWindow')).toBe('7d')
    await (m as any).press({ key: 'window-5h' })
    expect(store.get('model-usage.limitWindow')).toBe('5h')
  })
}
