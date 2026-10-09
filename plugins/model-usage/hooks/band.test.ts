import { test, expect } from 'claude-code/testing'

// The test kit has no $.state host, so state is a small in-memory stand-in.
for (const surface of ['desktop', 'terminal'] as const) {
  test(`undocked band draws on ${surface}`, async ($, on) => {
    const store = new Map<string, unknown>()
    const ver = new Map<string, number>()
    const name = (e: unknown) => `${(e as { plugin: string }).plugin}.${(e as { key: string }).key}`
    on('state.get', async (_$, e) => ({ value: { value: store.get(name(e)), version: ver.get(name(e)) ?? 0 } }) as never)
    on('state.set', async (_$, e) => {
      store.set(name(e), (e as { value: unknown }).value)
      ver.set(name(e), (ver.get(name(e)) ?? 0) + 1)
      return { value: { isSet: true, version: ver.get(name(e)) } } as never
    })
    store.set('model-usage.rows', {
      'claude-opus-5-5': { requests: 2, input: 1000, output: 500, cacheRead: 100, cacheWrite: 10, subagentRequests: 0 },
      'claude-haiku-4-5-20251001': { requests: 3, input: 500, output: 200, cacheRead: 0, cacheWrite: 0, subagentRequests: 1 },
    })
    on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }) as never)
    const m = await $.ui.mount({
      plugin: 'model-usage', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100 } as never,
      viewport: { columns: 100, rows: 40 } as never,
    })
    expect(m).toBeTruthy()
  })
}
