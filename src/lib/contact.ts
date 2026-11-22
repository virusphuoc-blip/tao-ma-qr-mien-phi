/** Mã QR liên hệ trên card visit: dựng từ chính các ô của card, hoàn toàn trên trình duyệt. */
export type ContactKind = 'pay' | 'zalo' | 'facebook' | 'call'
/** caption: các dòng chú thích in dưới mã trên card */
export const CONTACT_KINDS: { id: ContactKind; label: string; caption: string[]; need?: 'zalo' | 'facebook' | 'phone'; hint?: string }[] = [
  { id: 'pay', label: 'Chuyển tiền (VietQR)', caption: ['Quét để chuyển khoản'] },
  { id: 'zalo', label: 'Zalo', caption: ['Quét mã Zalo', 'để liên hệ'], need: 'zalo', hint: 'Điền ô Zalo ở trên để dùng mã Zalo.' },
  { id: 'facebook', label: 'Facebook', caption: ['Quét mã Facebook', 'để liên hệ'], need: 'facebook', hint: 'Điền ô Facebook ở trên để dùng mã Facebook.' },
  { id: 'call', label: 'Gọi điện', caption: ['Quét mã để gọi điện'], need: 'phone', hint: 'Điền ô Số điện thoại ở trên để dùng mã Gọi điện.' },
]
type Built = { payload: string; error?: undefined } | { payload?: undefined; error: string }

export function zaloLink(value: string): Built {
  const id = value.replace(/\s/g, '').replace(/^(https?:\/\/)?zalo\.me\//i, '')
  return /^[\w.+-]+$/.test(id) ? { payload: 'https://zalo.me/' + id } : { error: 'Zalo: nhập số điện thoại hoặc Zalo ID (chữ, số, không dấu).' }
}

const FB_HOST = /^(https?:\/\/)?((www|m|web|vi-vn)\.)?(facebook\.com|fb\.com|fb\.me|m\.me)\//i
export function facebookLink(value: string): Built {
  const v = value.replace(/\s/g, '')
  if (FB_HOST.test(v)) return { payload: 'https://' + v.replace(/^https?:\/\//i, '') }
  const user = v.replace(/^@/, '')
  return /^[A-Za-z0-9.]+$/.test(user) ? { payload: 'https://www.facebook.com/' + user } : { error: 'Facebook: nhập link facebook.com/… hoặc tên người dùng (chữ, số, dấu chấm).' }
}
/** dòng in trên card: bỏ https:// và www. cho gọn */
export function facebookText(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

/** 0xxxxxxxxx → tel:+84xxxxxxxxx; số đã có +/84 giữ mã nước; số ngắn không có số 0 đầu (tổng đài 1900…) giữ nguyên */
export function telLink(value: string): Built {
  const v = value.replace(/[\s.\-()]/g, '')
  if (!/^\+?\d{3,15}$/.test(v)) return { error: 'Số điện thoại chỉ gồm chữ số (có thể có dấu + ở đầu).' }
  if (v.startsWith('+')) return { payload: 'tel:' + v }
  if (v.startsWith('0')) return { payload: 'tel:+84' + v.slice(1) }
  if (v.startsWith('84') && v.length >= 11) return { payload: 'tel:+' + v }
  return { payload: 'tel:' + v }
}
