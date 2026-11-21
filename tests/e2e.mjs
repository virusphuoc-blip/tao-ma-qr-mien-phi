// Kiểm thử đầu-cuối trên viewport 390px: npm run build && npm run test:e2e
// Biến môi trường: BASE_URL (mặc định tự chạy `vite preview`), CHROME_PATH.
import { Resvg } from '@resvg/resvg-js'
import jsQR from 'jsqr'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { PNG } from 'pngjs'

const OUT = 'test-results'
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
assert.match(await page.textContent('footer'), /Công cụ miễn phí, không phải sản phẩm chính thức của LPBank\./)
assert.match(await page.textContent('footer'), /Mọi dữ liệu chỉ xử lý trên trình duyệt của bạn, không gửi lên máy chủ\./)
log('mở trang với tư cách khách, LPBank chọn sẵn, có footer bắt buộc')

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
  assert.deepEqual(r, { width: size, height: size, text: vietqr })
  log(`tải PNG ${size}px: tệp hợp lệ, quét lại ra đúng payload`)
}
assert.equal(decodeSvg(await download('#dl-svg', 'svg')), vietqr)
log('tải SVG: tệp hợp lệ, quét lại ra đúng payload')

// tùy chỉnh
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
assert.equal(await page.locator('#history li').count(), 9)
await page.reload()
assert.equal(await page.locator('#history li').count(), 9)
await page.click('#history li:last-child button:first-child')
assert.equal(await payload(), vietqr)
assert.equal(decodePng(await download('#history li:last-child button:last-child', 'png')).text, vietqr)
page.once('dialog', (d) => d.accept())
await page.click('#clear-history')
assert.equal(await page.locator('#history li').count(), 0)
assert.equal(await page.evaluate(() => localStorage.getItem('tmqr.history.v1')), null)
log('lịch sử: lưu 9 mục, còn sau khi tải lại trang, tạo lại + tải lại được, xóa sạch')

// 5. PWA + riêng tư
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
