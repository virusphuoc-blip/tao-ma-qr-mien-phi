// Kiểm thử đầu-cuối trên viewport 390px: npm run build && npm run test:e2e
// Biến môi trường: BASE_URL (mặc định tự chạy `vite preview`), CHROME_PATH.
import { Resvg } from '@resvg/resvg-js'
import jsQR from 'jsqr'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { PNG } from 'pngjs'

const OUT = 'test-results'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
let server
let base = process.env.BASE_URL
if (!base) {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
  base = 'http://localhost:4173'
  for (let i = 0; i < 50; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break
    await new Promise((r) => setTimeout(r, 200))
  }
}

const decodePng = (file) => {
  const png = PNG.sync.read(readFileSync(file))
  return { width: png.width, height: png.height, text: jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data }
}
const decodeSvg = (file) => {
  const svg = readFileSync(file, 'utf8')
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: 800 } }).render()
  return jsQR(new Uint8ClampedArray(img.pixels), img.width, img.height)?.data
}
const crc16 = (s) => {
  let c = 0xffff
  for (const b of Buffer.from(s)) {
    c ^= b << 8
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff
  }
  return c.toString(16).toUpperCase().padStart(4, '0')
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, channel: process.env.CHROME_PATH ? undefined : 'chrome' })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
  locale: 'vi-VN',
})
const page = await context.newPage()
const foreign = []
page.on('request', (r) => {
  if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreign.push(r.url())
})
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

let n = 0
const download = async (selector, ext) => {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(selector)])
  assert.match(d.suggestedFilename(), new RegExp(`^qr-.+\\.${ext}$`))
  const file = `${OUT}/${String(++n).padStart(2, '0')}-${d.suggestedFilename()}`
  await d.saveAs(file)
  return file
}
const payload = async () => (await page.textContent('#payload')).trim()
const log = (s) => console.log('ok  ' + s)

await page.goto(base)
assert.equal(await page.title(), 'Tạo Mã QR Miễn Phí')
assert.equal(await page.inputValue('#bank'), '970449')
assert.doesNotMatch(await page.textContent('footer'), /không phải sản phẩm chính thức/)
assert.match(await page.textContent('footer'), /Mọi dữ liệu chỉ xử lý trên trình duyệt của bạn, không gửi lên máy chủ\./)
log('mở trang với tư cách khách, LPBank chọn sẵn, footer không còn dòng miễn trừ')

// 1. VietQR
await page.fill('#account', '0123 456-789abc')
assert.equal(await page.inputValue('#account'), '0123456789')
await page.fill('#holder', 'Nguyen Van A')
const open = await payload()
assert.equal(open, '00020101021138540010A00000072701240006970449011001234567890208QRIBFTTA53037045802VN6304' + crc16(open.slice(0, -4)))
await page.click('text=100K')
assert.equal(await page.inputValue('#amount'), '100.000')
await page.fill('#content', 'Tiền ăn trưa')
const vietqr = await payload()
const body = '00020101021238540010A00000072701240006970449011001234567890208QRIBFTTA5303704540610000058' + '02VN62160812Tien an trua6304'
assert.equal(vietqr, body + crc16(body))
log('VietQR: payload đúng từng trường + CRC-16 ' + vietqr.slice(-4))

for (const size of [512, 1024, 2048]) {
  await page.click(`[data-size="${size}"]`)
  const r = decodePng(await download('#dl-png', 'png'))
  assert.equal(r.width, size)
  assert.ok(r.height > size, 'thẻ Chuẩn phải cao hơn mã QR')
  assert.equal(r.text, vietqr)
  log(`tải PNG ${size}px: tệp hợp lệ, quét lại ra đúng payload`)
}
assert.equal(decodeSvg(await download('#dl-svg', 'svg')), vietqr)
log('tải SVG: tệp hợp lệ, quét lại ra đúng payload')

// tùy chỉnh (mẫu "Chỉ mã QR" = ảnh vuông như bản 1.0)
await page.click('[data-template-btn="plain"]')
assert.deepEqual(decodePng(await download('#dl-png', 'png')), { width: 2048, height: 2048, text: vietqr })
await page.click('text=Nâu LPBank')
await page.check('#rounded')
await page.click('[data-logo="lpbank"]')
assert.equal(await page.getAttribute('[data-ec="H"]', 'class').then((c) => c.includes('chip-on')), true)
await page.click('[data-size="1024"]')
const styledPng = await download('#dl-png', 'png')
assert.equal(decodePng(styledPng).text, vietqr)
const styledSvg = await download('#dl-svg', 'svg')
assert.match(readFileSync(styledSvg, 'utf8'), /<image [^>]*href="data:image\/png;base64,/)
assert.equal(decodeSvg(styledSvg), vietqr)
log('màu nâu + bo tròn + logo LPBank: PNG và SVG vẫn quét được')
await page.screenshot({ path: `${OUT}/vietqr-390.png`, fullPage: true })

await page.setInputFiles('#logo-file', 'public/pwa-192.png')
await page.waitForFunction(() => document.querySelector('#qr-preview image')?.getAttribute('href')?.length > 3000)
assert.equal(decodePng(await download('#dl-png', 'png')).text, vietqr)
log('logo tự tải lên: PNG quét được')

await page.fill('#bg-color', '#222222')
assert.match(await page.textContent('#warnings'), /Nền tối/)
await page.click('#bg-white')
assert.equal(await page.locator('#warnings').count(), 0)
await page.click('[data-logo="none"]')
log('cảnh báo nền tối hiển thị')

await context.grantPermissions(['clipboard-read', 'clipboard-write'])
await page.click('#copy')
await page.waitForSelector('text=Đã sao chép ảnh')
const clip = await page.evaluate(async () => (await navigator.clipboard.read())[0].types)
assert.deepEqual(clip, ['image/png'])
log('sao chép ảnh: clipboard có image/png')

// 1b. v1.1: phong cách ngân hàng, mẫu thẻ, thông tin cán bộ, banner + footer
const cssVar = (name) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name)
const near = (file, hex, tol = 12) => {
  const png = PNG.sync.read(readFileSync(file))
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  let count = 0
  for (let i = 0; i < png.data.length; i += 4)
    if (png.data[i + 3] > 200 && Math.abs(png.data[i] - r) + Math.abs(png.data[i + 1] - g) + Math.abs(png.data[i + 2] - b) <= tol) count++
  return count / (png.width * png.height)
}
const PAGE_ONLY = /VH Phước|Zalo|0988474228|©|Mở TK|v1\.1\.\d|không phải sản phẩm/
assert.equal(await page.inputValue('#style-bank'), '970449')
assert.equal(await cssVar('--color-brand'), '#6D371A')
assert.equal(await cssVar('--color-accent'), '#F99D1C')
await page.selectOption('#bank', '970436')
assert.equal(await page.inputValue('#style-bank'), '970436')
assert.equal(await cssVar('--color-brand'), '#00512A')
await page.selectOption('#bank', '970403')
assert.equal(await page.inputValue('#style-bank'), '970403')
assert.equal(await cssVar('--color-brand'), '#0065A4')
assert.equal(await cssVar('--color-accent'), '#F3B643')
await page.selectOption('#style-bank', '970422')
assert.equal(await page.inputValue('#bank'), '970403')
assert.equal(await cssVar('--color-brand'), '#141ED2')
await page.selectOption('#style-bank', '970403')
log('phong cách: mặc định LPBank, tự đổi theo ngân hàng nhận, đổi tay được mà không đổi ngân hàng nhận')

const stb = await payload()
assert.equal(stb, vietqr.replace('970449', '970403').slice(0, -4) + crc16(vietqr.replace('970449', '970403').slice(0, -4)))
await page.click('[data-size="1024"]')
const staffFull = { branch: 'CN Sài Gòn', name: 'Trần Thị B', phone: '0901234567' }
const fillStaff = async (v) => {
  for (const k of ['branch', 'name', 'phone']) await page.fill('#staff-' + k, v[k] ?? '')
}
const heights = {}
for (const tpl of ['standard', 'bank', 'minimal', 'business']) {
  await page.click(`[data-template-btn="${tpl}"]`)
  await fillStaff(staffFull)
  assert.equal(await payload(), stb, 'thông tin cán bộ không được nằm trong payload')
  const png = await download('#dl-png', 'png')
  copyFileSync(png, `${OUT}/card-${tpl}.png`)
  const full = decodePng(png)
  assert.equal(full.text, stb)
  assert.equal(full.width, 1024)
  const svgFile = await download('#dl-svg', 'svg')
  const svg = readFileSync(svgFile, 'utf8')
  assert.equal(decodeSvg(svgFile), stb)
  const staffText = /font-size="([\d.]+)"[^>]*>NV hỗ trợ: Trần Thị B — CN Sài Gòn — 0901234567<\/text>/.exec(svg)
  assert.ok(staffText, tpl + ': thiếu dòng "NV hỗ trợ: Tên — Chi nhánh — SĐT"')
  const bodyText = /font-size="([\d.]+)"[^>]*>Sacombank · 0123456789<\/text>/.exec(svg)
  const ratio = staffText[1] / bodyText[1]
  assert.ok(ratio >= 0.6 && ratio <= 0.7, `${tpl}: chữ cán bộ phải bằng 60–70% chữ nội dung (đang ${ratio})`)
  assert.ok(svg.indexOf('NV hỗ trợ') > svg.indexOf('Sacombank · 0123456789'), tpl + ': phần cán bộ phải nằm dưới mã')
  assert.doesNotMatch(svg, PAGE_ONLY, tpl + ': thẻ không được chứa banner/bản quyền')
  if (tpl !== 'minimal') {
    assert.ok(near(png, '#0065A4') > (tpl === 'standard' ? 0.001 : 0.03), tpl + ': thiếu màu xanh Sacombank #0065A4')
    assert.ok(near(png, '#F3B643') > 0.0005, tpl + ': thiếu màu vàng Sacombank #F3B643')
    assert.match(svg, /<image [^>]*href="data:image\/png;base64,/)
  } else {
    assert.equal(PNG.sync.read(readFileSync(png)).data[3], 0, 'mẫu Tối giản phải không có nền')
    assert.ok(svg.includes('>Sacombank</text>'))
  }
  // chỉ có số điện thoại: không dòng trống, không "null"
  await fillStaff({ phone: '0901234567' })
  const partial = readFileSync(await download('#dl-svg', 'svg'), 'utf8')
  assert.ok(partial.includes('>NV hỗ trợ: 0901234567</text>'))
  assert.doesNotMatch(partial, /null|undefined|CN Sài Gòn|Trần Thị B|— <|: —|— —/)
  // bỏ trống hết: không còn phần cán bộ
  await fillStaff({})
  const emptyPng = await download('#dl-png', 'png')
  copyFileSync(emptyPng, `${OUT}/card-${tpl}-empty.png`)
  const empty = decodePng(emptyPng)
  assert.equal(empty.text, stb)
  const emptySvg = readFileSync(await download('#dl-svg', 'svg'), 'utf8')
  assert.doesNotMatch(emptySvg, /NV hỗ trợ|CÁN BỘ|CN Sài Gòn|Trần Thị B|0901234567|null|undefined/)
  assert.ok(full.height > empty.height + 30, tpl + ': thẻ có thông tin cán bộ phải cao hơn thẻ không có')
  assert.equal((svg.match(/<text /g) ?? []).length - (emptySvg.match(/<text /g) ?? []).length, 1)
  heights[tpl] = [full.height, empty.height]
  log(`mẫu ${tpl}: PNG + SVG quét đúng payload, màu Sacombank, dòng "NV hỗ trợ:" cỡ ${Math.round(ratio * 100)}% chữ nội dung; bỏ trống thì không có phần cán bộ (cao ${full.height} → ${empty.height}px)`)
}
await fillStaff(staffFull)
await page.click('[data-template-btn="bank"]')
await page.locator('#qr-preview').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${OUT}/sacombank-390.png` })
await page.reload()
assert.deepEqual(await page.evaluate(() => ['branch', 'name', 'phone'].map((k) => document.querySelector('#staff-' + k).value)), Object.values(staffFull))
assert.equal(await page.inputValue('#style-bank'), '970403')
assert.match(await page.getAttribute('[data-template-btn="bank"]', 'class'), /chip-on/)
await page.click('#clear-staff')
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('tmqr.staff.v1'))), { branch: '', name: '', phone: '' })
assert.equal(await page.locator('#clear-staff').count(), 0)
log('thông tin cán bộ: còn sau khi tải lại trang, nút Xóa xóa sạch')

const footer = (await page.textContent('footer')).replace(/\s+/g, ' ')
assert.ok(footer.includes('© 2026 VH Phước. Mọi nội dung thuộc về VH Phước. Tạo Mã QR Miễn Phí v1.1.1'))
assert.doesNotMatch(footer, /không phải sản phẩm|Công cụ miễn phí/)
assert.equal((await page.textContent('#promo')).replace(/\s+/g, ' ').trim(), 'Mở TK LPBank miễn phí: liên hệ ngay VH Phước Zalo 0988474228')
assert.equal(await page.getAttribute('#promo', 'href'), 'https://zalo.me/0988474228')
const promo = await page.evaluate(() => {
  const el = document.querySelector('#promo')
  const b = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const main = document.querySelector('main').getBoundingClientRect()
  const foot = document.querySelector('footer').getBoundingClientRect()
  return { h: b.height, position: cs.position, bg: cs.backgroundColor, afterMain: b.top >= main.bottom, beforeFooter: b.bottom <= foot.top }
})
assert.deepEqual({ ...promo, h: promo.h <= 64 }, { h: true, position: 'static', bg: 'rgb(109, 55, 26)', afterMain: true, beforeFooter: true })
await context.route('https://zalo.me/**', (r) => r.fulfill({ body: 'zalo' }))
const [popup] = await Promise.all([context.waitForEvent('page'), page.click('#promo')])
assert.equal(popup.url(), 'https://zalo.me/0988474228')
await popup.close()
log(`footer + banner: đúng nội dung, banner cao ${promo.h}px nằm giữa nội dung và footer, bấm mở https://zalo.me/0988474228`)
await page.selectOption('#bank', '970449')
await page.click('[data-template-btn="standard"]')

// 2. Các loại khác
const others = {
  url: [{ 'f-url': 'lpbank.com.vn' }, 'https://lpbank.com.vn'],
  text: [{ 'f-text': 'Xin chào Việt Nam!' }, 'Xin chào Việt Nam!'],
  wifi: [{ 'f-ssid': 'Nha Toi 5G', 'f-password': 'matkhau123' }, 'WIFI:T:WPA;S:Nha Toi 5G;P:matkhau123;;'],
  phone: [{ 'f-phone': '0912 345 678' }, 'tel:0912345678'],
  sms: [{ 'f-phone': '0912345678', 'f-message': 'Chào bạn' }, 'SMSTO:0912345678:Chào bạn'],
  email: [{ 'f-to': 'a@example.com', 'f-subject': 'Chào' }, 'mailto:a@example.com?subject=Ch%C3%A0o'],
  vcard: [{ 'f-name': 'Nguyễn Văn A', 'f-phone': '0912345678' }, 'BEGIN:VCARD\nVERSION:3.0\nN:Nguyễn Văn A;;;;\nFN:Nguyễn Văn A\nTEL;TYPE=CELL:0912345678\nEND:VCARD'],
  zalo: [{ 'f-id': '0912345678' }, 'https://zalo.me/0912345678'],
}
for (const [type, [fields, expected]] of Object.entries(others)) {
  await page.click(`[data-type="${type}"]`)
  assert.ok(await page.isVisible('#empty'))
  for (const [id, value] of Object.entries(fields)) await page.fill('#' + id, value)
  assert.equal(await payload(), expected)
  assert.equal(decodePng(await download('#dl-png', 'png')).text, expected)
  assert.equal(decodeSvg(await download('#dl-svg', 'svg')), expected)
  log(`${type}: PNG + SVG quét lại đúng`)
}

// 3. Bố cục 390px
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
assert.ok(overflow <= 0, 'tràn ngang ' + overflow)
log('không tràn ngang ở 390px')

// 4. Lịch sử
assert.equal(await page.locator('#history li').count(), 10)
await page.reload()
assert.equal(await page.locator('#history li').count(), 10)
await page.click('#history li:last-child button:first-child')
assert.equal(await payload(), vietqr)
assert.equal(decodePng(await download('#history li:last-child button:last-child', 'png')).text, vietqr)
page.once('dialog', (d) => d.accept())
await page.click('#clear-history')
assert.equal(await page.locator('#history li').count(), 0)
assert.equal(await page.evaluate(() => localStorage.getItem('tmqr.history.v1')), null)
log('lịch sử: lưu 10 mục, còn sau khi tải lại trang, tạo lại + tải lại được, xóa sạch')

// 5. PWA + riêng tư
assert.equal(await page.textContent('#app-version'), 'Tạo Mã QR Miễn Phí v' + JSON.parse(readFileSync('package.json', 'utf8')).version)
const manifest = await (await fetch(base + '/manifest.webmanifest')).json()
assert.equal(manifest.name, 'Tạo Mã QR Miễn Phí')
assert.equal(manifest.display, 'standalone')
assert.ok((await fetch(base + '/sw.js')).ok)
await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r?.active))
await context.setOffline(true)
await page.reload()
assert.equal(await page.inputValue('#bank'), '970449')
await context.setOffline(false)
log('PWA: manifest, service worker, chạy được khi ngoại tuyến')
assert.deepEqual(foreign, [], 'có request ra ngoài: ' + foreign.join(', '))
log('không có request nào ra ngoài tên miền của trang')
assert.deepEqual(errors, [])

await browser.close()
server?.kill()
console.log('\nTẤT CẢ ĐẠT')
