import { test, expect } from 'claude-code/testing'
import { priceOf, usdOf } from './register'

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

// Rates from platform.claude.com/docs/en/about-claude/pricing, checked 2026-10-09.
test('model ids map to current prices', async () => {
  expect(priceOf('claude-opus-5-5', 0)).toEqual([4, 20, 0.2, 8])
  expect(priceOf('claude-opus-4-8', 0)).toEqual([5, 25, 0.5, 10])
  expect(priceOf('claude-opus-4-1-20250805', 0)).toEqual([15, 75, 1.5, 30])
  expect(priceOf('claude-sonnet-5-5', 0)).toEqual([2, 10, 0.1, 4])
  expect(priceOf('claude-sonnet-5', 0)).toEqual([2, 10, 0.2, 4])
  expect(priceOf('claude-sonnet-4-6', 0)).toEqual([3, 15, 0.3, 6])
  expect(priceOf('claude-haiku-4-5-20251001', 0)).toEqual([1, 5, 0.1, 2])
  expect(priceOf('claude-fable-5-1', 0)).toEqual([10, 50, 0.25, 20])
  expect(priceOf('claude-fable-5', 0)).toEqual([10, 50, 1, 20])
  expect(priceOf('claude-nova-9', 0)).toEqual([4, 20, 0.2, 8])
  expect(priceOf('unsloth/Qwen3.8-27b-GGUF', 0)).toEqual([0, 0, 0, 0])
})

test('Haiku 5.5 switches price above a 100K-token prompt', async () => {
  expect(priceOf('claude-haiku-5-5', 100_000)).toEqual([0.1, 0.5, 0.01, 0.2])
  expect(priceOf('claude-haiku-5-5', 100_001)).toEqual([0.5, 2.5, 0.05, 1])
  // prompt = input + cache read + cache write
  // long tier: 1K in at $0.50, 1M out at $2.50, 99K read at $0.05, 1K write at $1
  expect(round6(usdOf('claude-haiku-5-5', 1_000, 1_000_000, 99_000, 1_000))).toBe(2.50645)
})

test('Opus 5.5 session sample prices cache writes at the 1-hour rate', async () => {
  expect(round6(usdOf('claude-opus-5-5', 12, 1116, 561283, 80028))).toBe(0.774849)
})
