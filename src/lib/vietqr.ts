export const NAPAS_GUID = 'A000000727'
export const SERVICE_ACCOUNT = 'QRIBFTTA'

export interface VietQRInput {
  bin: string
  account: string
  amount?: string
  content?: string
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), theo EMVCo. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const tlv = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value

/** Bỏ dấu tiếng Việt và ký tự lạ để mọi app ngân hàng đọc được nội dung. */
export function toTransferContent(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 .,\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)
}

export function validateVietQR(input: VietQRInput): string | null {
  if (!/^\d{6}$/.test(input.bin)) return 'Vui lòng chọn ngân hàng.'
  if (!input.account) return 'Nhập số tài khoản để tạo mã.'
  if (!/^\d{4,19}$/.test(input.account)) return 'Số tài khoản chỉ gồm 4–19 chữ số.'
  if (input.amount && !/^[1-9]\d{0,12}$/.test(input.amount)) return 'Số tiền không hợp lệ.'
  return null
}

export function buildVietQR(input: VietQRInput): string {
  const error = validateVietQR(input)
  if (error) throw new Error(error)
  const content = toTransferContent(input.content ?? '')
  const beneficiary = tlv('00', input.bin) + tlv('01', input.account)
  const body =
    tlv('00', '01') +
    tlv('01', input.amount ? '12' : '11') +
    tlv('38', tlv('00', NAPAS_GUID) + tlv('01', beneficiary) + tlv('02', SERVICE_ACCOUNT)) +
    tlv('53', '704') +
    (input.amount ? tlv('54', input.amount) : '') +
    tlv('58', 'VN') +
    (content ? tlv('62', tlv('08', content)) : '') +
    '6304'
  return body + crc16(body)
}

export function parseTLV(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  let i = 0
  while (i < text.length) {
    const id = text.slice(i, i + 2)
    const len = Number(text.slice(i + 2, i + 4))
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len) || i + 4 + len > text.length) {
      throw new Error('TLV không hợp lệ')
    }
    out[id] = text.slice(i + 4, i + 4 + len)
    i += 4 + len
  }
  return out
}

export interface ParsedVietQR {
  version: string
  method: string
  guid: string
  bin: string
  account: string
  service: string
  currency: string
  amount?: string
  country: string
  content?: string
  crc: string
  crcValid: boolean
}

export function parseVietQR(payload: string): ParsedVietQR {
  const top = parseTLV(payload)
  const merchant = parseTLV(top['38'] ?? '')
  const beneficiary = parseTLV(merchant['01'] ?? '')
  const extra = top['62'] ? parseTLV(top['62']) : {}
  return {
    version: top['00'],
    method: top['01'],
    guid: merchant['00'],
    bin: beneficiary['00'],
    account: beneficiary['01'],
    service: merchant['02'],
    currency: top['53'],
    amount: top['54'],
    country: top['58'],
    content: extra['08'],
    crc: top['63'],
    crcValid: payload.endsWith('6304' + top['63']) && crc16(payload.slice(0, -4)) === top['63'],
  }
}
