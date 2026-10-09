import { test, expect } from 'claude-code/testing'
import { usageIn } from './register'

const now = new Date(2026, 5, 15, 12, 30)

test('24h includes 23 hours back, excludes 24', () => {
  expect(usageIn('24h', now, {}, { '2026-06-14T13': 5, '2026-06-14T12': 7 })).toBe(5)
})

test('7d includes 167 hours back, excludes 168', () => {
  expect(usageIn('7d', now, {}, { '2026-06-08T13': 3, '2026-06-08T12': 9 })).toBe(3)
})

test('30d includes 29 days back, excludes 30', () => {
  expect(usageIn('30d', now, { '2026-05-17': 4, '2026-05-16': 8 }, {})).toBe(4)
})

test('6m includes 182 days back, excludes 183', () => {
  expect(usageIn('6m', now, { '2025-12-15': 6, '2025-12-14': 2 }, {})).toBe(6)
})

test('ranking differs between 24h and 6m', () => {
  const a = { days: { '2026-06-15': 10, '2026-03-01': 1000 }, hours: { '2026-06-15T12': 10 } }
  const b = { days: { '2026-06-15': 5 }, hours: { '2026-06-15T12': 5 } }
  const u = (r: '24h' | '6m', m: { days: Record<string, number>; hours: Record<string, number> }) => usageIn(r, now, m.days, m.hours)
  expect(u('24h', a) > u('24h', b)).toBe(true)
  expect(u('6m', a) > u('6m', b)).toBe(true)
  const c = { days: { '2026-06-15': 5, '2026-03-01': 5000 }, hours: { '2026-06-15T12': 5 } }
  expect(u('24h', a) > u('24h', c)).toBe(true)
  expect(u('6m', c) > u('6m', a)).toBe(true)
})
