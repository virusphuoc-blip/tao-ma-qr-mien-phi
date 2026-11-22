import { attr, canvasBlob, drawQR, loadImage, qrInner, type Logo, type QRModel, type QRStyle } from './render'
import { onColor, shade } from './styles'

export type Template = 'standard' | 'bank' | 'minimal' | 'business' | 'plain'

export const TEMPLATES: { id: Template; label: string; hint: string }[] = [
  { id: 'standard', label: 'Chuẩn', hint: 'Thẻ trắng, logo ngân hàng phía trên' },
  { id: 'bank', label: 'Thẻ ngân hàng', hint: 'Nền màu thương hiệu, mã trên khung trắng' },
  { id: 'minimal', label: 'Tối giản', hint: 'Không nền, chỉ tên ngân hàng nhỏ' },
  { id: 'business', label: 'Doanh nghiệp', hint: 'Nổi bật thông tin cán bộ phụ trách' },
  { id: 'plain', label: 'Chỉ mã QR', hint: 'Ảnh vuông chỉ có mã, như bản 1.0' },
]

export interface Staff {
  branch: string
  name: string
  phone: string
}
export const EMPTY_STAFF: Staff = { branch: '', name: '', phone: '' }

export interface CardInput {
  template: Template
  brand: { name: string; primary: string; accent: string; logo?: Logo }
  /** dòng hiển thị dưới mã (không nằm trong payload) */
  title?: string
  subtitle?: string
  amount?: string
  /** tên ngân hàng in ở dòng cán bộ */
  staffBank: string
  staff: Staff
}

type Weight = 400 | 600 | 700
type Node =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill: string; stroke?: string }
  | { t: 'grad'; x: number; y: number; w: number; h: number; r: number; from: string; to: string }
  | { t: 'img'; x: number; y: number; w: number; h: number; src: string }
  | { t: 'text'; x: number; y: number; text: string; size: number; weight: Weight; fill: string; anchor: 'start' | 'middle' | 'end' }
  | { t: 'qr'; x: number; y: number; size: number }

export interface Card {
  w: number
  h: number
  nodes: Node[]
}

export const CARD_W = 1000
const FONT = `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
const INK = '#1F1F1F'
const GRAY = '#525252'

let measureCtx: CanvasRenderingContext2D | null | undefined
function measure(text: string, size: number, weight: Weight): number {
  if (measureCtx === undefined) measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * size * (weight >= 600 ? 0.6 : 0.56)
  measureCtx.font = `${weight} ${size}px ${FONT}`
  return measureCtx.measureText(text).width
}

/** thu nhỏ cỡ chữ (tối đa 40%) rồi cắt bớt để chữ không tràn khỏi thẻ */
function fit(text: string, maxW: number, size: number, weight: Weight): { text: string; size: number } {
  const w = measure(text, size, weight)
  if (w <= maxW) return { text, size }
  const scaled = Math.max(size * 0.6, (size * maxW) / w)
  let out = text
  while (out.length > 4 && measure(out + '…', scaled, weight) > maxW) out = out.slice(0, -1)
  return { text: out === text ? text : out.trimEnd() + '…', size: Math.floor(scaled) }
}

/** Hai dòng thông tin cán bộ; trường trống bị bỏ hẳn. Trả về [] nếu không có trường nào. */
export function staffLines(staffBank: string, staff: Staff): string[] {
  const branch = staff.branch.trim()
  const name = staff.name.trim()
  const phone = staff.phone.trim()
  if (!branch && !name && !phone) return []
  return [[staffBank.trim(), branch].filter(Boolean).join(' – '), [name, phone].filter(Boolean).join(' · ')].filter(Boolean)
}

function logoBox(logo: Logo, maxW: number, maxH: number) {
  const s = Math.min(maxW / logo.width, maxH / logo.height)
  return { w: logo.width * s, h: logo.height * s }
}

export function layoutCard(input: CardInput): Card {
  const { template, brand } = input
  const nodes: Node[] = []
  const W = CARD_W
  const cx = W / 2
  const staff = staffLines(input.staffBank, input.staff)
  let y = 0

  const text = (s: string, x: number, size: number, weight: Weight, fill: string, anchor: 'start' | 'middle' | 'end', maxW: number, gap = 0.45) => {
    const f = fit(s, maxW, size, weight)
    y += size
    nodes.push({ t: 'text', x, y, text: f.text, size: f.size, weight, fill, anchor })
    y += size * gap
  }
  const info = (size: number, ink: string, gray: string, strong: string, maxW: number) => {
    if (input.title) text(input.title, cx, size * 1.1, 700, ink, 'middle', maxW)
    if (input.subtitle) text(input.subtitle, cx, size, 400, gray, 'middle', maxW)
    if (input.amount) text(input.amount, cx, size * 1.1, 700, strong, 'middle', maxW)
  }
  const strong = onColor(brand.primary) === '#FFFFFF' ? brand.primary : shade(brand.primary, -0.45)

  if (template === 'bank') {
    const on = onColor(brand.primary)
    nodes.push({ t: 'grad', x: 0, y: 0, w: W, h: 0, r: 48, from: brand.primary, to: shade(brand.primary, -0.38) })
    y = 60
    if (brand.logo) {
      const l = logoBox(brand.logo, 400, 96)
      nodes.push({ t: 'rect', x: cx - l.w / 2 - 36, y, w: l.w + 72, h: 140, r: 32, fill: '#FFFFFF' })
      nodes.push({ t: 'img', x: cx - l.w / 2, y: y + 70 - l.h / 2, w: l.w, h: l.h, src: brand.logo.src })
      y += 140 + 26
      text(brand.name, cx, 46, 700, on, 'middle', 840, 0.5)
    } else {
      y += 20
      text(brand.name, cx, 76, 700, on, 'middle', 840, 0.5)
    }
    nodes.push({ t: 'rect', x: cx - 80, y, w: 160, h: 8, r: 4, fill: brand.accent })
    y += 8 + 36
    const top = y
    const panel: Node = { t: 'rect', x: 90, y: top, w: 820, h: 0, r: 44, fill: '#FFFFFF' }
    nodes.push(panel)
    y += 40
    nodes.push({ t: 'qr', x: 130, y, size: 740 })
    y += 740 + 16
    info(40, INK, GRAY, strong, 740)
    y += 24
    panel.h = y - top
    if (staff.length) {
      y += 40
      text(staff[0], cx, 40, 700, on, 'middle', 880)
      if (staff[1]) text(staff[1], cx, 40, 600, on, 'middle', 880)
    }
    y += 56
    ;(nodes[0] as { h: number }).h = y
  } else if (template === 'minimal') {
    y = 24
    text(brand.name, cx, 34, 600, GRAY, 'middle', 860, 0.6)
    nodes.push({ t: 'qr', x: 70, y, size: 860 })
    y += 860 + 14
    info(34, INK, GRAY, INK, 860)
    if (staff.length) {
      y += 14
      for (const line of staff) text(line, cx, 32, 400, GRAY, 'middle', 900)
    }
    y += 20
  } else if (template === 'business') {
    const on = onColor(brand.primary)
    const bg: Node = { t: 'rect', x: 1, y: 1, w: W - 2, h: 0, r: 36, fill: '#FFFFFF', stroke: '#D4D4D4' }
    nodes.push(bg)
    nodes.push({ t: 'rect', x: 0, y: 0, w: W, h: 170, r: 36, fill: brand.primary })
    nodes.push({ t: 'rect', x: 0, y: 90, w: W, h: 80, fill: brand.primary })
    nodes.push({ t: 'rect', x: 0, y: 170, w: W, h: 10, fill: brand.accent })
    if (brand.logo) {
      const l = logoBox(brand.logo, 300, 80)
      nodes.push({ t: 'rect', x: 50, y: 30, w: l.w + 48, h: 110, r: 22, fill: '#FFFFFF' })
      nodes.push({ t: 'img', x: 74, y: 85 - l.h / 2, w: l.w, h: l.h, src: brand.logo.src })
      y = 62
      text(brand.name, 950, 44, 700, on, 'end', 950 - (50 + l.w + 48) - 40)
    } else {
      y = 55
      text(brand.name, 60, 60, 700, on, 'start', 880)
    }
    y = 180 + 36
    nodes.push({ t: 'qr', x: 170, y, size: 660 })
    y += 660 + 14
    info(40, INK, GRAY, strong, 880)
    if (staff.length) {
      y += 26
      const top = y
      const box: Node = { t: 'rect', x: 60, y: top, w: 880, h: 0, r: 26, fill: shade(brand.primary, 0.9) }
      const bar: Node = { t: 'rect', x: 60, y: top, w: 14, h: 0, r: 7, fill: brand.accent }
      nodes.push(box, bar)
      y += 30
      text('CÁN BỘ PHỤ TRÁCH', 110, 26, 600, GRAY, 'start', 800, 0.7)
      text(staff[0], 110, staff[1] ? 42 : 52, staff[1] ? 600 : 700, staff[1] ? INK : strong, 'start', 800)
      if (staff[1]) text(staff[1], 110, 54, 700, strong, 'start', 800)
      y += 16
      box.h = bar.h = y - top
    }
    y += 50
    bg.h = y - 2
  } else {
    const bg: Node = { t: 'rect', x: 1, y: 1, w: W - 2, h: 0, r: 48, fill: '#FFFFFF', stroke: '#D4D4D4' }
    nodes.push(bg)
    nodes.push({ t: 'rect', x: cx - 120, y: 0, w: 240, h: 12, r: 6, fill: brand.primary })
    y = 64
    if (brand.logo) {
      const l = logoBox(brand.logo, 460, 130)
      nodes.push({ t: 'img', x: cx - l.w / 2, y: y + 65 - l.h / 2, w: l.w, h: l.h, src: brand.logo.src })
      y += 130 + 30
    } else {
      y += 20
      text(brand.name, cx, 72, 700, strong, 'middle', 860, 0.6)
    }
    nodes.push({ t: 'qr', x: 110, y, size: 780 })
    y += 780 + 14
    info(40, INK, GRAY, strong, 860)
    if (staff.length) {
      y += 20
      nodes.push({ t: 'rect', x: 110, y, w: 780, h: 4, r: 2, fill: brand.accent })
      y += 4 + 28
      text(staff[0], cx, 38, 700, INK, 'middle', 880)
      if (staff[1]) text(staff[1], cx, 38, 400, INK, 'middle', 880)
    }
    y += 50
    bg.h = y - 2
  }
  return { w: W, h: Math.ceil(y), nodes }
}

const r2 = (v: number) => String(Math.round(v * 100) / 100)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function cardSVG(card: Card, model: QRModel, style: QRStyle, logo: Logo | undefined, width = 1024): string {
  const body = card.nodes
    .map((nd, i) => {
      switch (nd.t) {
        case 'rect':
          return `<rect x="${r2(nd.x)}" y="${r2(nd.y)}" width="${r2(nd.w)}" height="${r2(nd.h)}"${nd.r ? ` rx="${nd.r}"` : ''} fill="${nd.fill}"${nd.stroke ? ` stroke="${nd.stroke}" stroke-width="2"` : ''}/>`
        case 'grad':
          return (
            `<defs><linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${nd.from}"/><stop offset="1" stop-color="${nd.to}"/></linearGradient></defs>` +
            `<rect x="${r2(nd.x)}" y="${r2(nd.y)}" width="${r2(nd.w)}" height="${r2(nd.h)}" rx="${nd.r}" fill="url(#g${i})"/>`
          )
        case 'img':
          return `<image x="${r2(nd.x)}" y="${r2(nd.y)}" width="${r2(nd.w)}" height="${r2(nd.h)}" preserveAspectRatio="xMidYMid meet" href="${attr(nd.src)}"/>`
        case 'text':
          return `<text x="${r2(nd.x)}" y="${r2(nd.y)}" font-size="${nd.size}" font-weight="${nd.weight}" fill="${nd.fill}" text-anchor="${nd.anchor}">${esc(nd.text)}</text>`
        case 'qr':
          return `<svg x="${r2(nd.x)}" y="${r2(nd.y)}" width="${nd.size}" height="${nd.size}" viewBox="0 0 ${model.total} ${model.total}"${style.rounded ? '' : ' shape-rendering="crispEdges"'}>${qrInner(model, style, logo)}</svg>`
      }
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round((width * card.h) / card.w)}" viewBox="0 0 ${card.w} ${card.h}" font-family="${attr(FONT)}">` +
    body +
    `</svg>`
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 0) {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

export async function cardPNG(card: Card, model: QRModel, style: QRStyle, logo: Logo | undefined, width: number): Promise<Blob> {
  const scale = width / card.w
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round(card.h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  for (const nd of card.nodes) {
    if (nd.t === 'rect') {
      roundRect(ctx, nd.x, nd.y, nd.w, nd.h, nd.r)
      ctx.fillStyle = nd.fill
      ctx.fill()
      if (nd.stroke) {
        ctx.strokeStyle = nd.stroke
        ctx.lineWidth = 2
        ctx.stroke()
      }
    } else if (nd.t === 'grad') {
      const g = ctx.createLinearGradient(nd.x, nd.y, nd.x + nd.w, nd.y + nd.h)
      g.addColorStop(0, nd.from)
      g.addColorStop(1, nd.to)
      roundRect(ctx, nd.x, nd.y, nd.w, nd.h, nd.r)
      ctx.fillStyle = g
      ctx.fill()
    } else if (nd.t === 'img') {
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(await loadImage(nd.src), nd.x, nd.y, nd.w, nd.h)
    } else if (nd.t === 'text') {
      ctx.font = `${nd.weight} ${nd.size}px ${FONT}`
      ctx.textAlign = nd.anchor === 'middle' ? 'center' : nd.anchor
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = nd.fill
      ctx.fillText(nd.text, nd.x, nd.y)
    } else {
      await drawQR(ctx, model, style, logo, nd.x, nd.y, nd.size)
    }
  }
  return canvasBlob(canvas)
}
