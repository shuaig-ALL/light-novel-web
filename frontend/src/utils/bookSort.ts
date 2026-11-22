import type { BookListItem } from '../api/books'

export type ShelfSortKey = 'recent_read' | 'recent_upload' | 'title' | 'custom'
export type SortDirection = 'asc' | 'desc'

export interface ShelfSortPrefs {
  sortBy: ShelfSortKey
  sortDir: SortDirection
}

export const SORT_PREFS_STORAGE_KEY = 'ln_shelf_sort_prefs'

export const DEFAULT_SORT_DIR_BY_KEY: Record<ShelfSortKey, SortDirection> = {
  recent_read: 'desc',
  recent_upload: 'desc',
  title: 'asc',
  custom: 'asc',
}

const VALID_SORT_KEYS: ReadonlySet<string> = new Set([
  'recent_read',
  'recent_upload',
  'title',
  'custom',
])

export function readSavedSortPrefs(): ShelfSortPrefs {
  try {
    const raw = localStorage.getItem(SORT_PREFS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ShelfSortPrefs>
      const sortBy: ShelfSortKey =
        typeof parsed.sortBy === 'string' && VALID_SORT_KEYS.has(parsed.sortBy)
          ? (parsed.sortBy as ShelfSortKey)
          : 'recent_read'
      const sortDir: SortDirection =
        sortBy === 'custom'
          ? 'asc'
          : parsed.sortDir === 'asc' || parsed.sortDir === 'desc'
            ? parsed.sortDir
            : DEFAULT_SORT_DIR_BY_KEY[sortBy]
      return { sortBy, sortDir }
    }
  } catch {
    // Ignore corrupted storage entries
  }
  return { sortBy: 'recent_read', sortDir: 'desc' }
}

export function saveSortPrefs(prefs: ShelfSortPrefs): void {
  try {
    localStorage.setItem(SORT_PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore storage quota / private mode failures
  }
}

function parseTimestamp(iso: string | null): number {
  if (!iso) return 0
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : 0
}

const CHINESE_DIGIT_MAP: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

const PART_ORDINAL_MAP: Record<string, number> = {
  上: 1,
  中: 2,
  下: 3,
}

/**
 * Parse Chinese numerals (零/〇, 一~九十九, up to 九百九十九) into integers.
 */
export function parseChineseNumber(raw: string): number | null {
  const str = raw.trim()
  if (!str) {
    return null
  }

  if (str.length === 1) {
    if (str === '十') return 10
    if (str === '百') return 100
    return str in CHINESE_DIGIT_MAP ? CHINESE_DIGIT_MAP[str] : null
  }

  // Handle positional digits without unit characters (e.g. 一零 -> 10)
  if (!str.includes('十') && !str.includes('百')) {
    let acc = 0
    for (const ch of str) {
      if (!(ch in CHINESE_DIGIT_MAP)) {
        return null
      }
      acc = acc * 10 + CHINESE_DIGIT_MAP[ch]
    }
    return acc
  }

  let total = 0
  let currentDigit: number | null = null

  for (const ch of str) {
    if (ch in CHINESE_DIGIT_MAP) {
      const digit = CHINESE_DIGIT_MAP[ch]
      if (digit === 0) {
        currentDigit = null
      } else {
        currentDigit = digit
      }
    } else if (ch === '百') {
      total += (currentDigit ?? 1) * 100
      currentDigit = null
    } else if (ch === '十') {
      total += (currentDigit ?? 1) * 10
      currentDigit = null
    } else {
      return null
    }
  }

  if (currentDigit !== null) {
    total += currentDigit
  }
  return total
}

function normalizeFullWidth(input: string): string {
  return input
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/[\u3000\u00a0]+/g, ' ')
}

type NaturalToken =
  | { kind: 'num'; value: number }
  | { kind: 'text'; value: string }

/**
 * Convert a light novel title into natural comparison tokens:
 * - Converts Chinese numerals (一~九十九+) in volume/part/standalone positions to numbers
 * - Converts 上/中/下 volume/part markers to 1/2/3 without corrupting normal CJK words (e.g. 地下城, 中二病, 至上)
 * - Tokenizes Arabic integers & decimals (e.g. 5.5, 10) numerically
 */
function tokenizeLightNovelTitle(title: string): NaturalToken[] {
  let normalized = normalizeFullWidth(title).trim()

  // 1. Explicit "第X卷/册/集/部/话/章/回/篇/期/季" or "第X"
  normalized = normalized.replace(
    /第\s*([零〇一二三四五六七八九两十百]+)\s*([卷册集部话章回篇期季])?/g,
    (full, numStr: string, unit?: string) => {
      const n = parseChineseNumber(numStr)
      return n !== null ? `第${n}${unit ?? ''}` : full
    },
  )

  // 2. Prefix volume marker "卷十" / "册二" / "Vol.三"
  normalized = normalized.replace(
    /(卷|册|集|部|篇|Vol\.?|Volume)\s*([零〇一二三四五六七八九两十百]+)/gi,
    (full, prefix: string, numStr: string) => {
      const n = parseChineseNumber(numStr)
      return n !== null ? `${prefix}${n}` : full
    },
  )

  // 3. Suffix volume marker "十卷" / "十二册"
  normalized = normalized.replace(
    /([零〇一二三四五六七八九两十百]+)\s*(卷|册|集|部|话|章|回|篇|期|季)/g,
    (full, numStr: string, unit: string) => {
      const n = parseChineseNumber(numStr)
      return n !== null ? `${n}${unit}` : full
    },
  )

  // 4. Standalone Chinese numeral surrounded by separators/brackets/string boundaries (e.g. "无职转生 十", "某书 (十二)")
  normalized = normalized.replace(
    /(^|[\s\-_·・:：/（([【《「『])([零〇一二三四五六七八九两十百]+)(?=$|[\s\-_·・:：/）)\]】》」』])/g,
    (full, lead: string, numStr: string) => {
      const n = parseChineseNumber(numStr)
      return n !== null ? `${lead}${n}` : full
    },
  )

  // 5. 上/中/下 with volume unit: "上卷" / "中册" / "下篇"
  normalized = normalized.replace(
    /([上中下])\s*(卷|册|集|部|篇)/g,
    (_full, part: string, unit: string) => `${PART_ORDINAL_MAP[part]}${unit}`,
  )

  // 6. Volume unit followed by 上/中/下: "第十卷上" / "卷下"
  normalized = normalized.replace(
    /(卷|册|集|部|篇)\s*([上中下])(?=$|[\s\-_·・:：/）)\]】》」』])/g,
    (_full, unit: string, part: string) => `${unit} ${PART_ORDINAL_MAP[part]}`,
  )

  // 7. Standalone 上/中/下 in brackets, after separator, or after digits (e.g. "第10卷 上", "某书(下)", "某书 10下")
  normalized = normalized.replace(
    /(^|[\s\-_·・:：/（([【《「『\d])([上中下])(?=$|[\s\-_·・:：/）)\]】》」』])/g,
    (_full, lead: string, part: string) => `${lead}${PART_ORDINAL_MAP[part]}`,
  )

  const tokens: NaturalToken[] = []
  const parts = normalized.split(/(\d+(?:\.\d+)?)/)
  for (const part of parts) {
    const trimmed = part.trim().replace(/\s+/g, ' ')
    if (!trimmed) {
      continue
    }
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      tokens.push({ kind: 'num', value: Number(trimmed) })
    } else {
      tokens.push({ kind: 'text', value: trimmed })
    }
  }
  return tokens
}

export function compareLightNovelTitles(titleA: string, titleB: string): number {
  const tokensA = tokenizeLightNovelTitle(titleA)
  const tokensB = tokenizeLightNovelTitle(titleB)
  const minLen = Math.min(tokensA.length, tokensB.length)

  for (let i = 0; i < minLen; i += 1) {
    const a = tokensA[i]
    const b = tokensB[i]

    if (a.kind === 'num' && b.kind === 'num') {
      if (a.value !== b.value) {
        return a.value - b.value
      }
      continue
    }

    if (a.kind === 'text' && b.kind === 'text') {
      const cmp = a.value.localeCompare(b.value, 'zh-CN', { sensitivity: 'base' })
      if (cmp !== 0) {
        return cmp
      }
      continue
    }

    // Compare text vs numeric token deterministically
    const cmp = String(a.value).localeCompare(String(b.value), 'zh-CN', {
      sensitivity: 'base',
    })
    if (cmp !== 0) {
      return cmp
    }
  }

  if (tokensA.length !== tokensB.length) {
    return tokensA.length - tokensB.length
  }

  return titleA.localeCompare(titleB, 'zh-CN')
}

export function compareBooksCustomOrder(a: BookListItem, b: BookListItem): number {
  const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
  if (orderDiff !== 0) {
    return orderDiff
  }
  const createdDiff = parseTimestamp(b.created_at) - parseTimestamp(a.created_at)
  return createdDiff !== 0 ? createdDiff : b.id - a.id
}

export function sortBooks(
  books: BookListItem[],
  sortBy: ShelfSortKey,
  sortDir: SortDirection,
): BookListItem[] {
  const dirFactor = sortDir === 'asc' ? 1 : -1

  return [...books].sort((a, b) => {
    if (sortBy === 'custom') {
      return compareBooksCustomOrder(a, b)
    }

    if (sortBy === 'title') {
      const cmp = compareLightNovelTitles(a.title, b.title)
      return cmp !== 0 ? cmp * dirFactor : (a.id - b.id) * dirFactor
    }

    if (sortBy === 'recent_upload') {
      const diff = parseTimestamp(a.created_at) - parseTimestamp(b.created_at)
      if (diff !== 0) {
        return diff * dirFactor
      }
      return (a.id - b.id) * dirFactor
    }

    // recent_read: compare last_read_at, falling back to created_at
    const readA = parseTimestamp(a.last_read_at)
    const readB = parseTimestamp(b.last_read_at)
    if (readA !== readB) {
      return (readA - readB) * dirFactor
    }
    const createdDiff = parseTimestamp(a.created_at) - parseTimestamp(b.created_at)
    if (createdDiff !== 0) {
      return createdDiff * dirFactor
    }
    return (a.id - b.id) * dirFactor
  })
}
