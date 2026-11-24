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
  assert.match(d.suggestedFilename(), new RegExp(`^(qr|card-visit)-.+\\.${ext}$`))
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
const PAGE_ONLY = /VH Phước|Zalo|0988474228|©|Mở TK|v1\.\d\.\d|không phải sản phẩm/
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
assert.ok(footer.includes('© 2026 VH Phước. Mọi nội dung thuộc về VH Phước. Tạo Mã QR Miễn Phí v1.4.2'))
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

// 1c. v1.2: 4 mẫu thẻ mới
const sizeOf = (svg, re) => Number(new RegExp('font-size="([\\d.]+)"[^>]*>' + re + '</text>').exec(svg)?.[1])
await page.fill('#account', '0123456789')
await page.fill('#holder', 'Nguyen Van A')
await page.click('text=100K')
await page.fill('#content', 'Tiền ăn trưa')
await page.click('[data-size="1024"]')
const lp = await payload()
assert.equal(lp, vietqr)
for (const tpl of ['tree', 'treeA6', 'luxury', 'gradient', 'tet', 'nature', 'ocean', 'royal', 'midautumn']) {
  await page.click(`[data-template-btn="${tpl}"]`)
  await fillStaff(staffFull)
  assert.equal(await payload(), lp)
  const box = await page.locator('#qr-preview > svg').boundingBox()
  assert.ok(box.width > 200 && box.width <= 390 && box.height > 150, tpl + ': bản xem trước không hiển thị đúng ở 390px')
  const png = await download('#dl-png', 'png')
  copyFileSync(png, `${OUT}/card-${tpl}.png`)
  const full = decodePng(png)
  assert.equal(full.text, lp, tpl + ': PNG không quét ra đúng payload')
  assert.equal(full.width, 1024)
  const svgFile = await download('#dl-svg', 'svg')
  const svg = readFileSync(svgFile, 'utf8')
  assert.equal(decodeSvg(svgFile), lp)
  const ratio = sizeOf(svg, 'NV hỗ trợ: Trần Thị B[^<]*') / sizeOf(svg, tpl.startsWith('tree') ? '0123456789' : 'LPBank · 0123456789')
  assert.ok(ratio >= 0.6 && ratio <= 0.7, `${tpl}: chữ NV hỗ trợ phải bằng 60–70% chữ nội dung (đang ${ratio})`)
  assert.doesNotMatch(svg, PAGE_ONLY)
  assert.doesNotMatch(svg, /href="(?!data:)/, tpl + ': thẻ không được tham chiếu tệp ngoài')
  if (tpl === 'treeA6') {
    // v1.4.1: khổ A6 dọc 105 × 148 mm, cùng cây vàng, tên đầy đủ dưới logo, chữ không tràn
    assert.ok(Math.abs(full.height / full.width - 148 / 105) < 0.002, 'A6 dọc: PNG phải đúng tỉ lệ 105 × 148, đang ' + full.width + '×' + full.height)
    assert.match(svg, /viewBox="0 0 1050 1480"/)
    assert.ok(/<text x="525"[^>]*font-size="(4\d)"[^>]*>Ngân hàng TMCP Lộc Phát Việt Nam<\/text>/.test(svg), 'A6: thiếu tên đầy đủ dưới logo')
    assert.ok(svg.includes('>NGUYEN VAN A</text>') && svg.includes('>0123456789</text>'))
    assert.equal((svg.match(/<image /g) ?? []).length, 4)
    assert.ok((svg.match(/<path /g) ?? []).length > 80, 'A6: cây vàng phải được vẽ bằng path')
    assert.ok(near(png, '#F5C542', 30) > 0.005, 'A6: thiếu màu vàng')
    const out = await page.evaluate(() => {
      const c = document.querySelector('#qr-preview > svg').getBoundingClientRect()
      const ts = [...document.querySelectorAll('#qr-preview > svg text')].map((e) => e.getBoundingClientRect())
      const clash = ts.some((a, i) => ts.some((b, j) => j > i && a.left < b.right && b.left < a.right && a.top < b.bottom - 1 && b.top < a.bottom - 1))
      return { over: ts.filter((r) => r.left < c.left + 4 || r.right > c.right - 4 || r.top < c.top || r.bottom > c.bottom).length, clash, n: ts.length }
    })
    assert.ok(out.n >= 4 && out.over === 0 && !out.clash, 'A6: chữ tràn hoặc chèn nhau ' + JSON.stringify(out))
    // v1.4.2: lề an toàn ≥ 5 mm (50/1050 chiều rộng) cho mọi chi tiết trừ nền + viền
    const safe = await page.evaluate(() => {
      const root = document.querySelector('#qr-preview > svg')
      const els = [...root.children].filter((e) => e.tagName !== 'defs')
      let l = 1e9, t = 1e9, r = 0, b = 0
      for (const e of els) {
        const box = e.tagName === 'svg' ? { x: +e.getAttribute('x'), y: +e.getAttribute('y'), width: +e.getAttribute('width'), height: +e.getAttribute('height') } : e.getBBox()
        if (!box.width || !box.height || box.width >= 1030) continue // bỏ nền + viền thẻ
        l = Math.min(l, box.x); t = Math.min(t, box.y); r = Math.max(r, box.x + box.width); b = Math.max(b, box.y + box.height)
      }
      return { n: els.length, left: l / 10, top: t / 10, right: (1050 - r) / 10, bottom: (1480 - b) / 10 }
    })
    assert.ok(safe.n > 80 && Math.min(safe.left, safe.top, safe.right, safe.bottom) >= 5, 'A6: có chi tiết cách mép dưới 5 mm ' + JSON.stringify(safe))
    // đo trực tiếp trên PNG: khung trắng cách mép phải ≥ 5 mm
    const img = PNG.sync.read(readFileSync(png))
    const row = Math.round(img.height * 0.6)
    let x = img.width - 1
    const white = (px) => img.data[(row * img.width + px) * 4] > 250 && img.data[(row * img.width + px) * 4 + 1] > 250 && img.data[(row * img.width + px) * 4 + 2] > 250
    while (x > 0 && !white(x)) x--
    const rightMm = ((img.width - 1 - x) / img.width) * 105
    assert.ok(rightMm >= 5 && rightMm < 12, 'A6: khung trắng cách mép phải ' + rightMm.toFixed(2) + ' mm')
    log(`A6 dọc: lề đo trên bản xem trước (mm) trái ${safe.left.toFixed(1)}, trên ${safe.top.toFixed(1)}, phải ${safe.right.toFixed(1)}, dưới ${safe.bottom.toFixed(1)}; khung trắng trên PNG cách mép phải ${rightMm.toFixed(1)} mm`)
    const big = decodePng(await (async () => { await page.click('[data-size="2048"]'); const f = await download('#dl-png', 'png'); await page.click('[data-size="1024"]'); return f })())
    assert.equal(big.text, lp)
    assert.equal(big.width, 2048)
  } else if (tpl !== 'tree') {
    // v1.2.1: dòng dưới logo LPBank là tên đầy đủ, một dòng, không bị cắt, nằm gọn trong thẻ
    const m = /<text x="500"[^>]*font-size="(\d+)"[^>]*>Ngân hàng TMCP Lộc Phát Việt Nam<\/text>/.exec(svg)
    assert.ok(m && Number(m[1]) >= 36, tpl + ': thiếu dòng "Ngân hàng TMCP Lộc Phát Việt Nam" dưới logo')
    assert.ok(!svg.includes('>LPBank</text>'), tpl + ': còn dòng "LPBank" dưới logo')
    const w = await page.evaluate(() => {
      const t = [...document.querySelectorAll('#qr-preview > svg text')].find((e) => e.textContent === 'Ngân hàng TMCP Lộc Phát Việt Nam')
      const r = t.getBoundingClientRect(), c = t.ownerSVGElement.getBoundingClientRect()
      return [r.left - c.left, c.right - r.right, r.height]
    })
    assert.ok(w[0] > 8 && w[1] > 8 && w[2] >= 11, tpl + ': tên đầy đủ không vừa thẻ ở 390px ' + w)
  }
  if (tpl === 'tree') {
    assert.ok(full.width > full.height, 'mẫu Cây Vàng phải nằm ngang')
    assert.ok(svg.includes('>NGÂN HÀNG LỘC PHÁT VIỆT NAM</text>'))
    assert.ok(svg.includes('>NGUYEN VAN A</text>'))
    assert.equal((svg.match(/<image /g) ?? []).length, 4, 'logo ngân hàng + logo giữa mã + VietQR + napas 247')
    assert.ok((svg.match(/<path /g) ?? []).length > 80, 'cây vàng phải được vẽ bằng path')
    assert.ok(near(png, '#F5C542', 30) > 0.01, 'thiếu màu vàng')
  }
  await fillStaff({})
  const emptyPng = await download('#dl-png', 'png')
  const empty = decodePng(emptyPng)
  assert.equal(empty.text, lp)
  assert.doesNotMatch(readFileSync(await download('#dl-svg', 'svg'), 'utf8'), /NV hỗ trợ|Trần Thị B|null|undefined/)
  if (tpl === 'treeA6') {
    assert.equal(empty.height, full.height, 'A6: khổ giấy cố định, không đổi theo NV hỗ trợ')
    copyFileSync(emptyPng, `${OUT}/card-treeA6-empty.png`)
  } else assert.ok(full.height > empty.height + 20, tpl + ': thẻ có NV hỗ trợ phải cao hơn')
  log(`mẫu ${tpl}: xem trước ở 390px, PNG + SVG quét đúng payload, "NV hỗ trợ:" cỡ ${Math.round(ratio * 100)}%; bỏ trống thì không có (cao ${full.height} → ${empty.height}px)`)
}
await page.click('[data-template-btn="bank"]')
assert.equal(decodePng(await download('#dl-png', 'png')).text, lp)
const bankLp = readFileSync(await download('#dl-svg', 'svg'), 'utf8')
assert.ok(bankLp.includes('>Ngân hàng TMCP Lộc Phát Việt Nam</text>') && !bankLp.includes('>LPBank</text>'))
copyFileSync(await download('#dl-png', 'png'), `${OUT}/card-bank-lpbank.png`)
await page.screenshot({ path: `${OUT}/lpbank-390.png`, fullPage: true })
await page.selectOption('#bank', '970403')
const bankStb = readFileSync(await download('#dl-svg', 'svg'), 'utf8')
assert.ok(bankStb.includes('>Ngân hàng TMCP Sài Gòn Tài Lộc</text>') && !bankStb.includes('>Sacombank</text>') && !bankStb.includes('Lộc Phát'), 'Sacombank phải hiện tên đầy đủ')
await page.selectOption('#bank', '970405')
const vba = await download('#dl-png', 'png')
copyFileSync(vba, `${OUT}/card-bank-agribank.png`)
assert.ok(decodePng(vba).text.includes('0006970405'))
const bankVba = readFileSync(await download('#dl-svg', 'svg'), 'utf8')
assert.ok(bankVba.includes('>Ngân hàng Nông nghiệp và</text>') && bankVba.includes('>Phát triển Nông thôn Việt Nam</text>'), 'tên dài phải tách hai dòng')
await page.selectOption('#bank', '970418')
assert.ok(readFileSync(await download('#dl-svg', 'svg'), 'utf8').includes('>BIDV</text>'), 'chưa xác minh tên đầy đủ thì giữ tên ngắn')
await page.selectOption('#bank', '970449')
log('v1.2.1: mẫu Thẻ ngân hàng + LPBank: dòng dưới logo là "Ngân hàng TMCP Lộc Phát Việt Nam", PNG quét đúng payload; Sacombank hiện tên đầy đủ, Agribank tách hai dòng, BIDV giữ tên ngắn')
await page.click('[data-template-btn="tree"]')
await page.selectOption('#bank', '970403')
const treeStb = readFileSync(await download('#dl-svg', 'svg'), 'utf8')
assert.ok(!treeStb.includes('LỘC PHÁT') && treeStb.includes('>Sacombank</text>'), 'Cây Vàng: ngân hàng khác phải hiện tên ngân hàng đó thay khẩu hiệu LPBank')
await page.selectOption('#bank', '970449')
assert.equal((await page.locator('[data-template-btn]').count()), 14)
log('mẫu Cây Vàng: khẩu hiệu LPBank chỉ hiện với LPBank, Sacombank hiện "Sacombank"')

// 1d. v1.2: card visit
const statsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('tmqr.stats.v1')))
await page.click('#nav-card')
for (const [k, v] of Object.entries({ name: 'Võ Hoàng Phước', title: 'Chuyên viên tư vấn', branch: 'CN Sài Gòn', phone: '0988474228' })) await page.fill('#bc-' + k, v)
assert.equal(await page.locator('#bc-png').count(), 1)
await page.fill('#bc-account', '0123456789')
await page.fill('#bc-amount', '50000')
for (const tpl of ['lpbank', 'luxury']) {
  await page.click(`[data-bc-template="${tpl}"]`)
  const file = await download('#bc-png', 'png')
  copyFileSync(file, `${OUT}/bizcard-${tpl}.png`)
  const r = decodePng(file)
  assert.deepEqual([r.width, r.height], [2100, 1200])
  assert.ok(r.text.startsWith('000201') && r.text.includes('0006970449') && r.text.includes('01100123456789') && r.text.includes('540550000'), 'mã trên card sai: ' + r.text)
  assert.equal(crc16(r.text.slice(0, -4)), r.text.slice(-4))
  const svgFile = await download('#bc-svg', 'svg')
  const svg = readFileSync(svgFile, 'utf8')
  assert.equal(decodeSvg(svgFile), r.text)
  for (const t of ['Võ Hoàng Phước', 'Chuyên viên tư vấn', 'Chi nhánh: CN Sài Gòn', 'ĐT: 0988474228']) assert.ok(svg.includes(`>${t}</text>`), `${tpl}: thiếu "${t}"`)
  assert.doesNotMatch(svg, /Zalo|Email|Facebook|null|undefined/, tpl + ': ô trống không được in')
  assert.ok(svg.includes('>Quét để chuyển khoản</text>'), tpl + ': thiếu chú thích chuyển khoản')
  assert.doesNotMatch(svg, /©|Mở TK|v1\.\d\.\d/)
  log(`card visit ${tpl}: PNG 2100×1200 (3.5:2) + SVG, mã quét ra VietQR đúng CRC, ô trống không in`)
}
// v1.4: loại mã QR trên card visit + 4 mẫu mới
for (const k of ['zalo', 'facebook']) {
  assert.ok(await page.locator(`[data-bc-kind="${k}"]`).isDisabled(), k + ': ô trống thì lựa chọn phải bị khóa')
  assert.equal(await page.locator(`[data-bc-hint="${k}"]`).count(), 1)
}
assert.ok(await page.locator('[data-bc-kind="call"]').isEnabled())
assert.equal(await page.locator('[data-bc-hint="call"]').count(), 0)
await page.fill('#bc-zalo', '0988 474 228')
await page.fill('#bc-facebook', 'vh.phuoc')
assert.equal(await page.locator('[data-bc-hint]').count(), 0)
const VIETQR_CARD = (t) => t.startsWith('000201') && t.includes('0006970449') && t.includes('01100123456789') && t.includes('540550000') && crc16(t.slice(0, -4)) === t.slice(-4)
const KINDS = {
  pay: [VIETQR_CARD, ['Quét để chuyển khoản']],
  zalo: [(t) => t === 'https://zalo.me/0988474228', ['Quét mã Zalo', 'để liên hệ']],
  facebook: [(t) => t === 'https://www.facebook.com/vh.phuoc', ['Quét mã Facebook', 'để liên hệ']],
  call: [(t) => t === 'tel:+84988474228', ['Quét mã để gọi điện']],
}
const BIZ = ['lpbank', 'luxury', 'blue', 'lotus', 'emerald', 'silver']
assert.equal(await page.locator('[data-bc-template]').count(), 6)
let bizDownloads = 0
for (const tpl of BIZ) {
  await page.click(`[data-bc-template="${tpl}"]`)
  for (const [kind, [okPayload, caption]] of Object.entries(KINDS)) {
    await page.click(`[data-bc-kind="${kind}"]`)
    assert.equal(await page.locator('#bc-source').count(), kind === 'pay' ? 1 : 0, 'chọn mã từ lịch sử chỉ dành cho loại chuyển tiền')
    const shown = await page.locator('#bc-preview').innerHTML()
    for (const line of caption) assert.ok(shown.includes(`>${line}</text>`), `${tpl}/${kind}: xem trước thiếu chú thích "${line}"`)
    const box = await page.locator('#bc-preview > svg').boundingBox()
    assert.ok(box.width <= 390 && Math.abs(box.width / box.height - 1.75) < 0.01)
    const file = await download('#bc-png', 'png')
    const r = decodePng(file)
    assert.deepEqual([r.width, r.height], [2100, 1200])
    assert.ok(okPayload(r.text), `${tpl}/${kind}: PNG quét ra sai: ${r.text}`)
    const svgFile = await download('#bc-svg', 'svg')
    const svg = readFileSync(svgFile, 'utf8')
    assert.equal(decodeSvg(svgFile), r.text)
    for (const line of caption) assert.ok(svg.includes(`>${line}</text>`), `${tpl}/${kind}: SVG thiếu chú thích`)
    for (const t of ['Võ Hoàng Phước', 'Chuyên viên tư vấn', 'Chi nhánh: CN Sài Gòn', 'ĐT: 0988474228', 'Zalo: 0988 474 228', 'Facebook: vh.phuoc']) assert.ok(svg.includes(`>${t}</text>`), `${tpl}: thiếu "${t}"`)
    assert.doesNotMatch(svg, /Email|null|undefined|NaN|…/, tpl + ': ô trống không được in, chữ không bị cắt')
    bizDownloads += 2
    copyFileSync(file, `${OUT}/bizcard-${tpl}-${kind}.png`)
  }
  log(`card visit ${tpl}: 4 loại mã (chuyển tiền, Zalo, Facebook, gọi điện) PNG + SVG quét đúng payload, có chú thích`)
}
await page.screenshot({ path: `${OUT}/bizcard-kinds-390.png`, fullPage: true })
await page.fill('#bc-phone', '')
assert.ok(await page.locator('[data-bc-kind="call"]').isDisabled())
assert.equal(await page.locator('[data-bc-hint="call"]').count(), 1)
assert.ok(!(await page.locator('#bc-preview').innerHTML()).includes('gọi điện'), 'xóa số điện thoại thì không còn mã gọi điện')
await page.fill('#bc-phone', '0988474228')
await page.fill('#bc-zalo', '')
await page.fill('#bc-facebook', '')
await page.click('[data-bc-kind="pay"]')
await page.click('[data-bc-template="luxury"]')
log('card visit: lựa chọn Zalo/Facebook/Gọi điện bị khóa kèm gợi ý khi ô tương ứng trống')
await page.selectOption('#bc-source', { index: 1 })
const fromHistory = decodePng(await download('#bc-png', 'png'))
assert.ok(fromHistory.text.length > 0 && (await page.locator('#bc-account').count()) === 0)
await page.screenshot({ path: `${OUT}/bizcard-390.png`, fullPage: true })
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0)
const statsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('tmqr.stats.v1')))
assert.ok(statsAfter.cards >= 3 + 24)
assert.equal(statsAfter.downloads, statsBefore.downloads + 5 + bizDownloads)
log('card visit: gắn được mã từ lịch sử; đếm 3 card visit')
await page.click('#nav-qr')
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
const saved = await page.locator('#history li').count()
assert.ok(saved >= 10)
await page.reload()
assert.equal(await page.locator('#history li').count(), saved)
await page.click('#history li:last-child button:first-child')
assert.equal(await payload(), vietqr)
assert.equal(decodePng(await download('#history li:last-child button:last-child', 'png')).text, vietqr)
page.once('dialog', (d) => d.accept())
await page.click('#clear-history')
assert.equal(await page.locator('#history li').count(), 0)
assert.equal(await page.evaluate(() => localStorage.getItem('tmqr.history.v1')), null)
log(`lịch sử: lưu ${saved} mục, còn sau khi tải lại trang, tạo lại + tải lại được, xóa sạch`)

// 4b. v1.2: trang Quản trị
const counters = async () => {
  await page.click('#nav-admin')
  const v = {}
  for (const k of ['created', 'downloads', 'cards']) v[k] = Number(await page.textContent('#stat-' + k))
  v.lpbank = Number(await page.locator('#stat-by-bank tr', { hasText: 'LPBank' }).locator('td:last-child').textContent())
  v.vietqr = Number(await page.locator('#stat-by-type tr', { hasText: 'Chuyển khoản' }).locator('td:last-child').textContent())
  return v
}
const c0 = await counters()
assert.match(await page.textContent('#stat-note'), /chỉ được đếm trên thiết bị này/)
assert.ok(c0.created >= 10 && c0.downloads > 20 && c0.cards >= 27, JSON.stringify(c0))
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0)
await page.screenshot({ path: `${OUT}/admin-390.png`, fullPage: true })
await page.click('#nav-qr')
await page.fill('#account', '9876543210')
decodePng(await download('#dl-png', 'png'))
const c1 = await counters()
assert.deepEqual(c1, { created: c0.created + 1, downloads: c0.downloads + 1, cards: c0.cards, lpbank: c0.lpbank + 1, vietqr: c0.vietqr + 1 })
await page.click('#nav-qr')
await download('#dl-png', 'png')
const c2 = await counters()
assert.deepEqual(c2, { ...c1, downloads: c1.downloads + 1 })
log(`quản trị: tạo + tải 1 mã mới thì "đã tạo" ${c0.created} → ${c1.created}, "lượt tải" ${c0.downloads} → ${c2.downloads}; tải lại cùng mã chỉ tăng lượt tải`)
await page.click('#nav-qr')

// 4c. v1.3: gợi ý lưu ảnh chỉ hiện trên iOS
assert.equal(await page.locator('#ios-hint').count(), 0, 'máy tính không được hiện gợi ý iOS')
const UAS = {
  iPhone: ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', true],
  iPad: ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', true],
  Android: ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', false],
  Windows: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', false],
}
for (const [name, [userAgent, expected]] of Object.entries(UAS)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent, serviceWorkers: 'block' })
  const p = await ctx.newPage()
  await p.goto(base)
  await p.fill('#account', '0123456789')
  await p.waitForSelector('#share')
  assert.equal(await p.locator('#ios-hint').count(), expected ? 1 : 0, name + ': gợi ý iOS sai')
  if (expected) {
    assert.equal((await p.textContent('#ios-hint')).trim(), 'iPhone: bấm Chia sẻ → Lưu hình ảnh')
    const [hint, shareBtn] = [await p.locator('#ios-hint').boundingBox(), await p.locator('#share').boundingBox()]
    assert.ok(hint.y >= shareBtn.y + shareBtn.height && hint.y - (shareBtn.y + shareBtn.height) < 24 && hint.height < 48, name + ': gợi ý phải nằm ngay dưới nút Chia sẻ, một dòng')
    if (name === 'iPhone') {
      await p.locator('#ios-hint').scrollIntoViewIfNeeded()
      await p.screenshot({ path: `${OUT}/ios-hint-390.png` })
    }
  }
  await ctx.close()
}
log('gợi ý "iPhone: bấm Chia sẻ → Lưu hình ảnh": hiện với iPhone + iPad, không hiện với Android + Windows + máy test')

// 4c2. v1.4: thông báo khi mở bằng trình duyệt trong ứng dụng
assert.equal(await page.locator('#inapp-notice').count(), 0, 'trình duyệt thường không được hiện thông báo')
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const INAPP = {
  'Zalo Android': [ANDROID + ' Zalo android/24100751 ZaloTheme/light ZaloLanguage/vi', 'Zalo', 'Mở bằng trình duyệt'],
  'Zalo iPhone': [IPHONE + ' Zalo iOS/531 ZaloTheme/light ZaloLanguage/vn', 'Zalo', 'Mở bằng trình duyệt'],
  'Facebook Android': [ANDROID + ' [FB_IAB/FB4A;FBAV/480.0.0.54.88;]', 'Facebook', 'Mở bằng trình duyệt ngoài'],
  'Facebook iPhone': [IPHONE + ' [FBAN/FBIOS;FBAV/480.0.0.34.108;FBBV/640000000;FBDV/iPhone15,2]', 'Facebook', 'Mở bằng trình duyệt ngoài'],
  'Messenger iPhone': [IPHONE + ' [FBAN/MessengerForiOS;FBAV/470.0.0.30.103;FBDV/iPhone15,2]', 'Messenger', 'Mở bằng trình duyệt ngoài'],
  'Messenger Android': [ANDROID + ' [FB_IAB/Orca-Android;FBAV/470.0.0.20.105;]', 'Messenger', 'Mở bằng trình duyệt ngoài'],
  'Chrome Android': [ANDROID, null],
  'Safari iPhone': [IPHONE + ' Version/17.5 Safari/604.1', null],
  'Chrome Windows': ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', null],
  'Cốc Cốc': ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/128.0.0 Chrome/122.0.0.0 Safari/537.36', null],
}
for (const [name, [userAgent, app, how]] of Object.entries(INAPP)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent, serviceWorkers: 'block' })
  const p = await ctx.newPage()
  await p.goto(base)
  await p.waitForSelector('#nav-qr')
  if (!app) {
    for (const nav of ['#nav-qr', '#nav-card', '#nav-admin']) {
      await p.click(nav)
      assert.equal(await p.locator('#inapp-notice').count(), 0, name + ': không được hiện thông báo')
    }
  } else {
    for (const nav of ['#nav-card', '#nav-qr']) {
      await p.click(nav)
      const mainEl = p.locator(nav === '#nav-card' ? '#page-card' : '#page-qr')
      await mainEl.waitFor({ state: 'visible' })
      const main = await mainEl.boundingBox()
      const notice = (await p.textContent('#inapp-notice')).replace(/\s+/g, ' ')
      assert.ok(notice.includes(`Bạn đang mở trang bằng trình duyệt ${app} — trình duyệt này không tải hình về được. Hãy mở bằng Chrome hoặc Safari để tải hình về máy.`), name + ': ' + notice)
      assert.ok((await p.textContent('#inapp-how')).trim().endsWith(`"${how}".`), name + ': sai hướng dẫn')
      const box = await p.locator('#inapp-notice').boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= main.y + 1, name + ': thông báo phải nằm trên đầu màn hình, không tràn')
      assert.ok(parseFloat(await p.locator('#inapp-notice').evaluate((e) => getComputedStyle(e).fontSize)) >= 14)
      assert.ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0)
    }
    await p.click('#nav-admin')
    await p.locator('#inapp-notice').waitFor({ state: 'detached', timeout: 3000 }) // trang Quản trị không có nút tải nên không hiện
    await p.click('#nav-qr')
    await p.locator('#inapp-notice').waitFor({ state: 'visible' })
    if (name === 'Zalo Android') await p.screenshot({ path: `${OUT}/inapp-zalo-390.png` })
    if (name === 'Zalo iPhone') assert.equal(await p.locator('#ios-hint').count(), 0) // chưa nhập gì thì chưa có nút tải
    await p.click('#inapp-close')
    await p.locator('#inapp-notice').waitFor({ state: 'detached', timeout: 3000 }) // bấm × phải đóng được
  }
  await ctx.close()
}
log('thông báo trình duyệt trong ứng dụng: hiện với Zalo / Facebook / Messenger (Android + iPhone), đóng được; không hiện với Chrome, Safari, Cốc Cốc')

// 4d. v1.3: footer bản quyền + phiên bản ở mọi màn hình, SEO, sitemap, robots
const COPY = '© 2026 VH Phước. Mọi nội dung thuộc về VH Phước. Tạo Mã QR Miễn Phí v1.4.2'
for (const nav of ['#nav-qr', '#nav-card', '#nav-admin']) {
  await page.click(nav)
  assert.ok((await page.textContent('footer')).replace(/\s+/g, ' ').includes(COPY), nav + ': thiếu footer bản quyền')
  await page.locator('#copyright').scrollIntoViewIfNeeded()
  assert.ok(await page.locator('#copyright').isVisible(), nav + ': footer không hiển thị')
  const box = await page.locator('footer').boundingBox()
  const docH = await page.evaluate(() => document.documentElement.scrollHeight - window.scrollY)
  assert.ok(Math.abs(box.y + box.height - docH) < 2, nav + ': footer phải ở cuối trang')
}
await page.click('#nav-qr')
assert.equal(await page.title(), 'Tạo Mã QR Miễn Phí')
const meta = (sel) => page.getAttribute(sel, 'content')
const desc = await meta('meta[name="description"]')
for (const w of ['mã QR', 'VietQR', 'miễn phí', 'chuyển khoản ngân hàng', 'LPBank', 'card visit', 'PNG/SVG']) assert.ok(desc.includes(w), 'mô tả thiếu: ' + w)
assert.equal(await meta('meta[property="og:site_name"]'), 'Tạo Mã QR Miễn Phí')
assert.equal(await meta('meta[property="og:description"]'), desc)
assert.equal(await meta('meta[name="twitter:description"]'), desc)
assert.equal(await meta('meta[name="twitter:card"]'), 'summary')
const robots = await fetch(base + '/robots.txt')
const sitemap = await fetch(base + '/sitemap.xml')
assert.equal(robots.status, 200)
assert.equal(sitemap.status, 200)
const robotsTxt = await robots.text()
assert.ok(/^User-agent: \*$/m.test(robotsTxt) && /^Allow: \/$/m.test(robotsTxt) && robotsTxt.includes('Sitemap: https://qr.vhphuoc.shop/sitemap.xml'))
assert.ok((await sitemap.text()).includes('<loc>https://qr.vhphuoc.shop/</loc>') && /xml/.test(sitemap.headers.get('content-type')))
log('footer bản quyền + v1.4.0 ở cuối cả 3 màn hình; title, mô tả, Open Graph, Twitter Card đúng; robots.txt + sitemap.xml trả 200')

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
