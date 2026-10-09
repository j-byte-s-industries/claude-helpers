export type Tally = {
  requests: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  subagentRequests: number
  /** estimated USD, summed from per-request prices; absent on tallies that never priced requests */
  usd?: number
}

/** model id -> local hour (YYYY-MM-DDTHH) -> fresh tokens; the last 8 days only */
export type Hourly = Record<string, Record<string, number>>

export type Range = '24h' | '7d' | '30d' | '6m'

/** which usage limit the per-model cost split measures against: the 5-hour or the weekly window */
export type LimitWindow = '5h' | '7d'

/** model id -> local date (YYYY-MM-DD) -> fresh tokens (input + output + cache write) */
export type Daily = Record<string, Record<string, number>>

declare module 'claude-code' {
  interface PluginState {
    'model-usage': { rows: Record<string, Tally>; daily: Daily; hourly: Hourly; active: Record<string, number>; range: Range; limitWindow: LimitWindow; tick: number; isPaneOpen: boolean; isBandHidden: boolean }
  }
}
