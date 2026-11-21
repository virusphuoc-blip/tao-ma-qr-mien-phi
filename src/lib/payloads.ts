import { buildVietQR, validateVietQR } from './vietqr'

export type QRType = 'vietqr' | 'url' | 'text' | 'wifi' | 'phone' | 'sms' | 'email' | 'vcard' | 'zalo'
export type FormData = Record<string, string>

export interface Field {
  key: string
  label: string
  placeholder?: string
  kind?: 'text' | 'textarea' | 'tel' | 'email' | 'url' | 'select'
  options?: { value: string; label: string }[]
}

export interface TypeDef {
  type: QRType
  label: string
  icon: string
  fields: Field[]
  defaults: FormData
}

export const TYPES: TypeDef[] = [
  {
    type: 'vietqr',
    label: 'Chuyển khoản',
    icon: '🏦',
    fields: [],
    defaults: { bin: '970449', account: '', name: '', amount: '', content: '' },
  },
  {
    type: 'url',
    label: 'Website',
    icon: '🔗',
    fields: [{ key: 'url', label: 'Địa chỉ website', placeholder: 'https://example.com', kind: 'url' }],
    defaults: { url: '' },
  },
  {
    type: 'text',
    label: 'Văn bản',
    icon: '📝',
    fields: [{ key: 'text', label: 'Nội dung', placeholder: 'Nhập văn bản bất kỳ…', kind: 'textarea' }],
    defaults: { text: '' },
  },
  {
    type: 'wifi',
    label: 'WiFi',
    icon: '📶',
    fields: [
      { key: 'ssid', label: 'Tên WiFi (SSID)', placeholder: 'Tên mạng WiFi' },
      { key: 'password', label: 'Mật khẩu', placeholder: 'Mật khẩu WiFi' },
      {
        key: 'enc',
        label: 'Bảo mật',
        kind: 'select',
        options: [
          { value: 'WPA', label: 'WPA/WPA2/WPA3' },
          { value: 'WEP', label: 'WEP' },
          { value: 'nopass', label: 'Không mật khẩu' },
        ],
      },
    ],
    defaults: { ssid: '', password: '', enc: 'WPA' },
  },
  {
    type: 'phone',
    label: 'Gọi điện',
    icon: '📞',
    fields: [{ key: 'phone', label: 'Số điện thoại', placeholder: '0912345678', kind: 'tel' }],
    defaults: { phone: '' },
  },
  {
    type: 'sms',
    label: 'SMS',
    icon: '💬',
    fields: [
      { key: 'phone', label: 'Số điện thoại', placeholder: '0912345678', kind: 'tel' },
      { key: 'message', label: 'Tin nhắn', placeholder: 'Nội dung tin nhắn', kind: 'textarea' },
    ],
    defaults: { phone: '', message: '' },
  },
  {
    type: 'email',
    label: 'Email',
    icon: '✉️',
    fields: [
      { key: 'to', label: 'Địa chỉ email', placeholder: 'ten@example.com', kind: 'email' },
      { key: 'subject', label: 'Tiêu đề', placeholder: 'Tiêu đề thư' },
      { key: 'body', label: 'Nội dung', placeholder: 'Nội dung thư', kind: 'textarea' },
    ],
    defaults: { to: '', subject: '', body: '' },
  },
  {
    type: 'vcard',
    label: 'Danh thiếp',
    icon: '👤',
    fields: [
      { key: 'name', label: 'Họ và tên', placeholder: 'Nguyễn Văn A' },
      { key: 'phone', label: 'Số điện thoại', placeholder: '0912345678', kind: 'tel' },
      { key: 'email', label: 'Email', placeholder: 'ten@example.com', kind: 'email' },
      { key: 'org', label: 'Công ty', placeholder: 'Tên công ty' },
      { key: 'title', label: 'Chức danh', placeholder: 'Chức danh' },
      { key: 'address', label: 'Địa chỉ', placeholder: 'Địa chỉ' },
      { key: 'website', label: 'Website', placeholder: 'https://example.com', kind: 'url' },
    ],
    defaults: { name: '', phone: '', email: '', org: '', title: '', address: '', website: '' },
  },
  {
    type: 'zalo',
    label: 'Zalo',
    icon: '💙',
    fields: [{ key: 'id', label: 'Số điện thoại hoặc Zalo ID', placeholder: '0912345678' }],
    defaults: { id: '' },
  },
]

export const typeDef = (type: QRType) => TYPES.find((t) => t.type === type)!

const phone = (s: string) => s.replace(/[^\d+*#]/g, '')
const wifiEsc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1')
const vcardEsc = (s: string) => s.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n')

export type Built = { payload: string; error?: undefined } | { payload?: undefined; error: string }

export function buildPayload(type: QRType, raw: FormData): Built {
  const d: FormData = {}
  for (const [k, v] of Object.entries(raw)) d[k] = v.trim()
  switch (type) {
    case 'vietqr': {
      const input = { bin: d.bin, account: d.account, amount: d.amount, content: d.content }
      const error = validateVietQR(input)
      return error ? { error } : { payload: buildVietQR(input) }
    }
    case 'url': {
      if (!d.url) return { error: 'Nhập địa chỉ website.' }
      const url = /^[a-z][a-z0-9+.-]*:/i.test(d.url) ? d.url : 'https://' + d.url
      return { payload: url }
    }
    case 'text':
      return raw.text ? { payload: raw.text } : { error: 'Nhập nội dung văn bản.' }
    case 'wifi': {
      if (!d.ssid) return { error: 'Nhập tên WiFi.' }
      if (d.enc !== 'nopass' && !raw.password) return { error: 'Nhập mật khẩu WiFi.' }
      const pass = d.enc === 'nopass' ? '' : `P:${wifiEsc(raw.password)};`
      return { payload: `WIFI:T:${d.enc};S:${wifiEsc(d.ssid)};${pass};` }
    }
    case 'phone':
      return phone(d.phone) ? { payload: 'tel:' + phone(d.phone) } : { error: 'Nhập số điện thoại.' }
    case 'sms':
      return phone(d.phone)
        ? { payload: `SMSTO:${phone(d.phone)}:${d.message}` }
        : { error: 'Nhập số điện thoại.' }
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.to)) return { error: 'Nhập địa chỉ email hợp lệ.' }
      const q = [
        d.subject && 'subject=' + encodeURIComponent(d.subject),
        d.body && 'body=' + encodeURIComponent(d.body),
      ].filter(Boolean)
      return { payload: `mailto:${d.to}${q.length ? '?' + q.join('&') : ''}` }
    }
    case 'vcard': {
      if (!d.name) return { error: 'Nhập họ và tên.' }
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${vcardEsc(d.name)};;;;`,
        `FN:${vcardEsc(d.name)}`,
        d.org && `ORG:${vcardEsc(d.org)}`,
        d.title && `TITLE:${vcardEsc(d.title)}`,
        phone(d.phone) && `TEL;TYPE=CELL:${phone(d.phone)}`,
        d.email && `EMAIL:${d.email}`,
        d.address && `ADR:;;${vcardEsc(d.address)};;;;`,
        d.website && `URL:${d.website}`,
        'END:VCARD',
      ].filter(Boolean)
      return { payload: lines.join('\n') }
    }
    case 'zalo': {
      const id = d.id.replace(/^https?:\/\/zalo\.me\//i, '').replace(/[\s.]/g, '')
      if (!/^[A-Za-z0-9_+-]+$/.test(id)) return { error: 'Nhập số điện thoại hoặc Zalo ID.' }
      return { payload: 'https://zalo.me/' + id }
    }
  }
}
