import { Resvg } from '@resvg/resvg-js'
import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { BANKS } from '../src/lib/banks'
import { buildPayload, TYPES, type FormData, type QRType } from '../src/lib/payloads'
import { buildModel, DEFAULT_STYLE, scanWarnings, toSVG, type QRStyle } from '../src/lib/render'
import { buildVietQR, crc16, parseVietQR, toTransferContent } from '../src/lib/vietqr'

function decode(text: string, style: Partial<QRStyle> = {}): string | undefined {
  const s = { ...DEFAULT_STYLE, ...style }
  const img = new Resvg(toSVG(buildModel(text, s), s, undefined, 600)).render()
  return jsQR(new Uint8ClampedArray(img.pixels), img.width, img.height)?.data
}

describe('VietQR', () => {
  it('CRC-16/CCITT-FALSE khớp vector chuẩn', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  it('tạo đúng từng trường cho tài khoản LPBank có số tiền và nội dung', () => {
    const payload = buildVietQR({ bin: '970449', account: '0123456789', amount: '50000', content: 'Tiền ăn trưa' })
    expect(payload).toBe(
      '00020101021238540010A00000072701240006970449011001234567890208QRIBFTTA' +
        '530370454055000058' + '02VN' + '62160812Tien an trua' + '6304' + crc16(payload.slice(0, -4)),
    )
    expect(parseVietQR(payload)).toEqual({
      version: '01',
      method: '12',
      guid: 'A000000727',
      bin: '970449',
      account: '0123456789',
      service: 'QRIBFTTA',
      currency: '704',
      amount: '50000',
      country: 'VN',
      content: 'Tien an trua',
      crc: payload.slice(-4),
      crcValid: true,
    })
  })

  it('mã không số tiền là mã tĩnh (11), không có trường 54 và 62', () => {
    const p = parseVietQR(buildVietQR({ bin: '970449', account: '0123456789' }))
    expect(p.method).toBe('11')
    expect(p.amount).toBeUndefined()
    expect(p.content).toBeUndefined()
    expect(p.crcValid).toBe(true)
  })

  it('phát hiện CRC sai', () => {
    const payload = buildVietQR({ bin: '970449', account: '0123456789' })
    expect(parseVietQR(payload.replace('0123456789', '0123456780')).crcValid).toBe(false)
  })

  it('từ chối số tài khoản và số tiền không hợp lệ', () => {
    expect(() => buildVietQR({ bin: '970449', account: '12ab' })).toThrow()
    expect(() => buildVietQR({ bin: '970449', account: '0123456789', amount: '0' })).toThrow()
    expect(() => buildVietQR({ bin: '97044', account: '0123456789' })).toThrow()
  })

  it('bỏ dấu nội dung tiếng Việt', () => {
    expect(toTransferContent('Đóng học phí tháng 11 – Nguyễn Thị Ánh')).toBe('Dong hoc phi thang 11 Nguyen Thi Anh')
  })

  it('quét lại ảnh QR ra đúng payload, kể cả bo tròn và màu nâu', () => {
    const payload = buildVietQR({ bin: '970449', account: '0123456789', amount: '1000000', content: 'Test' })
    expect(decode(payload)).toBe(payload)
    expect(decode(payload, { rounded: true, fg: '#6D371A', ec: 'H' })).toBe(payload)
  })
})

describe('Danh sách ngân hàng', () => {
  it('BIN duy nhất, 6 chữ số, LPBank đứng đầu', () => {
    expect(new Set(BANKS.map((b) => b.bin)).size).toBe(BANKS.length)
    expect(BANKS.every((b) => /^\d{6}$/.test(b.bin))).toBe(true)
    expect(BANKS[0]).toMatchObject({ bin: '970449', shortName: 'LPBank' })
    expect(BANKS.length).toBeGreaterThanOrEqual(60)
  })

  it('BIN các ngân hàng lớn khớp danh sách vietqr.io', () => {
    const expected: Record<string, string> = {
      LPB: '970449', VCB: '970436', ICB: '970415', BIDV: '970418', VBA: '970405', TCB: '970407',
      MB: '970422', ACB: '970416', VPB: '970432', TPB: '970423', STB: '970403', HDB: '970437',
      VIB: '970441', SHB: '970443', EIB: '970431', MSB: '970426', OCB: '970448', SEAB: '970440', BAB: '970409',
    }
    for (const [code, bin] of Object.entries(expected)) {
      expect(BANKS.find((b) => b.code === code)?.bin, code).toBe(bin)
    }
  })
})

describe('9 loại mã QR', () => {
  const cases: [QRType, FormData, string][] = [
    ['vietqr', { bin: '970449', account: '0123456789', name: 'NGUYEN VAN A', amount: '', content: '' }, buildVietQR({ bin: '970449', account: '0123456789' })],
    ['url', { url: 'lpbank.com.vn' }, 'https://lpbank.com.vn'],
    ['text', { text: 'Xin chào Việt Nam!' }, 'Xin chào Việt Nam!'],
    ['wifi', { ssid: 'Nhà Tôi;5G', password: 'p@ss:word', enc: 'WPA' }, 'WIFI:T:WPA;S:Nhà Tôi\\;5G;P:p@ss\\:word;;'],
    ['phone', { phone: '0912 345 678' }, 'tel:0912345678'],
    ['sms', { phone: '0912345678', message: 'Chào bạn' }, 'SMSTO:0912345678:Chào bạn'],
    ['email', { to: 'a@example.com', subject: 'Chào', body: 'Nội dung' }, 'mailto:a@example.com?subject=Ch%C3%A0o&body=N%E1%BB%99i%20dung'],
    ['vcard', { name: 'Nguyễn Văn A', phone: '0912345678', email: 'a@example.com', org: 'ACME', title: '', address: '', website: '' },
      'BEGIN:VCARD\nVERSION:3.0\nN:Nguyễn Văn A;;;;\nFN:Nguyễn Văn A\nORG:ACME\nTEL;TYPE=CELL:0912345678\nEMAIL:a@example.com\nEND:VCARD'],
    ['zalo', { id: '0912 345 678' }, 'https://zalo.me/0912345678'],
  ]

  it('có đủ 9 loại', () => {
    expect(TYPES.map((t) => t.type).sort()).toEqual(cases.map((c) => c[0]).sort())
  })

  it.each(cases)('%s: payload đúng và quét lại được', (type, form, expected) => {
    const built = buildPayload(type, form)
    expect(built.payload).toBe(expected)
    expect(decode(expected)).toBe(expected)
  })

  it('WiFi không mật khẩu', () => {
    expect(buildPayload('wifi', { ssid: 'Cafe', password: '', enc: 'nopass' }).payload).toBe('WIFI:T:nopass;S:Cafe;;')
  })

  it('báo lỗi khi thiếu dữ liệu bắt buộc', () => {
    for (const t of TYPES) expect(buildPayload(t.type, t.defaults).error, t.type).toBeTruthy()
  })
})

describe('Cảnh báo khó quét', () => {
  it('nền tối, tương phản thấp, mã dày', () => {
    expect(scanWarnings(null, DEFAULT_STYLE)).toEqual([])
    expect(scanWarnings(null, { ...DEFAULT_STYLE, bg: '#222222' }).length).toBeGreaterThan(0)
    expect(scanWarnings(null, { ...DEFAULT_STYLE, fg: '#DDDDDD' }).length).toBeGreaterThan(0)
    const dense = buildModel('x'.repeat(900), DEFAULT_STYLE)
    expect(scanWarnings(dense, DEFAULT_STYLE).join(' ')).toContain('dày')
  })

  it('logo khoét vùng giữa nhưng mã mức H vẫn quét được', () => {
    const payload = buildVietQR({ bin: '970449', account: '0123456789', amount: '50000', content: 'Test' })
    const style = { ...DEFAULT_STYLE, ec: 'H' as const }
    const model = buildModel(payload, style, { src: '', width: 216, height: 55 })
    expect(model.logoBox).toBeDefined()
    const img = new Resvg(toSVG(model, style, undefined, 600)).render()
    expect(jsQR(new Uint8ClampedArray(img.pixels), img.width, img.height)?.data).toBe(payload)
  })
})
