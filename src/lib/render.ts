import QRCode from 'qrcode'

export type ECLevel = 'M' | 'Q' | 'H'

export interface QRStyle {
  fg: string
  bg: string
  ec: ECLevel
  rounded: boolean
  logo: 'none' | 'lpbank' | 'custom'
  customLogo?: string
}

export const DEFAULT_STYLE: QRStyle = { fg: '#000000', bg: '#FFFFFF', ec: 'M', rounded: false, logo: 'none' }

export interface Logo {
  src: string
  width: number
  height: number
}

export interface QRModel {
  /** số module mỗi cạnh, chưa gồm lề */
  count: number
  version: number
  /** cạnh tính cả vùng lề trắng */
  total: number
  path: string
  logoBox?: { x: number; y: number; w: number; h: number; plate: { x: number; y: number; w: number; h: number } }
}

const MARGIN = 4
const LOGO_MAX_W = 0.3
const LOGO_MAX_H = 0.22

const n = (v: number) => String(Math.round(v * 100) / 100)

export function buildModel(text: string, style: QRStyle, logo?: Logo): QRModel {
  const qr = QRCode.create(text, { errorCorrectionLevel: style.ec })
  const count = qr.modules.size
  const data = qr.modules.data
  const total = count + MARGIN * 2

  let logoBox: QRModel['logoBox']
  let hole = { x0: 0, y0: 0, x1: -1, y1: -1 }
  if (logo && logo.width > 0 && logo.height > 0) {
    const scale = Math.min((count * LOGO_MAX_W) / logo.width, (count * LOGO_MAX_H) / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    const x0 = Math.floor((count - w) / 2 - 0.5)
    const y0 = Math.floor((count - h) / 2 - 0.5)
    hole = { x0, y0, x1: count - 1 - x0, y1: count - 1 - y0 }
    logoBox = {
      x: MARGIN + (count - w) / 2,
      y: MARGIN + (count - h) / 2,
      w,
      h,
      plate: { x: MARGIN + x0, y: MARGIN + y0, w: count - 2 * x0, h: count - 2 * y0 },
    }
  }

  const dark = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < count &&
    y < count &&
    data[y * count + x] === 1 &&
    !(x >= hole.x0 && x <= hole.x1 && y >= hole.y0 && y <= hole.y1)

  const parts: string[] = []
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (!dark(x, y)) continue
      const px = x + MARGIN
      const py = y + MARGIN
      if (!style.rounded) {
        let len = 1
        while (dark(x + len, y)) len++
        parts.push(`M${px} ${py}h${len}v1h-${len}z`)
        x += len - 1
        continue
      }
      const t = dark(x, y - 1)
      const r = dark(x + 1, y)
      const b = dark(x, y + 1)
      const l = dark(x - 1, y)
      const tl = !t && !l ? 0.5 : 0
      const tr = !t && !r ? 0.5 : 0
      const br = !b && !r ? 0.5 : 0
      const bl = !b && !l ? 0.5 : 0
      const arc = (rad: number, ex: number, ey: number) => (rad ? `A${rad} ${rad} 0 0 1 ${n(ex)} ${n(ey)}` : '')
      parts.push(
        `M${n(px + tl)} ${py}H${n(px + 1 - tr)}${arc(tr, px + 1, py + tr)}` +
          `V${n(py + 1 - br)}${arc(br, px + 1 - br, py + 1)}` +
          `H${n(px + bl)}${arc(bl, px, py + 1 - bl)}` +
          `V${n(py + tl)}${arc(tl, px + tl, py)}Z`,
      )
    }
  }
  return { count, version: qr.version, total, path: parts.join(''), logoBox }
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export function toSVG(model: QRModel, style: QRStyle, logo?: Logo, size = 1024): string {
  const b = model.logoBox
  const logoSvg =
    b && logo
      ? `<rect x="${n(b.plate.x)}" y="${n(b.plate.y)}" width="${n(b.plate.w)}" height="${n(b.plate.h)}" fill="${attr(style.bg)}"/>` +
        `<image x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" preserveAspectRatio="xMidYMid meet" href="${attr(logo.src)}"/>`
      : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${model.total} ${model.total}"${style.rounded ? '' : ' shape-rendering="crispEdges"'}>` +
    `<rect width="${model.total}" height="${model.total}" fill="${attr(style.bg)}"/>` +
    `<path fill="${attr(style.fg)}" d="${model.path}"/>` +
    logoSvg +
    `</svg>`
  )
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Không đọc được ảnh logo.'))
    img.src = src
  })
}

export async function toPNG(model: QRModel, style: QRStyle, logo: Logo | undefined, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const scale = size / model.total
  ctx.fillStyle = style.bg
  ctx.fillRect(0, 0, size, size)
  ctx.save()
  ctx.scale(scale, scale)
  ctx.fillStyle = style.fg
  ctx.fill(new Path2D(model.path))
  const b = model.logoBox
  if (b && logo) {
    ctx.fillStyle = style.bg
    ctx.fillRect(b.plate.x, b.plate.y, b.plate.w, b.plate.h)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(await loadImage(logo.src), b.x, b.y, b.w, b.h)
  }
  ctx.restore()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được ảnh PNG.'))), 'image/png'),
  )
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 1
  const v = parseInt(m[1], 16)
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function scanWarnings(model: QRModel | null, style: QRStyle): string[] {
  const out: string[] = []
  const fg = luminance(style.fg)
  const bg = luminance(style.bg)
  if (bg < 0.4) out.push('Nền tối làm mã khó quét. Nên dùng nền trắng hoặc màu sáng.')
  if (bg <= fg) out.push('Màu mã phải đậm hơn màu nền, nếu không nhiều máy sẽ không quét được.')
  else if ((bg + 0.05) / (fg + 0.05) < 4) out.push('Độ tương phản giữa màu mã và nền thấp, mã có thể khó quét.')
  if (model) {
    if (model.version >= 20) out.push('Mã rất dày đặc, khó quét ổn định. Hãy rút ngắn nội dung hoặc giảm mức sửa lỗi.')
    else if (model.version >= 13) out.push('Mã khá dày. Nên in hoặc hiển thị ở kích thước lớn để quét dễ hơn.')
    if (model.logoBox && style.ec !== 'H') out.push('Có logo ở giữa: nên chọn mức sửa lỗi H để mã vẫn quét được.')
  }
  return out
}
