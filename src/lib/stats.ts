/** Thống kê chỉ lưu trong localStorage của máy này, không gửi đi đâu. */
export interface Stats {
  created: number
  byBank: Record<string, number>
  byType: Record<string, number>
  downloads: number
  cards: number
  /** mã băm của các mã / card đã đếm, để không đếm trùng */
  seen: string[]
  seenCards: string[]
}

const KEY = 'tmqr.stats.v1'
const MAX_SEEN = 500
const EMPTY: Stats = { created: 0, byBank: {}, byType: {}, downloads: 0, cards: 0, seen: [], seenCards: [] }

function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

export function loadStats(): Stats {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v === 'object' ? { ...EMPTY, ...v } : { ...EMPTY }
  } catch {
    return { ...EMPTY }
  }
}

function update(fn: (s: Stats) => void) {
  const s = loadStats()
  fn(s)
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* hết dung lượng lưu trữ: bỏ qua */
  }
}

/** Đếm một mã QR là "đã tạo" ở lần đầu nó được tải, sao chép, chia sẻ hoặc gắn lên card visit. */
export function countQR(type: string, payload: string, bin?: string) {
  update((s) => {
    const h = hash(type + '|' + payload)
    if (s.seen.includes(h)) return
    s.seen = [h, ...s.seen].slice(0, MAX_SEEN)
    s.created++
    s.byType[type] = (s.byType[type] ?? 0) + 1
    if (bin) s.byBank[bin] = (s.byBank[bin] ?? 0) + 1
  })
}

export function countDownload() {
  update((s) => {
    s.downloads++
  })
}

export function countCard(content: string) {
  update((s) => {
    const h = hash(content)
    if (s.seenCards.includes(h)) return
    s.seenCards = [h, ...s.seenCards].slice(0, MAX_SEEN)
    s.cards++
  })
}

export function clearStats() {
  localStorage.removeItem(KEY)
}
