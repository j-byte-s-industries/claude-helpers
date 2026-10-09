import { test, expect } from 'claude-code/testing'

// The test kit has no $.state host, so the tally path is not exercised here.
test('/model-usage opens the pane', async ($, on) => {
  on('ui.open', async () => ({ value: {} }) as never)
  on('command.run', async () => ({ value: { text: '' } }) as never)
  const r = await $.command.run({ command: 'model-usage', args: '' } as never)
  expect(JSON.stringify(r)).toContain('Usage pane opened.')
})
