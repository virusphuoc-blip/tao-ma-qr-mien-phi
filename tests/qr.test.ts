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

describe('v1.1: phong cách ngân hàng + thẻ QR', async () => {
  const { BANK_STYLES, styleOf, NEUTRAL } = await import('../src/lib/styles')
  const { cardSVG, layoutCard, staffLines, TEMPLATES } = await import('../src/lib/card')
  const { APP_VERSION } = await import('../src/version')
  const { readFileSync } = await import('node:fs')

  it('mọi ngân hàng trong danh sách đều có phong cách; 18 ngân hàng chính có màu + logo đã xác minh', () => {
    expect(BANK_STYLES).toHaveLength(BANKS.length)
    expect(styleOf('970449')).toMatchObject({ primary: '#6D371A', accent: '#F99D1C', verified: true })
    expect(styleOf('970403')).toMatchObject({ primary: '#0065A4', accent: '#F3B643', source: 'www.sacombank.com.vn' })
    for (const code of ['VCB', 'ICB', 'BIDV', 'VBA', 'TCB', 'MB', 'ACB', 'VPB', 'TPB', 'STB', 'HDB', 'VIB', 'SHB', 'EIB', 'MSB', 'OCB', 'SEAB', 'LPB']) {
      const s = BANK_STYLES.find((b) => b.code === code)!
      expect(s.verified, code).toBe(true)
      expect(s.logo?.src, code).toBeTruthy()
    }
    for (const s of BANK_STYLES.filter((b) => !b.verified)) expect({ primary: s.primary, accent: s.accent, logo: s.logo }).toEqual({ ...NEUTRAL, logo: undefined })
  })

  it('dòng cán bộ: bỏ trường trống, không có trường nào thì không có dòng nào', () => {
    expect(staffLines({ branch: 'CN Sài Gòn', name: 'Trần Thị B', phone: '0901234567' })).toEqual(['NV hỗ trợ: Trần Thị B — CN Sài Gòn — 0901234567'])
    expect(staffLines({ branch: '', name: 'Trần Thị B', phone: '' })).toEqual(['NV hỗ trợ: Trần Thị B'])
    expect(staffLines({ branch: 'CN Sài Gòn', name: '', phone: ' 0901234567 ' })).toEqual(['NV hỗ trợ: CN Sài Gòn — 0901234567'])
    expect(staffLines({ branch: ' ', name: '', phone: '' })).toEqual([])
    expect(staffLines({ branch: 'Chi nhánh Thành phố Hồ Chí Minh – PGD Bến Thành', name: 'Nguyễn Hoàng Thị Phương Thảo', phone: '0901234567' }, 860, 26)).toHaveLength(2)
  })

  it('cả 13 mẫu thẻ xuất SVG quét lại đúng payload, có hay không có thông tin cán bộ', () => {
    const payload = buildVietQR({ bin: '970403', account: '0123456789', amount: '100000', content: 'Tien an trua' })
    const model = buildModel(payload, DEFAULT_STYLE)
    const brand = { name: 'Sacombank', primary: '#0065A4', accent: '#F3B643' }
    for (const { id } of TEMPLATES.filter((t) => t.id !== 'plain')) {
      for (const staff of [{ branch: 'CN Sài Gòn', name: 'Trần Thị B', phone: '0901234567' }, { branch: '', name: '', phone: '' }]) {
        const svg = cardSVG(layoutCard({ template: id, brand, account: '0123456789', subtitle: 'Sacombank · 0123456789', staff }), model, DEFAULT_STYLE, undefined, 800)
        const img = new Resvg(svg).render()
        expect(jsQR(new Uint8ClampedArray(img.pixels), img.width, img.height)?.data, id).toBe(payload)
        // mẫu Tết chừa chỗ cho đồng tiền ở hai góc nên dòng dài tách làm hai
        if (id !== 'tet') expect(svg.includes('>NV hỗ trợ: Trần Thị B — CN Sài Gòn — 0901234567</text>'), id).toBe(!!staff.name)
        expect(svg.includes('NV hỗ trợ'), id).toBe(!!staff.name)
        const sizes = (re: RegExp) => [...svg.matchAll(re)].map((m) => Number(m[1]))
        const bodySize = Math.max(...sizes(id === 'tree' || id === 'treeA6' ? /font-size="(\d+)"[^>]*>0123456789</g : /font-size="(\d+)"[^>]*>Sacombank · 0123456789</g))
        if (staff.name) {
          const ratio = sizes(/font-size="(\d+)"[^>]*>NV hỗ trợ/g)[0] / bodySize
          expect(ratio, id).toBeGreaterThanOrEqual(0.6)
          expect(ratio, id).toBeLessThanOrEqual(0.7)
        }
        expect(svg).not.toMatch(/null|undefined|NaN/)
      }
    }
  })

  it('v1.2: có đủ 13 mẫu thẻ + "Chỉ mã QR"; Cây Vàng vẽ bằng path, khẩu hiệu chỉ khi được truyền vào', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['standard', 'bank', 'minimal', 'business', 'tree', 'treeA6', 'luxury', 'gradient', 'tet', 'nature', 'ocean', 'royal', 'midautumn', 'plain'])
    const model = buildModel('x', DEFAULT_STYLE)
    const staff = { branch: '', name: '', phone: '' }
    const tree = (tagline?: string) =>
      cardSVG(layoutCard({ template: 'tree', brand: { name: 'Sacombank', primary: '#0065A4', accent: '#F3B643', tagline }, account: '0123456789', title: 'NGUYEN VAN A', staff }), model, DEFAULT_STYLE, undefined, 800)
    const lp = tree('NGÂN HÀNG LỘC PHÁT VIỆT NAM')
    expect(lp).toContain('>NGÂN HÀNG LỘC PHÁT VIỆT NAM</text>')
    expect(lp).not.toContain('>Sacombank</text>')
    expect(tree()).toContain('>Sacombank</text>')
    expect(tree()).not.toContain('LỘC PHÁT')
    expect((lp.match(/<path /g) ?? []).length).toBeGreaterThan(80)
    expect(lp).not.toContain('<image')
  })

  it('v1.2: card visit 3.5:2, mã quét được, ô trống không in', async () => {
    const { layoutBizCard, BIZ_TEMPLATES, EMPTY_BIZ } = await import('../src/lib/card')
    const payload = buildVietQR({ bin: '970449', account: '0123456789' })
    const model = buildModel(payload, DEFAULT_STYLE)
    for (const { id } of BIZ_TEMPLATES) {
      const card = layoutBizCard(id, { ...EMPTY_BIZ, name: 'Võ Hoàng Phước', phone: '0988474228' }, ['Quét mã Facebook', 'để liên hệ'])
      expect(card.w / card.h).toBe(3.5 / 2)
      const svg = cardSVG(card, model, DEFAULT_STYLE, undefined, 2100)
      const img = new Resvg(svg).render()
      expect([img.width, img.height]).toEqual([2100, 1200])
      expect(jsQR(new Uint8ClampedArray(img.pixels), img.width, img.height)?.data, id).toBe(payload)
      expect(svg).toContain('>Võ Hoàng Phước</text>')
      expect(svg).toContain('>ĐT: 0988474228</text>')
      expect(svg).toContain('>Quét mã Facebook</text>')
      expect(svg).toContain('>để liên hệ</text>')
      expect(svg).not.toMatch(/Chi nhánh|Zalo|Email|Facebook:|null|undefined|NaN/)
      const noQR = cardSVG(layoutBizCard(id, { ...EMPTY_BIZ, name: 'A' }, undefined), model, DEFAULT_STYLE, undefined, 1050)
      expect(noQR).not.toContain('chuyển khoản')
    }
    expect(BIZ_TEMPLATES.map((t) => t.label)).toEqual(['LPBank', 'Vàng Sang Trọng', 'Xanh Dương Doanh Nhân', 'Hồng Sen Nhẹ Nhàng', 'Xanh Ngọc Lục Bảo', 'Xám Bạc Tối Giản'])
  })

  it('v1.4: mã liên hệ trên card visit (Zalo, Facebook, gọi điện)', async () => {
    const { zaloLink, facebookLink, facebookText, telLink } = await import('../src/lib/contact')
    expect(zaloLink(' 0988 474 228 ').payload).toBe('https://zalo.me/0988474228')
    expect(zaloLink('https://zalo.me/vhphuoc').payload).toBe('https://zalo.me/vhphuoc')
    expect(zaloLink('tên có dấu').error).toBeTruthy()
    expect(facebookLink('vh.phuoc').payload).toBe('https://www.facebook.com/vh.phuoc')
    expect(facebookLink('@vh.phuoc').payload).toBe('https://www.facebook.com/vh.phuoc')
    expect(facebookLink('facebook.com/vh.phuoc').payload).toBe('https://facebook.com/vh.phuoc')
    expect(facebookLink('https://www.facebook.com/profile.php?id=100012345').payload).toBe('https://www.facebook.com/profile.php?id=100012345')
    expect(facebookLink('http://m.facebook.com/vh.phuoc').payload).toBe('https://m.facebook.com/vh.phuoc')
    expect(facebookLink('https://example.com/x').error).toBeTruthy()
    expect(facebookText('https://www.facebook.com/vh.phuoc/')).toBe('facebook.com/vh.phuoc')
    expect(telLink('0988474228').payload).toBe('tel:+84988474228')
    expect(telLink('0988.474 228').payload).toBe('tel:+84988474228')
    expect(telLink('+84 988 474 228').payload).toBe('tel:+84988474228')
    expect(telLink('84988474228').payload).toBe('tel:+84988474228')
    expect(telLink('19001234').payload).toBe('tel:19001234')
    expect(telLink('abc').error).toBeTruthy()
  })

  it('v1.4: nhận diện trình duyệt trong ứng dụng', async () => {
    const { isInAppBrowser } = await import('../src/lib/inapp')
    const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
    expect(isInAppBrowser(chrome)).toBeNull()
    expect(isInAppBrowser(chrome + ' Zalo android/24100751')).toBe('Zalo')
    expect(isInAppBrowser(chrome + ' [FB_IAB/FB4A;FBAV/480.0.0.54.88;]')).toBe('Facebook')
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/480.0]')).toBe('Facebook')
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/MessengerForiOS;FBAV/470.0]')).toBe('Messenger')
    expect(isInAppBrowser('Mozilla/5.0 (Windows NT 10.0) coc_coc_browser/128.0.0 Chrome/122.0.0.0 Safari/537.36')).toBeNull()
  })

  it('số phiên bản: package.json khớp src/version.ts', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).version).toBe(APP_VERSION)
  })
})
