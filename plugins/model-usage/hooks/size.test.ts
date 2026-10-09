import { test, expect } from 'claude-code/testing'

// The desktop app leaves a pane blank when its tree is over 262,144 characters of JSON,
// so a long history of many models must still draw a tree under that.
test('desktop pane with many models stays under the drawing limit', async ($, on) => {
  const day = (n: number) => {
    const d = new Date(Date.now() - n * 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const daily: Record<string, Record<string, number>> = {}
  for (let i = 0; i < 12; i++) {
    const days: Record<string, number> = {}
    for (let n = 0; n < 180; n++) days[day(n)] = 1000 * (i + 1) + n
    daily[`claude-opus-5-${i}`] = days
  }
  const store = new Map<string, unknown>([['model-usage.daily', daily]])
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
  const m: any = await $.ui.mount({
    plugin: 'model-usage', surface: 'desktop', component: 'Pane', requestId: 'model-usage',
    props: { title: 'Usage', isFocused: false, bodyColumns: 100, placement: 'dock' } as never,
    viewport: { columns: 100, rows: 40 } as never,
  })
  const tree = JSON.stringify(await m.drawn())
  expect(tree.includes('more model')).toBe(true)
  expect(tree.length < 262_144).toBe(true)
})
