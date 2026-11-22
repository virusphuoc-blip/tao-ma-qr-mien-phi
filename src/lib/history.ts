import type { Template } from './card'
import type { FormData, QRType } from './payloads'
import type { QRStyle } from './render'

export interface HistoryItem {
  id: string
  time: number
  type: QRType
  label: string
  form: FormData
  style: QRStyle
  card?: { template: Template; styleBin: string }
}

const KEY = 'tmqr.history.v1'
const MAX = 20
const MAX_LOGO_CHARS = 150_000

export function loadHistory(): HistoryItem[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function addHistory(list: HistoryItem[], item: Omit<HistoryItem, 'id' | 'time'>): HistoryItem[] {
  const style = { ...item.style }
  if (style.logo === 'custom' && (style.customLogo?.length ?? 0) > MAX_LOGO_CHARS) {
    style.logo = 'none'
    delete style.customLogo
  }
  const same = (h: HistoryItem) => h.type === item.type && JSON.stringify(h.form) === JSON.stringify(item.form)
  const next = [
    { ...item, style, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), time: Date.now() },
    ...list.filter((h) => !same(h)),
  ].slice(0, MAX)
  saveHistory(next)
  return next
}

export function saveHistory(list: HistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.map((h) => ({ ...h, style: { ...h.style, logo: 'none', customLogo: undefined } }))))
    } catch {
      /* hết dung lượng lưu trữ: bỏ qua */
    }
  }
}

export function clearHistory() {
  localStorage.removeItem(KEY)
}
