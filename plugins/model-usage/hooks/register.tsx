import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Daily, Hourly, LimitWindow, Range, Tally } from '../types'

const PANE = 'model-usage'
const rows = atom({ plugin: 'model-usage', key: 'rows' } as const, {} as Record<string, Tally>)
const daily = atom({ plugin: 'model-usage', key: 'daily' } as const, {} as Daily)
const hourly = atom({ plugin: 'model-usage', key: 'hourly' } as const, {} as Hourly)
const range = atom({ plugin: 'model-usage', key: 'range' } as const, '6m' as Range)
const limitWindow = atom({ plugin: 'model-usage', key: 'limitWindow' } as const, '5h' as LimitWindow)
const isPaneOpen = atom({ plugin: 'model-usage', key: 'isPaneOpen' } as const, false)
const isBandHidden = atom({ plugin: 'model-usage', key: 'isBandHidden' } as const, false)
const tick = atom({ plugin: 'model-usage', key: 'tick' } as const, 0)
const active = atom({ plugin: 'model-usage', key: 'active' } as const, {} as Record<string, number>)

const KEEP_DAYS = 200
// The desktop app drops a pane whose tree is over 262,144 characters of JSON (and over 2,000
// nodes), leaving it blank. Model cards (~37K each) are drawn while they fit in this budget,
// which leaves room for the tiles, the limits and the JSON escaping; the rest are counted.
const SVG_BUDGET = 180_000
const MAX_WEEKS = 26
const EMPTY = '#2d333b'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Five-step scales, light to strong, one hue per model family.
const SCALES: Record<string, string[]> = {
  opus: ['#3b2a5c', '#5b3f99', '#7c5cc4', '#a78bfa', '#d2bfff'],
  sonnet: ['#0c3a66', '#115a9e', '#1f7ad6', '#58a6ff', '#a5d1ff'],
  haiku: ['#5a3a0a', '#8a5a10', '#bf7f17', '#e3a63b', '#ffd27a'],
  other: ['#0e4429', '#006d32', '#26a641', '#39d353', '#7ee787'],
}


// 7-cell sprites, 4 rows tall: [text, color] per row.
const SPRITES: Record<string, { rows: [string, string][] }> = {
  haiku: {
    rows: [
      ['  ▄██▄ ', '#e5534b'],
      [' ▀▀▀▀▀▬', '#e5534b'],
      [' (◕‿◕) ', '#ffd9a8'],
      ['  ╱█╲  ', '#e3a63b'],
    ],
  },
  sonnet: {
    rows: [
      ['  ▄▄▄  ', '#8b5e3c'],
      [' [•‿•] ', '#ffd9a8'],
      ['  ▐▼▌  ', '#e5534b'],
      [' ▟███▙ ', '#58a6ff'],
    ],
  },
  opus: {
    rows: [
      ['   ▲   ', '#a78bfa'],
      ['  ▟█▙  ', '#7c5cc4'],
      [' (-‿-) ', '#ffd9a8'],
      ['  ▜█▛  ', '#e6edf3'],
    ],
  },
  other: {
    rows: [
      ['  ▄▄▄  ', '#7ee787'],
      [' [o_o] ', '#7ee787'],
      [' ▐███▌ ', '#39d353'],
      ['  ▀ ▀  ', '#39d353'],
    ],
  },
}

const family = (model: string) =>
  /opus/i.test(model) ? 'opus' : /sonnet/i.test(model) ? 'sonnet' : /haiku/i.test(model) ? 'haiku' : 'other'

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)

const total = (t: Tally) => t.input + t.output + t.cacheRead + t.cacheWrite

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (d: Date, n: number) => {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  c.setDate(c.getDate() + n)
  return c
}

const level = (v: number, max: number) =>
  v <= 0 || max <= 0 ? -1 : Math.min(4, Math.floor((v / max) * 4.999))


// ---------------------------------------------------------------------------
// Desktop drawing: one SVG card per model, in the style of savvy-progress.

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
const CELL = 10
const STEP = 13
const LABEL_W = 30
const CLAY = '#D97757'
const INK = '#1F1E1D'

// Light-theme scales, light to strong; the dark ones are SCALES above.
const LIGHT_SCALES: Record<string, string[]> = {
  opus: ['#e4d9ff', '#c4aaff', '#9a74f0', '#7545d6', '#4f26a8'],
  sonnet: ['#cfe6ff', '#9bcbff', '#58a6ff', '#1f7ad6', '#0c4f94'],
  haiku: ['#ffe9c2', '#ffd27a', '#e3a63b', '#bf7f17', '#7d4d06'],
  other: ['#c8f0d2', '#8bdc9f', '#39d353', '#26a641', '#006d32'],
}

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, fam = '', major = '', minor] = m ?? []
  if (!fam) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${fam.charAt(0).toUpperCase()}${fam.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// Clawd on a 30x28 grid. `la`/`lb` are the leg pairs; other classes are props.
const crabBody = (f: Fill, armFront = 0): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

const COSTUMES: Record<string, (f: Fill, accent: string) => void> = {
  // Haiku: a kid in a baseball cap, tossing a ball.
  haiku: (f, t) => {
    crabBody(f)
    stamp(f, 7, 3, [
      '.......bb.......',
      '..cccccccccccc..',
      '.cccccccccccccc.',
      'cccccccwwccccccc',
      'cccccccccccccccc',
      'cccccccccccccccc',
    ], { c: t, b: '#a8321f', w: '#F8F6F1' })
    f(7, 9, 16, 1, '#a8321f')
    f(15, 9, 14, 1, '#a8321f')
    f(27, 13, 3, 3, '#F8F6F1', 'ball')
    f(28, 14, 1, 1, '#E5534B', 'ball')
    f(12, 15, 1, 1, '#c9582f')
    f(17, 16, 1, 1, '#c9582f')
  },
  // Sonnet: a young professional in a navy suit (accent lapels), white shirt, red tie, side-parted hair, briefcase.
  sonnet: (f, t) => {
    crabBody(f)
    stamp(f, 7, 7, [
      '....hhhhhhhh....',
      '..hhhhhhhhhhhh..',
      '.hhhppphhhhhhhh.',
      'hhhhhhhhhhh...hh',
      'hh............hh',
    ], { h: '#2b1d16', p: '#9a7050' })
    stamp(f, 7, 15, [
      'jjjjlwwwwwwljjjj',
      'jjjjjlwrrwljjjjj',
      'jjjjjjlrrljjjjjj',
      'jjjjjjlrrljjjjjj',
      'jjjjjjlrrljjjjjj',
      'jjjjjjjrrjjjjjjj',
      'jjjjjjjjjjjjjjjj',
    ], { j: '#2a3b66', l: t, w: '#F8F6F1', r: '#d8334a' })
    f(5, 14, 2, 4, '#2a3b66'); f(23, 14, 2, 4, '#2a3b66')
    f(5, 17, 2, 1, '#F8F6F1'); f(23, 17, 2, 1, '#F8F6F1')
    f(19, 18, 2, 1, '#F8F6F1')
    f(26, 18, 4, 5, '#8a5a2b', 'case')
    f(27, 17, 2, 1, '#3a2412', 'case')
    f(26, 20, 4, 1, '#d9a441', 'case')
  },
  // Opus: an old sage in a starry hat, long beard and a glowing staff.
  opus: (f, t) => {
    crabBody(f)
    stamp(f, 7, 0, [
      '.......hh.......',
      '......hhhh......',
      '......hhhh......',
      '.....hhhhhh.....',
      '.....hhshhh.....',
      '....hhhhhhhh....',
      '....hhhhhhhh....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
    ], { h: t, s: '#F5C542' })
    f(5, 9, 20, 1, '#3d2a78')
    f(8, 11, 4, 1, '#F8F6F1'); f(18, 11, 4, 1, '#F8F6F1')
    stamp(f, 8, 15, [
      '.wwwwwwwwwwww.',
      'wwwwwwwwwwwwww',
      'wwwwwwwwwwwwww',
      '.wwwwwwwwwwww.',
      '..wwwwwwwwww..',
      '...wwwwwwww...',
    ], { w: '#F0EFEA' })
    f(1, 7, 2, 20, '#7a4a26', 'staff')
    f(0, 3, 4, 4, '#a78bfa', 'orb')
    f(1, 4, 1, 1, '#fff', 'orb')
  },
  other: f => crabBody(f),
}

const crabSvg = (x: number, y: number, fam: string, accent: string, isWalking: boolean, scale = 1.0): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  ;(COSTUMES[fam] ?? COSTUMES.other)(f, accent)
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  return `<g transform="translate(${x},${y}) scale(${scale})" shape-rendering="crispEdges"><g class="mu-c-${fam}${isWalking ? ' mu-run' : ''}">${body}${group('la')}${group('lb')}</g></g>`
}

const familyCss = (): string =>
  Object.keys(SCALES)
    .map(fam => {
      const dark = SCALES[fam].map((c, i) => `.mu-${fam}-l${i}{fill:${c}}`).join('')
      const light = LIGHT_SCALES[fam].map((c, i) => `.mu-${fam}-l${i}{fill:${c}}`).join('')
      return `${light}@media (prefers-color-scheme: dark){${dark}}`
    })
    .join('')

// Pure CSS, run by the compositor. Periods divide one second.
const MU_CSS = `<style>
.mt{fill:#1f1f1f}.ms{fill:#6b6b68}.mm{fill:#9a9a96}.mk{fill:#ebedf0}.mkr{stroke:#ebedf0}.mln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.mt{fill:#ececec}.ms{fill:#a8a8a4}.mm{fill:#7d7d79}.mk{fill:#2d333b}.mkr{stroke:#2d333b}.mln{stroke:#333331}.tile{fill:#262625}}
${familyCss()}
.mu-run .la{animation:mst .5s steps(1) infinite}.mu-run .lb{animation:mst .5s steps(1) infinite -.25s}
.mu-run .bd{animation:mbob .5s steps(1) infinite -.125s}
.mu-run g{transform-box:fill-box}
@keyframes mst{50%{transform:translateY(-1px)}}@keyframes mbob{50%{transform:translateY(1px)}}
.mu-c-haiku.mu-run .la{animation-duration:.25s}.mu-c-haiku.mu-run .lb{animation-duration:.25s;animation-delay:-.125s}
.mu-c-haiku.mu-run .ball{animation:mtoss 1s ease-in-out infinite}
@keyframes mtoss{50%{transform:translateY(-6px)}}
.mu-c-sonnet.mu-run .case{transform-origin:50% 0;animation:mswing .5s ease-in-out infinite}
@keyframes mswing{50%{transform:rotate(14deg)}}
.mu-c-opus.mu-run{animation:mfloat 1.2s ease-in-out infinite}
.mu-c-opus.mu-run .la,.mu-c-opus.mu-run .lb,.mu-c-opus.mu-run .bd{animation:none}
.mu-c-opus.mu-run .orb{animation:mblink .6s steps(1) infinite}
@keyframes mfloat{50%{transform:translateY(-2px)}}@keyframes mblink{50%{opacity:.25}}
.mu-live{animation:mpulse 1.6s ease-in-out infinite}@keyframes mpulse{50%{opacity:.3}}
.mu-tw{animation:mtw 2.4s ease-in-out infinite}.mu-tw2{animation:mtw 3.1s ease-in-out infinite -1s}
@keyframes mtw{50%{opacity:.55}}
@media (prefers-reduced-motion: reduce){.mu-run,.mu-run g,.mu-live,.mu-tw,.mu-tw2{animation:none!important}}
</style>`

const svgDoc = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${MU_CSS}${body}</svg>`

const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

const tilesSvg = (W: number, tiles: [string, string][]): string => {
  const gap = 6
  const tw = (W - gap * (tiles.length - 1)) / tiles.length
  const body = tiles
    .map(
      ([k, v], i) => `<rect class="tile" x="${i * (tw + gap)}" y="0" width="${tw}" height="40" rx="8"/>
<text class="ms" x="${i * (tw + gap) + 9}" y="16" font-family="${FONT}" font-size="11">${xml(k)}</text>
<text class="mt" x="${i * (tw + gap) + 9}" y="33" font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${xml(v)}</text>`,
    )
    .join('')
  return svgDoc(W, 40, body)
}

const RANGES: { id: Range; label: string }[] = [
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '6m', label: '6 months' },
]

const hourKey = (d: Date) => `${key(d)}T${String(d.getHours()).padStart(2, '0')}`
const addHours = (d: Date, n: number) => new Date(d.getTime() + n * 3_600_000)

/** Fresh tokens a model used in the timeframe: hours for 24h and 7d, days beyond. */
export const usageIn = (id: Range, now: Date, days: Record<string, number>, hours: Record<string, number>): number => {
  const sum = (from: string, src: Record<string, number>) =>
    Object.entries(src).reduce((n, [k, v]) => (k >= from ? n + v : n), 0)
  if (id === '24h') return sum(hourKey(addHours(now, -23)), hours)
  if (id === '7d') return sum(hourKey(addHours(now, -7 * 24 + 1)), hours)
  return sum(key(addDays(now, id === '30d' ? -29 : -182)), days)
}
const hourText = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Grid = {
  cols: number
  rows: number
  /** null where the cell lies in the future */
  cell: (c: number, r: number) => { k: string; v: number; title: string } | null
  colLabels: { c: number; text: string }[]
  rowLabels: { r: number; text: string }[]
  /** what one cell is, and the window's name for the totals line */
  unit: 'hour' | 'day'
  window: string
  currentKey: string
}

// The grid follows the range: hours for 24h and 7d, days (a week per column) beyond.
const buildGrid = (id: Range, now: Date, maxWeeks: number, days: Record<string, number>, hours: Record<string, number>): Grid => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const everySix = (cols: number, text: (c: number) => string) =>
    Array.from({ length: cols }, (_, c) => c).filter(c => c % 6 === 0).map(c => ({ c, text: text(c) }))

  if (id === '24h') {
    const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 23)
    const at = (c: number) => addHours(first, c)
    return {
      cols: 24,
      rows: 1,
      cell: c => {
        const d = at(c)
        const k = hourKey(d)
        return { k, v: hours[k] ?? 0, title: `${key(d)} ${hourText(d.getHours())}` }
      },
      colLabels: everySix(24, c => hourText(at(c).getHours())),
      rowLabels: [{ r: 0, text: '24h' }],
      unit: 'hour',
      window: '24h',
      currentKey: hourKey(now),
    }
  }

  if (id === '7d') {
    return {
      cols: 24,
      rows: 7,
      cell: (c, r) => {
        const d = addDays(today, r - 6)
        if (r === 6 && c > now.getHours()) return null
        const k = `${key(d)}T${String(c).padStart(2, '0')}`
        return { k, v: hours[k] ?? 0, title: `${WEEKDAYS[d.getDay()]} ${key(d)} ${hourText(c)}` }
      },
      colLabels: everySix(24, c => hourText(c)),
      rowLabels: Array.from({ length: 7 }, (_, r) => ({ r, text: WEEKDAYS[addDays(today, r - 6).getDay()] })),
      unit: 'hour',
      window: '7d',
      currentKey: hourKey(now),
    }
  }

  const weeks = id === '30d' ? 5 : maxWeeks
  const start = addDays(today, -((weeks - 1) * 7 + today.getDay()))
  const colLabels: { c: number; text: string }[] = []
  let last = -1
  for (let c = 0; c < weeks; c++) {
    const m = addDays(start, c * 7).getMonth()
    if (m !== last) colLabels.push({ c, text: MONTHS[m] })
    last = m
  }
  return {
    cols: weeks,
    rows: 7,
    cell: (c, r) => {
      const d = addDays(start, c * 7 + r)
      if (d > today) return null
      const k = key(d)
      return { k, v: days[k] ?? 0, title: `${WEEKDAYS[d.getDay()]} ${k}` }
    },
    colLabels,
    rowLabels: [1, 3, 5].map(r => ({ r, text: WEEKDAYS[r] })),
    unit: 'day',
    window: `${weeks}w`,
    currentKey: key(today),
  }
}

const gridStats = (g: Grid) => {
  const vals: number[] = []
  for (let c = 0; c < g.cols; c++)
    for (let r = 0; r < g.rows; r++) {
      const x = g.cell(c, r)
      if (x) vals.push(x.v)
    }
  return { max: Math.max(0, ...vals), sum: vals.reduce((n, v) => n + v, 0) }
}

const sumDays = (days: Record<string, number>, today: Date, n: number) => {
  let t = 0
  for (let i = 0; i < n; i++) t += days[key(addDays(today, -i))] ?? 0
  return t
}

const cellSize = (W: number, g: Grid) =>
  Math.max(8, Math.min(g.rows === 1 ? 20 : 14, Math.floor((W - LABEL_W) / g.cols) - 3))

const GRID_Y = 72

const cardHeight = (g: Grid, size: number) => GRID_Y + g.rows * (size + 3) + 50

// USD per million tokens: input, output, cache read, cache write. An estimate, not a bill.
// Standard API rates from platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-09).
// Cache writes use the 1-hour rate (2x input), since Claude Code caches for an hour; usage
// reports writes as one count, so 5-minute writes are overcounted. Fast mode (2x) is not
// visible in usage, so it is not priced. First match wins: specific versions before families.
type Price = [number, number, number, number]
const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus-4-(1|\d{8})/, [15, 75, 1.5, 30]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-3-5/, [0.8, 4, 0.08, 1.6]],
  [/haiku/, [1, 5, 0.1, 2]],
  // A Claude model newer than this table: priced as the current Opus.
  [/claude/, [4, 20, 0.2, 8]],
]
// Haiku 5.5 is priced per request by prompt length (input + cache read + cache write).
const HAIKU_5_5 = /haiku-5-5/
const HAIKU_5_5_LONG = 100_000
const HAIKU_5_5_PRICES: [Price, Price] = [[0.1, 0.5, 0.01, 0.2], [0.5, 2.5, 0.05, 1]]
// Anything else (a local or third-party model behind a proxy) is not billed by Anthropic.
const FALLBACK_PRICE: Price = [0, 0, 0, 0]

export const priceOf = (model: string, prompt: number): Price => {
  const id = model.toLowerCase()
  if (HAIKU_5_5.test(id)) return HAIKU_5_5_PRICES[prompt > HAIKU_5_5_LONG ? 1 : 0]

  return PRICES.find(([re]) => re.test(id))?.[1] ?? FALLBACK_PRICE
}

/** One request's estimated USD, or a sum of requests priced as if each were short. */
export const usdOf = (model: string, input: number, output: number, cacheRead: number, cacheWrite: number): number => {
  const [i, o, r, w] = priceOf(model, input + cacheRead + cacheWrite)

  return (input * i + output * o + cacheRead * r + cacheWrite * w) / 1e6
}

const costOf = (model: string, t: Tally | undefined): number => {
  if (!t) return 0

  return t.usd ?? usdOf(model, t.input, t.output, t.cacheRead, t.cacheWrite)
}

const fmtUsd = (usd: number) => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

type Card = {
  model: string
  days: Record<string, number>
  tally?: Tally
  isBusy: boolean
  /** this model's cost, and its share (0..1) of the session's estimated cost */
  cost: number
  share: number
  /** what the tally covers, and how many sessions contributed */
  scope: string
  sessions: number
  grid: Grid
  size: number
  today: Date
}

const cardSvg = (W: number, c: Card): string => {
  const fam = family(c.model)
  const scale = SCALES[fam]
  const accent = scale[3]
  const { grid: g, size } = c
  const step = size + 3
  const { max, sum } = gridStats(g)
  const todayKey = key(c.today)
  const H = cardHeight(g, size)

  const cells: string[] = []
  for (let col = 0; col < g.cols; col++)
    for (let r = 0; r < g.rows; r++) {
      const x = g.cell(col, r)
      if (!x) continue
      const lv = level(x.v, max)
      const cls = lv < 0 ? 'mk' : `mu-${fam}-l${lv}${lv === 4 ? (noise(col, r) < 0.5 ? ' mu-tw' : ' mu-tw2') : ''}`
      const outline = x.k === g.currentKey ? ` stroke="${accent}" stroke-width="1.4"` : ''
      cells.push(
        `<rect class="${cls}" x="${LABEL_W + col * step}" y="${GRID_Y + r * step}" width="${size}" height="${size}" rx="2"${outline}><title>${xml(x.title)}: ${fmt(x.v)} tokens</title></rect>`,
      )
    }
  const colLabels = g.colLabels.map(
    l => `<text class="mm" x="${LABEL_W + l.c * step}" y="${GRID_Y - 6}" font-family="${FONT}" font-size="9">${xml(l.text)}</text>`,
  )
  const rowLabels = g.rowLabels.map(
    l => `<text class="mm" x="0" y="${GRID_Y + l.r * step + Math.min(size, 14) - 1}" font-family="${FONT}" font-size="9">${xml(l.text)}</text>`,
  )

  const legendY = GRID_Y + g.rows * step + 6
  const L = LABEL_W
  const legend = `<text class="mm" x="${L}" y="${legendY + 9}" font-family="${FONT}" font-size="9">Less</text>
<rect class="mk" x="${L + 26}" y="${legendY}" width="${CELL}" height="${CELL}" rx="2"/>${scale
    .map((_, i) => `<rect class="mu-${fam}-l${i}" x="${L + 26 + (i + 1) * STEP}" y="${legendY}" width="${CELL}" height="${CELL}" rx="2"/>`)
    .join('')}<text class="mm" x="${L + 26 + 6 * STEP + 2}" y="${legendY + 9}" font-family="${FONT}" font-size="9">More</text>
<text class="mm" x="${L + 26 + 6 * STEP + 34}" y="${legendY + 9}" font-family="${FONT}" font-size="9">· one square = one ${g.unit}</text>`

  const t = c.tally
  const session = t
    ? `${c.scope} · ${c.sessions} session${c.sessions === 1 ? '' : 's'} · ${t.requests} req (${t.subagentRequests} sub) · in ${fmt(t.input)} · out ${fmt(t.output)}`
    : `no requests in the ${c.scope}`
  const cache = t ? `cache · read ${fmt(t.cacheRead)} · write ${fmt(t.cacheWrite)}` : ''
  const busy = c.isBusy
    ? `<circle class="mu-live" cx="${W - 128}" cy="14" r="3.5" fill="${accent}"/><text class="ms" x="${W - 120}" y="18" font-family="${FONT}" font-size="11">responding</text>`
    : ''
  const R = 15
  const CIRC = 2 * Math.PI * R
  const pct = Math.round(c.share * 100)
  const dial = `<g transform="translate(${W - 32},30)">
<title>${xml(modelName(c.model))}: ${fmtUsd(c.cost)} estimated, ${pct}% of the window's cost</title>
<circle class="mkr" r="${R}" fill="none" stroke-width="5"/>
<circle r="${R}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c.share * CIRC).toFixed(2)} ${CIRC.toFixed(2)}" transform="rotate(-90)"/>
<text class="mt" y="4" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" font-variant-numeric="tabular-nums">${pct}%</text>
<text class="ms" x="28" y="30" text-anchor="end" font-family="${FONT}" font-size="9" font-variant-numeric="tabular-nums">${fmtUsd(c.cost)} of window</text>
</g>`

  return svgDoc(
    W,
    H,
    `${crabSvg(0, 6, fam, accent, c.isBusy)}
<text class="mt" x="40" y="17" font-family="${FONT}" font-size="14" font-weight="600">${xml(modelName(c.model))}</text>
<text class="ms" x="40" y="31" font-family="${FONT}" font-size="11">${xml(c.model)}</text>
<text class="mt" x="40" y="46" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">today ${fmt(c.days[todayKey] ?? 0)}   7d ${fmt(sumDays(c.days, c.today, 7))}   ${g.window} ${fmt(sum)}   peak ${g.unit} ${fmt(max)}</text>
${busy}${dial}${colLabels.join('')}${rowLabels.join('')}${cells.join('')}${legend}
<text class="ms" x="${L}" y="${legendY + 30}" font-family="${FONT}" font-size="10" font-variant-numeric="tabular-nums">${xml(session)}</text>
${cache ? `<text class="ms" x="${L}" y="${legendY + 43}" font-family="${FONT}" font-size="10" font-variant-numeric="tabular-nums">${xml(cache)}</text>` : ''}
<line class="mln" x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}"/>`,
  )
}

// ---------------------------------------------------------------------------
// Usage limits: the account's rate-limit windows, under all the models.

type Limit = { kind: string; percentUsed: number; resetsAt?: string }

const LIMIT_NAMES: Record<string, string> = { five_hour: '5-hour window', seven_day: 'Weekly window', spend_limit: 'Spend limit' }
const limitName = (kind: string) => LIMIT_NAMES[kind] ?? kind.replace(/_/g, ' ')
const limitColor = (pct: number) => (pct >= 90 ? '#D0453F' : pct >= 70 ? '#E3A63B' : '#3B9C5F')

const resetsIn = (iso: string | undefined, nowMs: number): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - nowMs
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'resets now'
  const m = Math.round(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return `resets in ${d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`}`
}

const LIMIT_ROW = 38

const limitsHeight = (n: number) => 30 + Math.max(1, n) * LIMIT_ROW

const limitsSvg = (W: number, limits: Limit[], cost: number | undefined, nowMs: number): string => {
  const barW = W - 2
  const rowsSvg = limits.length
    ? limits
        .map((l, i) => {
          const y = 30 + i * LIMIT_ROW
          const pct = Math.max(0, l.percentUsed)
          const fill = Math.round((barW * Math.min(100, pct)) / 100)
          const color = limitColor(pct)
          return `<text class="mt" x="0" y="${y + 10}" font-family="${FONT}" font-size="12" font-weight="600">${xml(limitName(l.kind))}</text>
<text class="ms" x="${W}" y="${y + 10}" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${pct.toFixed(pct % 1 ? 1 : 0)}% used  ·  ${xml(resetsIn(l.resetsAt, nowMs))}</text>
<rect class="mk" x="0" y="${y + 17}" width="${barW}" height="6" rx="3"/><rect x="0" y="${y + 17}" width="${fill}" height="6" rx="3" fill="${color}"/>`
        })
        .join('')
    : `<text class="ms" x="0" y="46" font-family="${FONT}" font-size="11">No rate-limit reading yet (needs a subscription and one finished response).</text>`
  return svgDoc(
    W,
    limitsHeight(limits.length),
    `<text class="mt" x="0" y="15" font-family="${FONT}" font-size="14" font-weight="600">Usage limits</text>
${cost !== undefined ? `<text class="ms" x="${W}" y="15" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">session cost ≈ $${cost < 10 ? cost.toFixed(2) : cost.toFixed(1)}</text>` : ''}
${rowsSvg}`,
  )
}

// ---------------------------------------------------------------------------
// All sessions in the current usage limit: each session writes its own small file
// (5-minute buckets), and every session reads them all. One writer per file, so
// concurrent sessions never overwrite each other.

const FIVE_HOURS = 5 * 3_600_000
const SEVEN_DAYS = 7 * 24 * 3_600_000
const BUCKET = 300_000
// A day past the weekly window, so a week of buckets survives clock drift on the reset time.
const KEEP_BUCKETS_MS = SEVEN_DAYS + 24 * 3_600_000

// Which usage limit the cost split measures against: its rate-limit kind, span and labels.
const WINDOWS: Record<LimitWindow, { kind: string; span: number; button: string; inLimit: string; rolling: string; short: string }> = {
  '5h': { kind: 'five_hour', span: FIVE_HOURS, button: '5 hours', inLimit: '5h limit window', rolling: 'last 5h', short: '5h' },
  '7d': { kind: 'seven_day', span: SEVEN_DAYS, button: 'Weekly', inLimit: 'weekly limit window', rolling: 'last 7d', short: 'wk' },
}

// requests, input, output, cache read, cache write, subagent requests, estimated USD
// (priced per request; files written before the USD slot have six entries)
type Cell = [number, number, number, number, number, number, number?]
type Buckets = Record<string, Record<string, Cell>>
type SessionFile = { sessionId: string; updatedAt: number; buckets: Buckets }

const place = { dir: '', id: '' }
let mine: Buckets = {}

const emptyTally = (): Tally => ({ requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, subagentRequests: 0, usd: 0 })

const addCell = (model: string, t: Tally, c: Cell): void => {
  t.requests += c[0]
  t.input += c[1]
  t.output += c[2]
  t.cacheRead += c[3]
  t.cacheWrite += c[4]
  t.subagentRequests += c[5]
  t.usd = (t.usd ?? 0) + (c[6] ?? usdOf(model, c[1], c[2], c[3], c[4]))
}

const recordBucket = (model: string, u: Usage, isSub: boolean, at: number): void => {
  const b = String(Math.floor(at / BUCKET) * BUCKET)
  const m = (mine[model] ??= {})
  const c = (m[b] ??= [0, 0, 0, 0, 0, 0, 0])
  c[0] += 1
  c[1] += u.input_tokens
  c[2] += u.output_tokens
  c[3] += u.cache_read_input_tokens
  c[4] += u.cache_creation_input_tokens
  c[5] += isSub ? 1 : 0
  c[6] = (c[6] ?? 0) + usdOf(model, u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens)
  for (const model2 of Object.keys(mine))
    for (const k of Object.keys(mine[model2])) if (at - Number(k) > KEEP_BUCKETS_MS) delete mine[model2][k]
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// Folds session files into one tally per model for buckets starting at or after `startMs`.
const foldFiles = (files: SessionFile[], startMs: number): { perModel: Record<string, Tally>; sessions: number } => {
  const perModel: Record<string, Tally> = {}
  let sessions = 0
  const from = Math.floor(startMs / BUCKET) * BUCKET
  for (const f of files) {
    let isActive = false
    for (const [model, byBucket] of Object.entries(f.buckets ?? {}))
      for (const [b, cell] of Object.entries(byBucket)) {
        if (Number(b) < from) continue
        addCell(model, (perModel[model] ??= emptyTally()), cell)
        isActive = true
      }
    if (isActive) sessions += 1
  }
  return { perModel, sessions }
}

export type WindowUsage = {
  perModel: Record<string, Tally>
  sessions: number
  /** what the numbers cover: the limit's own window, or a rolling span of the same length */
  label: string
}

let cached: { at: number; which: LimitWindow; value: WindowUsage } | null = null

const loadWindow = async ($: EngineInterface, limits: Limit[], nowMs: number, which: LimitWindow): Promise<WindowUsage> => {
  if (cached && cached.which === which && nowMs - cached.at < 4000) return cached.value
  const w = WINDOWS[which]
  const limit = limits.find(l => l.kind === w.kind)
  const reset = limit?.resetsAt ? Date.parse(limit.resetsAt) : Number.NaN
  const isLimitWindow = !Number.isNaN(reset) && reset > nowMs && reset - nowMs <= w.span + 60_000
  const startMs = isLimitWindow ? reset - w.span : nowMs - w.span
  const label = isLimitWindow ? w.inLimit : w.rolling

  const files: SessionFile[] = [{ sessionId: place.id, updatedAt: nowMs, buckets: mine }]
  if (place.dir) {
    try {
      for (const f of await $.fs.list(place.dir)) {
        if (!f.name.startsWith('usage-') || !f.name.endsWith('.json') || f.name === `usage-${place.id}.json`) continue
        if (f.mtimeMs < startMs - BUCKET) continue
        try {
          files.push(JSON.parse(await $.fs.read(`${place.dir}/${f.name}`)) as SessionFile)
        } catch {
          // A file being rewritten or damaged: skip it this time.
        }
      }
    } catch {
      // No shared folder yet or no file access: this session's numbers only.
    }
  }
  const { perModel, sessions } = foldFiles(withHistory(files), startMs)
  const value = { perModel, sessions, label }
  cached = { at: nowMs, which, value }

  return value
}

const writeMine = async ($: EngineInterface, at: number): Promise<void> => {
  if (!place.dir || !place.id) return
  try {
    const file: SessionFile = { sessionId: place.id, updatedAt: at, buckets: mine }
    await $.fs.write(`${place.dir}/usage-${place.id}.json`, JSON.stringify(file))
  } catch {
    // Sharing is best effort; this session still shows its own numbers.
  }
}

let chain: Promise<unknown> = Promise.resolve()

// ---------------------------------------------------------------------------
// Transcript backfill: Claude Code writes every response's usage to a transcript
// under ~/.claude/projects, so sessions this mod never saw (before it was loaded,
// or whose bucket file is gone) are read from there by hooks/backfill.py. The
// script is incremental: after the first run it parses only new lines.

type History = { updatedAt: number; sessions: Record<string, Buckets>; daily: Daily; hourly: Hourly }

let history: History | null = null
let backfillAt = 0
let backfilling: Promise<void> | null = null
// What the last run did, for the pane's footer: when it read the transcripts, or why it failed.
let backfillStatus = 'transcripts not read yet'
const BACKFILL_EVERY_MS = 60_000

// The price table, handed to the script so it lives in one place.
const pricesJson = (): string =>
  JSON.stringify({
    table: PRICES.map(([re, price]) => [re.source, price]),
    haiku55: { re: HAIKU_5_5.source, long: HAIKU_5_5_LONG, prices: HAIKU_5_5_PRICES },
    fallback: FALLBACK_PRICE,
  })

// Per session, model and bucket, whichever of the live file and the transcripts
// counted more requests: both count the same requests, so they are never added.
// On a tie the transcripts win, since they price the real cache-write split.
const withHistory = (files: SessionFile[]): SessionFile[] => {
  if (!history) return files
  const out = files.map(f => ({
    ...f,
    buckets: Object.fromEntries(Object.entries(f.buckets ?? {}).map(([m, b]) => [m, { ...b }])),
  }))
  const bySession = new Map(out.map(f => [f.sessionId, f]))
  for (const [sid, models] of Object.entries(history.sessions)) {
    let f = bySession.get(sid)
    if (!f) {
      f = { sessionId: sid, updatedAt: history.updatedAt, buckets: {} }
      out.push(f)
      bySession.set(sid, f)
    }
    for (const [model, cells] of Object.entries(models))
      for (const [b, cell] of Object.entries(cells)) {
        const into = (f.buckets[model] ??= {})
        const live = into[b]
        if (!live || live[0] <= cell[0]) into[b] = cell
      }
  }

  return out
}

// The graphs keep the larger of the live count and the transcripts' for each day
// and hour: the live count outlives a deleted transcript, the transcripts cover
// sessions the mod never saw.
const maxMerge = (live: Record<string, Record<string, number>>, from: Record<string, Record<string, number>>, cutoff: string) => {
  const out: Record<string, Record<string, number>> = {}
  for (const model of new Set([...Object.keys(live), ...Object.keys(from)])) {
    const merged: Record<string, number> = { ...(live[model] ?? {}) }
    for (const [k, v] of Object.entries(from[model] ?? {})) merged[k] = Math.max(merged[k] ?? 0, v)
    for (const k of Object.keys(merged)) if (k < cutoff) delete merged[k]
    if (Object.keys(merged).length > 0) out[model] = merged
  }

  return out
}

const mergeGraphs = ($: EngineInterface, h: History): Promise<unknown> => {
  chain = chain.then(async () => {
    const now = new Date()
    const days = maxMerge(((await $.store.get('daily')) as Daily | undefined) ?? {}, h.daily, key(addDays(now, -KEEP_DAYS)))
    await $.store.set('daily', days)
    await update($, daily, () => days)
    const hrs = maxMerge(((await $.store.get('hourly')) as Hourly | undefined) ?? {}, h.hourly, hourKey(addDays(now, -8)))
    await $.store.set('hourly', hrs)
    await update($, hourly, () => hrs)
  })

  return chain
}

// Runs the script at most once a minute, one run at a time; never throws.
const backfill = ($: EngineInterface): Promise<void> => {
  if (backfilling) return backfilling
  if (Date.now() - backfillAt < BACKFILL_EVERY_MS) return Promise.resolve()
  backfillAt = Date.now()
  backfilling = (async () => {
    try {
      // A hot reload starts the module afresh without a session.start: find the folder here.
      if (!place.dir) place.dir = `${(await $.env.get('HOME')) ?? ''}/.claude/model-usage`
      if (!place.id) place.id = await $.session.id()
      // The plugin root is the folder holding plugin.json, which may be .claude-plugin.
      const root = $.plugin.root.replace(/[\\/]\.claude-plugin$/, '')
      const out = `${place.dir}/history.json`
      const r = await $.process.run(
        [
          'python3', '-I', `${root}/hooks/backfill.py`,
          `${place.dir.replace(/\/model-usage$/, '')}/projects`,
          `${place.dir}/backfill-state.json`, out, pricesJson(), String(Date.now()),
        ],
        { timeoutMs: 120_000 },
      )
      if (r.exitCode !== 0) {
        backfillStatus = `transcript backfill failed: ${r.stderr.trim().split('\n').pop() ?? `exit ${r.exitCode}`}`
        $.ui.log(`model-usage: ${backfillStatus}`, { to: 'debug' })
        return
      }
      history = JSON.parse(await $.fs.read(out)) as History
      backfillStatus = `transcripts read ${new Date(history.updatedAt).toLocaleTimeString()}, ${Object.keys(history.sessions).length} sessions`
      await mergeGraphs($, history)
      cached = null
      await update($, tick, n => n + 1)
    } catch (err) {
      backfillStatus = `transcript backfill failed: ${String(err)}`
      $.ui.log(`model-usage: ${backfillStatus}`, { to: 'debug' })
    } finally {
      backfilling = null
    }
  })()

  return backfilling
}

const BUILD = '2026-10-09-g'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const draw = async ($: EngineInterface, e: any) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const history = await read($, daily)
    const hours = await read($, hourly)
    const busy = await read($, active)
    const picked = await read($, range)
    const pickedWindow = await read($, limitWindow)
    await read($, tick)
    let limits: Limit[] = []
    let cost: number | undefined
    try {
      const u = await $.session.usage()
      limits = [...u.rateLimits]
      cost = u.cost?.usd
    } catch {
      // No usage reading: the section says so.
    }
    const nowMs = Date.now()
    const win = await loadWindow($, limits, nowMs, pickedWindow)
    const session = win.perModel
    const models = Array.from(new Set([...Object.keys(session), ...Object.keys(history)]))
    const costs = Object.fromEntries(models.map(m => [m, costOf(m, session[m])]))
    const usedIn = Object.fromEntries(
      models.map(m => [m, usageIn(picked, new Date(nowMs), history[m] ?? {}, hours[m] ?? {})]),
    )
    models.sort((a, b) => (usedIn[b] ?? 0) - (usedIn[a] ?? 0) || (costs[b] ?? 0) - (costs[a] ?? 0) || (a < b ? -1 : a > b ? 1 : 0))
    const costSum = Object.values(costs).reduce((n, v) => n + v, 0)
    const shareOf = (m: string) => (costSum > 0 ? costs[m] / costSum : 0)

    if (models.length === 0) return <Text dimColor>No model requests yet.</Text>
    // Cards only for models used in the timeframe or the limit window (see SVG_BUDGET).
    const shown = models.filter(m => (usedIn[m] ?? 0) > 0 || (costs[m] ?? 0) > 0)

    const cols = e.props?.bodyColumns ?? e.viewport?.columns ?? 80
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const isBusy = (m: string) =>
      Object.entries(busy).some(([k, n]) => n > 0 && (k === m || modelName(k) === modelName(m)))
    const todayTotal = models.reduce((n, m) => n + (history[m]?.[key(today)] ?? 0), 0)
    const reqs = Object.values(session).reduce((n, t) => n + t.requests, 0)

    const picker = (
      <Box flexDirection="column" gap={1} marginTop={1} marginBottom={1}>
        <Box flexDirection="row" alignItems="center" gap={2}>
          <Text dimColor>Timeframe</Text>
          {RANGES.map(r => (
            <Button
              key={`range-${r.id}`}
              label={r.label}
              variant={r.id === picked ? 'primary' : 'secondary'}
              onPress={() => update($, range, () => r.id)}
            />
          ))}
          <Button key="undock" label="Undock" plain onPress={() => void $.ui.close({ id: PANE })} />
        </Box>
        <Box flexDirection="row" alignItems="center" gap={2}>
          <Text dimColor>Limit window</Text>
          {(Object.keys(WINDOWS) as LimitWindow[]).map(id => (
            <Button
              key={`window-${id}`}
              label={WINDOWS[id].button}
              variant={id === pickedWindow ? 'primary' : 'secondary'}
              onPress={() => update($, limitWindow, () => id)}
            />
          ))}
        </Box>
      </Box>
    )

    if ('Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(280, Math.min(680, cols * 8 - 8))
      const maxWeeks = Math.max(8, Math.min(28, Math.floor((W - LABEL_W) / STEP)))
      const cards: { model: string; source: string; alt: string; height: number }[] = []
      let budget = SVG_BUDGET
      for (const m of shown) {
        const grid = buildGrid(picked, now, maxWeeks, history[m] ?? {}, hours[m] ?? {})
        const size = cellSize(W, grid)
        const source = cardSvg(W, { model: m, days: history[m] ?? {}, tally: session[m], isBusy: isBusy(m), cost: costs[m], share: shareOf(m), scope: win.label, sessions: win.sessions, grid, size, today })
        if (source.length > budget) break
        budget -= source.length
        cards.push({ model: m, source, alt: `${modelName(m)}: ${fmt(gridStats(grid).sum)} tokens in ${grid.window}`, height: cardHeight(grid, size) })
      }
      const hidden = models.length - cards.length

      return (
        <Box flexDirection="column">
          <Svg
            source={tilesSvg(W, [['Models', String(models.length)], [`Requests (${win.label})`, String(reqs)], ['Tokens today', fmt(todayTotal)]])}
            alt={`${models.length} models, ${reqs} requests in the ${win.label}, ${fmt(todayTotal)} tokens today`}
            width={W}
            height={40}
          />
          {picker}
          {cards.map(c => (
            <Svg key={c.model} source={c.source} alt={c.alt} width={W} height={c.height} />
          ))}
          {hidden > 0 && <Text dimColor>{hidden} more model{hidden === 1 ? '' : 's'} with less or no use in this timeframe</Text>}
          <Text dimColor>model-usage build {BUILD} · {backfillStatus}</Text>
          <Svg
            source={limitsSvg(W, limits, cost, nowMs)}
            alt={limits.map(l => `${limitName(l.kind)} ${l.percentUsed}% used`).join(', ') || 'No usage limits reading'}
            width={W}
            height={limitsHeight(limits.length)}
          />
        </Box>
      )
    }

    // Terminal: the same content as text; a cell is two columns wide.
    const maxWeeks = Math.max(8, Math.min(26, Math.floor((cols - 10) / 2)))

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {models.length} models · {reqs} requests in the {win.label} ({win.sessions} session{win.sessions === 1 ? '' : 's'}) · {fmt(todayTotal)} tokens today
        </Text>
        {picker}
        {models.map(model => {
          const scale = SCALES[family(model)]
          const days = history[model] ?? {}
          const grid = buildGrid(picked, now, maxWeeks, days, hours[model] ?? {})
          const { max, sum } = gridStats(grid)
          const s = session[model]
          const labelRow = (() => {
            const buf = Array(grid.cols * 2).fill(' ')
            for (const l of grid.colLabels)
              if (l.c * 2 + l.text.length <= buf.length) l.text.split('').forEach((ch, i) => (buf[l.c * 2 + i] = ch))
            return buf.join('')
          })()

          return (
            <Box flexDirection="column" borderStyle="round" borderColor={scale[2]} paddingX={1} marginTop={1}>
              <Box marginBottom={1}>
                <Box flexDirection="column" marginRight={2}>
                  {SPRITES[family(model)].rows.map(([line, color]) => (
                    <Text color={color}>{line}</Text>
                  ))}
                </Box>
                <Box flexDirection="column" justifyContent="center">
                  <Text bold color={scale[3]}>{modelName(model)}{isBusy(model) ? ' ●' : ''}</Text>
                  <Text color={scale[3]}>
                    {['○', '◔', '◑', '◕', '●'][Math.min(4, Math.round(shareOf(model) * 4))]} {Math.round(shareOf(model) * 100)}%
                    <Text dimColor> of {win.label} cost · {fmtUsd(costs[model])}</Text>
                  </Text>
                  <Text dimColor>
                    today {fmt(days[key(today)] ?? 0)} · 7d {fmt(sumDays(days, today, 7))} · {grid.window} {fmt(sum)} · peak {grid.unit} {fmt(max)}
                  </Text>
                  {s && (
                    <Text dimColor>
                      {win.label}: {s.requests} req ({s.subagentRequests} sub) · in {fmt(s.input)} · out {fmt(s.output)}
                    </Text>
                  )}
                  {s && <Text dimColor>cache: read {fmt(s.cacheRead)} · write {fmt(s.cacheWrite)}</Text>}
                </Box>
              </Box>
              <Text dimColor>{'    '}{labelRow}</Text>
              {Array.from({ length: grid.rows }, (_, r) => (
                <Box>
                  <Text dimColor>{(grid.rowLabels.find(l => l.r === r)?.text ?? '').padEnd(4)}</Text>
                  {Array.from({ length: grid.cols }, (_, c) => {
                    const x = grid.cell(c, r)
                    if (!x) return <Text>{'  '}</Text>
                    const lv = level(x.v, max)

                    return <Text color={lv < 0 ? EMPTY : scale[lv]}>■ </Text>
                  })}
                </Box>
              ))}
              <Box>
                <Text dimColor>{'    '}Less </Text>
                <Text color={EMPTY}>■ </Text>
                {scale.map(c => <Text color={c}>■ </Text>)}
                <Text dimColor>More</Text>
              </Box>
              <Text dimColor>{'    '}one square = one {grid.unit}</Text>
            </Box>
          )
        })}
        <Text dimColor>Graph counts input + output + cache-write tokens. (build {BUILD} · {backfillStatus})</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Usage limits{cost !== undefined ? ` · session ≈ $${cost.toFixed(2)}` : ''}</Text>
          {limits.length === 0 && <Text dimColor>No rate-limit reading yet.</Text>}
          {limits.map(l => {
            const w = 20
            const filled = Math.round((w * Math.min(100, l.percentUsed)) / 100)

            return (
              <Text>
                <Text color={limitColor(l.percentUsed)}>{'█'.repeat(filled)}</Text>
                <Text dimColor>{'░'.repeat(w - filled)}</Text> {limitName(l.kind)} {l.percentUsed}% <Text dimColor>{resetsIn(l.resetsAt, nowMs)}</Text>
              </Text>
            )
          })}
        </Box>
      </Box>
    )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'model-usage',
      description: 'Show token usage per model as an activity graph',
    })
    $.clock.every(30_000, () => void update($, tick, n => n + 1))
    // Never from a render hook: drawing may not write, and a backfill writes the graphs.
    $.clock.every(BACKFILL_EVERY_MS, () => void backfill($))
    try {
      place.id = await $.session.id()
      place.dir = `${(await $.env.get('HOME')) ?? ''}/.claude/model-usage`
      await $.fs.write(`${place.dir}/.keep`, '')
      // Session files nobody has touched for eight days are of no use to any window.
      await $.process.run(['find', place.dir, '-name', 'usage-*.json', '-mtime', '+8', '-delete'], { timeoutMs: 5000 })
      const own = JSON.parse(await $.fs.read(`${place.dir}/usage-${place.id}.json`)) as SessionFile
      mine = own.buckets ?? {}
    } catch {
      // First run, or no file access: this session starts with an empty file.
    }
    const open = (await $.ui.panes()).some(p => p.id === PANE)
    await update($, isPaneOpen, () => open)
    const saved = (await $.store.get('daily')) as Daily | undefined
    if (saved) await update($, daily, () => saved)
    const savedHours = (await $.store.get('hourly')) as Hourly | undefined
    if (savedHours) await update($, hourly, () => savedHours)
    void backfill($)

    return next(e)
  })

  on('ui.open', async ($, e, next) => {
    const opened = await next(e)
    if (e.id === PANE) await update($, isPaneOpen, () => true).catch(() => undefined)

    return opened
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) await update($, isPaneOpen, () => false).catch(() => undefined)

    return closed
  })

  on('command.run', { command: 'model-usage' }, async $ => {
    await update($, isBandHidden, () => false)
    await $.ui.open({ id: PANE, title: 'Usage by model' })

    return { text: 'Usage pane opened.' }
  })

  on('turn.step', async function* ($, e, next) {
    await update($, active, a => ({ ...a, [e.model]: (a[e.model] ?? 0) + 1 }))
    let r
    try {
      r = yield* next(e)
    } finally {
      await update($, active, a => ({ ...a, [e.model]: Math.max(0, (a[e.model] ?? 1) - 1) }))
    }
    const u = r.usage
    if (u) {
      const model = u.model || e.model
      const fresh = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens
      await update($, rows, all => {
        const t = all[model] ?? {
          requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, subagentRequests: 0,
        }
        return {
          ...all,
          [model]: {
            requests: t.requests + 1,
            input: t.input + u.input_tokens,
            output: t.output + u.output_tokens,
            cacheRead: t.cacheRead + u.cache_read_input_tokens,
            cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
            subagentRequests: t.subagentRequests + (e.agentId ? 1 : 0),
          },
        }
      })

      const nowAt = Date.now()
      recordBucket(model, u, Boolean(e.agentId), nowAt)
      // A hot reload skips session.start and its timer: a request starts the backfill too.
      void backfill($)
      cached = null
      await writeMine($, nowAt)

      const at = new Date()
      const today = key(at)
      const hour = hourKey(at)
      const cutoff = key(addDays(at, -KEEP_DAYS))
      const hourCutoff = hourKey(addDays(at, -8))
      chain = chain.then(async () => {
        const stored = ((await $.store.get('daily')) as Daily | undefined) ?? {}
        const days = { ...(stored[model] ?? {}) }
        days[today] = (days[today] ?? 0) + fresh
        for (const d of Object.keys(days)) if (d < cutoff) delete days[d]
        const merged: Daily = { ...stored, [model]: days }
        await $.store.set('daily', merged)
        await update($, daily, () => merged)

        const storedH = ((await $.store.get('hourly')) as Hourly | undefined) ?? {}
        const hrs = { ...(storedH[model] ?? {}) }
        hrs[hour] = (hrs[hour] ?? 0) + fresh
        for (const h of Object.keys(hrs)) if (h < hourCutoff) delete hrs[h]
        const mergedH: Hourly = { ...storedH, [model]: hrs }
        await $.store.set('hourly', mergedH)
        await update($, hourly, () => mergedH)
      })
      await chain

      const all = await read($, rows)
      const sum = Object.values(all).reduce((n, t) => n + total(t), 0)
      $.ui.status(`${Object.keys(all).length} models · ${fmt(sum)} tok`)
    }

    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    try {
      return await draw($, e)
    } catch (err) {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text color="red">model-usage could not draw ({BUILD}):</Text>
          <Text>{err instanceof Error ? err.message : String(err)}</Text>
        </Box>
      )
    }
  })

  // Undocked: a one-line summary above the prompt, with a button to dock the pane again.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    if ((await read($, isPaneOpen)) || (await read($, isBandHidden))) return next(e)

    const history = await read($, daily)
    await read($, tick)
    let limits: Limit[] = []
    try {
      limits = [...(await $.session.usage()).rateLimits]
    } catch {
      // No reading: the window falls back to the last five hours.
    }
    const which = await read($, limitWindow)
    const session = (await loadWindow($, limits, Date.now(), which)).perModel
    const models = Array.from(new Set([...Object.keys(session), ...Object.keys(history)]))
    if (models.length === 0) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const costs = Object.fromEntries(models.map(m => [m, costOf(m, session[m])]))
    const costSum = Object.values(costs).reduce((n, v) => n + v, 0)
    const share = (m: string) => (costSum > 0 ? costs[m] / costSum : 0)
    const ranked = models.filter(m => share(m) > 0).sort((a, b) => share(b) - share(a))
    const todayKey = key(new Date())
    const todayTotal = models.reduce((n, m) => n + (history[m]?.[todayKey] ?? 0), 0)

    const shown = limits.find(l => l.kind === WINDOWS[which].kind)
    const limit = shown ? ` · ${WINDOWS[which].short} ${shown.percentUsed}%` : ''

    const width = 16
    const bar = ranked.map(m => {
      const n = Math.max(1, Math.round(share(m) * width))

      return <Text color={SCALES[family(m)][3]}>{'█'.repeat(n)}</Text>
    })
    const inner = await next(e)

    return (
      <Box flexDirection="column">
        {inner}
        <Box flexDirection="row" gap={1}>
          <Text bold>usage</Text>
          {ranked.length > 0 ? <Text>{bar}</Text> : <Text dimColor>no cost in the window yet</Text>}
          <Text dimColor wrap="truncate-end">
            {ranked.map(m => `${modelName(m).split(' ')[0].toLowerCase()} ${Math.round(share(m) * 100)}%`).join(' ')} · today {fmt(todayTotal)}
            {limit}
          </Text>
          <Button key="dock" label="Dock" plain onPress={() => void $.ui.open({ id: PANE, title: 'Usage by model' })} />
          <Button key="band-hide" label="✕" plain role="dismiss" onPress={() => update($, isBandHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
