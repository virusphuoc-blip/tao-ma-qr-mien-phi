import { facebookText } from './contact'
import { attr, canvasBlob, drawQR, loadImage, qrInner, type Logo, type QRModel, type QRStyle } from './render'
import { onColor, shade } from './styles'

export type Template = 'standard' | 'bank' | 'minimal' | 'business' | 'tree' | 'treeA6' | 'luxury' | 'gradient' | 'tet' | 'nature' | 'ocean' | 'royal' | 'midautumn' | 'plain'

export const TEMPLATES: { id: Template; label: string; hint: string }[] = [
  { id: 'standard', label: 'Chuẩn', hint: 'Thẻ trắng, logo ngân hàng phía trên' },
  { id: 'bank', label: 'Thẻ ngân hàng', hint: 'Nền màu thương hiệu, mã trên khung trắng' },
  { id: 'minimal', label: 'Tối giản', hint: 'Không nền, chỉ tên ngân hàng nhỏ' },
  { id: 'business', label: 'Doanh nghiệp', hint: 'Đầu thẻ màu thương hiệu, NV hỗ trợ trong khung riêng' },
  { id: 'tree', label: 'Cây Vàng Lộc Phát', hint: 'Nền vàng, cây tiền vàng bên trái, mã trên khung trắng bên phải' },
  { id: 'treeA6', label: 'Cây Kim Tiền — A6 dọc', hint: 'Khổ A6 dọc 105 × 148 mm để in; cùng cây vàng với mẫu Cây Vàng Lộc Phát (khổ ngang)' },
  { id: 'luxury', label: 'Vàng Sang Trọng', hint: 'Nền nâu đen, chữ và viền vàng' },
  { id: 'gradient', label: 'Gradient Hiện Đại', hint: 'Nền chuyển màu xanh ngọc sang tím' },
  { id: 'tet', label: 'Tết Lộc Phát', hint: 'Đỏ và vàng ngày Tết, đèn lồng và đồng tiền vàng' },
  { id: 'nature', label: 'Xanh Lá Thiên Nhiên', hint: 'Nền xanh lá, họa tiết tre và lá' },
  { id: 'ocean', label: 'Biển Xanh', hint: 'Nền xanh biển, họa tiết sóng' },
  { id: 'royal', label: 'Tím Hoàng Gia', hint: 'Nền tím đậm, chữ và viền vàng' },
  { id: 'midautumn', label: 'Trung Thu', hint: 'Cam đỏ ấm, đèn lồng và trăng rằm' },
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
  brand: { name: string; primary: string; accent: string; logo?: Logo; tagline?: string; fullName?: string }
  /** số tài khoản (mẫu Cây Vàng in ở đầu khung mã) */
  account?: string
  /** logo VietQR + napas 247, chỉ dùng cho mã chuyển khoản */
  marks?: { vietqr: Logo; napas: Logo }
  /** dòng hiển thị dưới mã (không nằm trong payload) */
  title?: string
  subtitle?: string
  amount?: string
  staff: Staff
}

type Weight = 400 | 600 | 700
type Node =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill: string; stroke?: string; sw?: number }
  | { t: 'grad'; x: number; y: number; w: number; h: number; r: number; from: string; to: string }
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number }
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
export const BODY_SIZE = 40
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
  if (measure(text, scaled, weight) <= maxW + 0.5) return { text, size: Math.floor(scaled) }
  let out = text
  while (out.length > 4 && measure(out + '…', scaled, weight) > maxW) out = out.slice(0, -1)
  return { text: out === text ? text : out.trimEnd() + '…', size: Math.floor(scaled) }
}

export const STAFF_LABEL = 'NV hỗ trợ:'
/** cỡ chữ thông tin cán bộ so với cỡ chữ nội dung thẻ */
export const STAFF_SCALE = 0.65

/** "NV hỗ trợ: Tên — Chi nhánh — SĐT"; trường trống bị bỏ, trống hết thì không có dòng nào. Quá dài thì tách 2 dòng. */
export function staffLines(staff: Staff, maxW = Infinity, size = 26): string[] {
  const parts = [staff.name, staff.branch, staff.phone].map((v) => v.trim()).filter(Boolean)
  if (!parts.length) return []
  const line = `${STAFF_LABEL} ${parts.join(' — ')}`
  if (parts.length === 1 || measure(line, size, 600) <= maxW) return [line]
  return [`${STAFF_LABEL} ${parts[0]}`, parts.slice(1).join(' — ')]
}

function logoBox(logo: Logo, maxW: number, maxH: number) {
  const s = Math.min(maxW / logo.width, maxH / logo.height)
  return { w: logo.width * s, h: logo.height * s }
}

const n1 = (v: number) => Math.round(v * 10) / 10
const circle = (cx: number, cy: number, r: number) => `M${n1(cx - r)} ${n1(cy)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(2 * r)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(-2 * r)} 0Z`
const GOLD = '#F5C542'
const GOLD_LIGHT = '#FFE58A'
const GOLD_DARK = '#B07D12'
const BROWN = '#4A2A12'

/** đồng tiền vàng lỗ vuông */
function coin(cx: number, cy: number, r: number): Node[] {
  const k = r * 0.26
  return [
    { t: 'path', d: circle(cx, cy, r), fill: GOLD_DARK },
    { t: 'path', d: circle(cx, cy, r * 0.84), fill: GOLD },
    { t: 'path', d: circle(cx, cy, r * 0.62), fill: GOLD_LIGHT },
    { t: 'path', d: `M${n1(cx - k)} ${n1(cy - k)}h${n1(2 * k)}v${n1(2 * k)}h${n1(-2 * k)}Z`, fill: GOLD_DARK },
  ]
}

/** cây tiền vàng: chậu vàng, thân cành vàng sẫm, lá là các đồng tiền vàng. Vẽ hoàn toàn bằng path. */
export function moneyTree(x: number, y: number, w: number, h: number): Node[] {
  const X = (u: number) => n1(x + u * w)
  const Y = (v: number) => n1(y + v * h)
  const nodes: Node[] = []
  const trunk = Math.max(10, w * 0.05)
  // chậu
  nodes.push({ t: 'path', d: `M${X(0.3)} ${Y(0.84)}L${X(0.7)} ${Y(0.84)}L${X(0.64)} ${Y(1)}L${X(0.36)} ${Y(1)}Z`, fill: GOLD_DARK })
  nodes.push({ t: 'path', d: `M${X(0.34)} ${Y(0.87)}L${X(0.66)} ${Y(0.87)}L${X(0.62)} ${Y(0.98)}L${X(0.38)} ${Y(0.98)}Z`, fill: GOLD })
  nodes.push({ t: 'rect', x: x + 0.26 * w, y: y + 0.81 * h, w: 0.48 * w, h: 0.045 * h, r: 0.02 * h, fill: GOLD_LIGHT, stroke: GOLD_DARK, sw: 3 })
  // thân + cành
  const limb = (d: string, k: number): Node => ({ t: 'path', d, stroke: '#8A5A12', sw: trunk * k })
  nodes.push(limb(`M${X(0.5)} ${Y(0.82)}C${X(0.46)} ${Y(0.66)} ${X(0.56)} ${Y(0.56)} ${X(0.5)} ${Y(0.34)}`, 1))
  nodes.push(limb(`M${X(0.5)} ${Y(0.62)}C${X(0.36)} ${Y(0.54)} ${X(0.26)} ${Y(0.5)} ${X(0.18)} ${Y(0.36)}`, 0.6))
  nodes.push(limb(`M${X(0.52)} ${Y(0.58)}C${X(0.66)} ${Y(0.52)} ${X(0.76)} ${Y(0.46)} ${X(0.82)} ${Y(0.34)}`, 0.6))
  nodes.push(limb(`M${X(0.5)} ${Y(0.46)}C${X(0.42)} ${Y(0.36)} ${X(0.36)} ${Y(0.28)} ${X(0.32)} ${Y(0.16)}`, 0.5))
  nodes.push(limb(`M${X(0.51)} ${Y(0.44)}C${X(0.6)} ${Y(0.34)} ${X(0.64)} ${Y(0.26)} ${X(0.68)} ${Y(0.16)}`, 0.5))
  // tán lá = đồng tiền (vị trí cố định để ảnh xuất ra luôn giống nhau)
  const leaves: [number, number, number][] = [
    [0.5, 0.08, 1.1], [0.32, 0.12, 1], [0.68, 0.12, 1], [0.18, 0.22, 0.9], [0.82, 0.22, 0.9], [0.42, 0.2, 0.95], [0.59, 0.2, 0.95],
    [0.1, 0.36, 0.9], [0.9, 0.36, 0.9], [0.27, 0.32, 1], [0.73, 0.32, 1], [0.5, 0.28, 1.05], [0.2, 0.47, 0.85], [0.8, 0.46, 0.85],
    [0.37, 0.42, 0.9], [0.63, 0.41, 0.9], [0.3, 0.57, 0.75], [0.71, 0.56, 0.75],
  ]
  const r = Math.min(w * 0.085, h * 0.075)
  for (const [u, v, k] of leaves) nodes.push(...coin(x + u * w, y + v * h, r * k))
  // vài đồng tiền rơi cạnh chậu
  nodes.push(...coin(x + 0.16 * w, y + 0.97 * h, r * 0.7), ...coin(x + 0.84 * w, y + 0.97 * h, r * 0.7), ...coin(x + 0.25 * w, y + 0.985 * h, r * 0.55))
  return nodes
}

function lantern(cx: number, top: number, s: number): Node[] {
  const cy = top + 150 * s
  const rx = 46 * s
  const ry = 56 * s
  const body = `M${n1(cx - rx)} ${n1(cy)}a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(2 * rx)} 0a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(-2 * rx)} 0Z`
  const rib = (k: number) => `M${n1(cx)} ${n1(cy - ry)}C${n1(cx + rx * k)} ${n1(cy - ry * 0.5)} ${n1(cx + rx * k)} ${n1(cy + ry * 0.5)} ${n1(cx)} ${n1(cy + ry)}`
  return [
    { t: 'path', d: `M${n1(cx)} ${n1(top)}V${n1(cy - ry)}`, stroke: GOLD, sw: 4 * s },
    { t: 'path', d: body, fill: '#E5262D', stroke: GOLD, sw: 4 * s },
    { t: 'path', d: rib(0.75) + rib(-0.75) + rib(0), stroke: GOLD, sw: 2.5 * s },
    { t: 'rect', x: cx - 24 * s, y: cy - ry - 8 * s, w: 48 * s, h: 14 * s, r: 5 * s, fill: GOLD },
    { t: 'rect', x: cx - 24 * s, y: cy + ry - 6 * s, w: 48 * s, h: 14 * s, r: 5 * s, fill: GOLD },
    { t: 'path', d: `M${n1(cx)} ${n1(cy + ry + 8 * s)}v${n1(46 * s)}M${n1(cx - 9 * s)} ${n1(cy + ry + 8 * s)}v${n1(34 * s)}M${n1(cx + 9 * s)} ${n1(cy + ry + 8 * s)}v${n1(34 * s)}`, stroke: GOLD, sw: 3 * s },
  ]
}

/** chiếc lá: gốc tại (x, y), dài len, nghiêng deg độ */
function leaf(x: number, y: number, len: number, deg: number, fill: string): Node {
  const a = (deg * Math.PI) / 180
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const mx = x + (dx * len) / 2
  const my = y + (dy * len) / 2
  const k = len * 0.3
  return { t: 'path', d: `M${n1(x)} ${n1(y)}Q${n1(mx - dy * k)} ${n1(my + dx * k)} ${n1(x + dx * len)} ${n1(y + dy * len)}Q${n1(mx + dy * k)} ${n1(my - dx * k)} ${n1(x)} ${n1(y)}Z`, fill }
}

/** thân tre dọc mép thẻ kèm vài chiếc lá */
function bamboo(x: number, H: number, dir: 1 | -1): Node[] {
  const out: Node[] = [{ t: 'rect', x: x - 11, y: 0, w: 22, h: H, fill: 'rgba(255,255,255,0.13)' }]
  for (let y = 150, i = 0; y < H; y += 210, i++) {
    out.push({ t: 'rect', x: x - 14, y: y - 4, w: 28, h: 8, r: 4, fill: 'rgba(255,255,255,0.22)' })
    if (i % 2 === 0) out.push(leaf(x, y, 92, dir > 0 ? -28 : 208, 'rgba(255,255,255,0.16)'), leaf(x, y, 70, dir > 0 ? 24 : 156, 'rgba(255,255,255,0.12)'))
  }
  return out
}

/** dải sóng ngang thẻ, đỉnh sóng quanh y, tô xuống tới bottom */
function wave(W: number, y: number, bottom: number, amp: number, shift: number, fill: string): Node {
  let d = `M${n1(-shift)} ${n1(y)}q62.5 ${n1(-amp)} 125 0`
  for (let x = 125 - shift; x < W; x += 125) d += 't125 0'
  return { t: 'path', d: `${d}V${n1(bottom)}H${n1(-shift)}Z`, fill }
}

interface PanelTheme {
  from: string
  to: string
  on: string
  line: string
  strong: string
  staffW: number
  deco?: (W: number, H: number) => Node[]
}
function panelTheme(template: Template, brand: CardInput['brand'], strong: string): PanelTheme | undefined {
  if (template === 'bank') return { from: brand.primary, to: shade(brand.primary, -0.38), on: onColor(brand.primary), line: brand.accent, strong, staffW: 880 }
  if (template === 'luxury')
    return {
      from: '#2E1B0E',
      to: '#0C0705',
      on: '#EBCB73',
      line: '#EBCB73',
      strong: '#8A6510',
      staffW: 840,
      deco: (W, H) => [
        { t: 'rect', x: 16, y: 16, w: W - 32, h: H - 32, r: 36, fill: 'none', stroke: '#D4AF37', sw: 4 },
        { t: 'rect', x: 28, y: 28, w: W - 56, h: H - 56, r: 28, fill: 'none', stroke: '#8A6A1E', sw: 1.5 },
      ],
    }
  if (template === 'gradient') return { from: '#0E9AA7', to: '#6A2BD9', on: '#FFFFFF', line: '#FDE68A', strong: '#5B21B6', staffW: 880 }
  if (template === 'tet')
    return {
      from: '#D8161F',
      to: '#8C0A13',
      on: '#FFE08A',
      line: GOLD,
      strong: '#B3121B',
      staffW: 700,
      deco: (W, H) => [
        ...lantern(78, 0, 0.8),
        ...lantern(W - 78, 0, 0.8),
        ...coin(64, H - 62, 34),
        ...coin(112, H - 40, 22),
        ...coin(W - 64, H - 62, 34),
        ...coin(W - 112, H - 40, 22),
      ],
    }
  if (template === 'nature')
    return {
      from: '#43B36B',
      to: '#0C5A38',
      on: '#FFFFFF',
      line: '#D9F99D',
      strong: '#15803D',
      staffW: 840,
      deco: (W, H) => [
        ...bamboo(34, H, 1),
        ...bamboo(W - 34, H, -1),
        leaf(150, 70, 120, 150, 'rgba(255,255,255,0.14)'),
        leaf(150, 70, 96, 195, 'rgba(255,255,255,0.1)'),
        leaf(W - 150, 70, 120, 30, 'rgba(255,255,255,0.14)'),
        leaf(W - 150, 70, 96, -15, 'rgba(255,255,255,0.1)'),
      ],
    }
  if (template === 'ocean')
    return {
      from: '#22A7E8',
      to: '#0A3A8A',
      on: '#FFFFFF',
      line: '#A5F3FC',
      strong: '#0B5CAD',
      staffW: 880,
      deco: (W, H) => [
        wave(W, 110, 150, 34, 0, 'rgba(255,255,255,0.1)'),
        wave(W, 70, 110, 26, 60, 'rgba(255,255,255,0.1)'),
        wave(W, H - 150, H, 40, 30, 'rgba(255,255,255,0.1)'),
        wave(W, H - 100, H, 34, 90, 'rgba(255,255,255,0.1)'),
        wave(W, H - 52, H, 26, 0, 'rgba(255,255,255,0.12)'),
      ],
    }
  if (template === 'royal')
    return {
      from: '#56208C',
      to: '#1C0A3A',
      on: '#EBCB73',
      line: '#EBCB73',
      strong: '#5B21A6',
      staffW: 840,
      deco: (W, H) => [
        { t: 'rect', x: 16, y: 16, w: W - 32, h: H - 32, r: 36, fill: 'none', stroke: '#D4AF37', sw: 4 },
        { t: 'rect', x: 28, y: 28, w: W - 56, h: H - 56, r: 28, fill: 'none', stroke: '#9C7BD6', sw: 1.5 },
        ...[
          [70, 70],
          [W - 70, 70],
          [70, H - 70],
          [W - 70, H - 70],
        ].map(([x, y]): Node => ({ t: 'path', d: `M${x} ${y - 20}L${x + 20} ${y}L${x} ${y + 20}L${x - 20} ${y}Z`, fill: '#D4AF37' })),
      ],
    }
  if (template === 'midautumn')
    return {
      from: '#EE6A1F',
      to: '#9A1A12',
      on: '#FFE9A8',
      line: GOLD,
      strong: '#C2410C',
      staffW: 880,
      deco: (W) => [
        { t: 'path', d: circle(W - 120, 130, 92), fill: 'rgba(255,236,170,0.22)' },
        { t: 'path', d: circle(W - 120, 130, 70), fill: '#FFE9A8' },
        { t: 'path', d: circle(W - 142, 112, 12) + circle(W - 100, 150, 9) + circle(W - 112, 104, 6), fill: 'rgba(214,158,46,0.45)' },
        { t: 'path', d: `M${W - 250} 222q22 -30 52 -12q26 -26 58 -4q34 -8 40 16Z`, fill: 'rgba(255,255,255,0.2)' },
        ...lantern(96, 0, 0.9),
        ...lantern(182, 0, 0.5),
        ...[
          [250, 60],
          [300, 130],
          [W - 280, 56],
        ].map(([x, y]): Node => ({ t: 'path', d: `M${x} ${y - 10}L${x + 3} ${y - 3}L${x + 10} ${y}L${x + 3} ${y + 3}L${x} ${y + 10}L${x - 3} ${y + 3}L${x - 10} ${y}L${x - 3} ${y - 3}Z`, fill: '#FFE9A8' })),
      ],
    }
}

/** hàng logo VietQR + napas 247 căn giữa quanh cx; trả về chiều cao đã dùng */
function marksRow(nodes: Node[], marks: NonNullable<CardInput['marks']>, cx: number, y: number, h: number): void {
  const a = logoBox(marks.vietqr, 400, h)
  const b = logoBox(marks.napas, 400, h * 0.62)
  const gap = h * 0.7
  const x0 = cx - (a.w + gap + b.w) / 2
  nodes.push({ t: 'img', x: x0, y: y + (h - a.h) / 2, w: a.w, h: a.h, src: marks.vietqr.src })
  nodes.push({ t: 'rect', x: x0 + a.w + gap / 2 - 1, y: y + h * 0.15, w: 2, h: h * 0.7, fill: '#D4D4D4' })
  nodes.push({ t: 'img', x: x0 + a.w + gap, y: y + (h - b.h) / 2, w: b.w, h: b.h, src: marks.napas.src })
}

export function layoutCard(input: CardInput): Card {
  const { template, brand } = input
  const nodes: Node[] = []
  const W = CARD_W
  const cx = W / 2
  const body = template === 'minimal' ? 34 : BODY_SIZE
  const staffSize = Math.round(body * STAFF_SCALE)
  const staff = staffLines(input.staff, template === 'business' ? 790 : template === 'tet' ? 700 : 840, staffSize)
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

  const theme = panelTheme(template, brand, strong)
  if (template === 'treeA6') {
    // khổ A6 dọc 105 × 148 mm: chiều cao cố định, nội dung căn giữa theo chiều dọc
    const AW = 1050
    const AH = 1480
    const acx = AW / 2
    // lề an toàn 7 mm (70 đơn vị) mỗi cạnh để in tràn lề không bị cắt
    const SAFE = 70
    const pw = 600
    const px = AW - SAFE - pw
    const pcx = px + pw / 2
    const build = (y0: number) => {
      nodes.length = 0
      nodes.push({ t: 'grad', x: 0, y: 0, w: AW, h: AH, r: 44, from: '#FBE9A6', to: '#D9A21B' })
      nodes.push({ t: 'rect', x: 5, y: 5, w: AW - 10, h: AH - 10, r: 40, fill: 'none', stroke: BROWN, sw: 6 })
      y = y0
      if (brand.logo) {
        const l = logoBox(brand.logo, 340, 76)
        nodes.push({ t: 'rect', x: acx - l.w / 2 - 28, y, w: l.w + 56, h: 108, r: 26, fill: '#FFFFFF' })
        nodes.push({ t: 'img', x: acx - l.w / 2, y: y + 54 - l.h / 2, w: l.w, h: l.h, src: brand.logo.src })
        y += 108 + 20
      }
      const name = brand.fullName ?? brand.name
      const words = name.split(' ')
      if (measure(name, 40, 700) <= 890 || words.length < 4) text(name, acx, 46, 700, BROWN, 'middle', 890, 0.5)
      else {
        let cut = 1
        const half = measure(name, 42, 700) / 2
        for (let i = 1; i < words.length; i++)
          if (Math.abs(measure(words.slice(0, i).join(' '), 42, 700) - half) < Math.abs(measure(words.slice(0, cut).join(' '), 42, 700) - half)) cut = i
        text(words.slice(0, cut).join(' '), acx, 42, 700, BROWN, 'middle', 890, 0.3)
        text(words.slice(cut).join(' '), acx, 42, 700, BROWN, 'middle', 890, 0.5)
      }
      nodes.push({ t: 'rect', x: acx - 80, y, w: 160, h: 8, r: 4, fill: BROWN })
      y += 8 + 30
      const top = y
      const panel: Node = { t: 'rect', x: px, y: top, w: pw, h: 0, r: 36, fill: '#FFFFFF', stroke: '#C99A1E', sw: 3 }
      nodes.push(panel)
      y += 26
      if (input.account) text(input.account, pcx, body, 700, '#A97600', 'middle', pw - 60, 0.35)
      if (input.title) text(input.title, pcx, body, 700, BROWN, 'middle', pw - 60, 0.4)
      y += 6
      nodes.push({ t: 'qr', x: px + 26, y, size: pw - 52 })
      y += pw - 52 + 14
      if (input.amount) text(input.amount, pcx, body, 700, BROWN, 'middle', pw - 60, 0.4)
      if (input.marks) {
        marksRow(nodes, input.marks, pcx, y, 60)
        y += 60
      }
      y += 26
      panel.h = y - top
      const treeH = Math.min(y - top, 720)
      nodes.push(...moneyTree(SAFE, y - treeH, 290, treeH - 6))
      if (staff.length) {
        y += 30
        for (const line of staff) text(line, acx, staffSize, 600, BROWN, 'middle', AW - 2 * SAFE)
        y -= 4
      }
      return y
    }
    const used = build(0)
    build(Math.max(SAFE, (AH - used) / 2))
    return { w: AW, h: AH, nodes }
  }
  if (template === 'tree') {
    const bg: Node = { t: 'grad', x: 0, y: 0, w: W, h: 0, r: 44, from: '#FBE9A6', to: '#D9A21B' }
    const border: Node = { t: 'rect', x: 5, y: 5, w: W - 10, h: 0, r: 40, fill: 'none', stroke: BROWN, sw: 6 }
    nodes.push(bg, border)
    // khung mã bên phải
    const px = 430
    const pw = 520
    const pcx = px + pw / 2
    const panel: Node = { t: 'rect', x: px, y: 46, w: pw, h: 0, r: 36, fill: '#FFFFFF', stroke: '#C99A1E', sw: 3 }
    nodes.push(panel)
    y = 46 + 26
    if (input.account) text(input.account, pcx, body, 700, '#A97600', 'middle', pw - 60, 0.35)
    if (input.title) text(input.title, pcx, body, 700, BROWN, 'middle', pw - 60, 0.4)
    y += 6
    nodes.push({ t: 'qr', x: px + 40, y, size: pw - 80 })
    y += pw - 80 + 12
    if (input.amount) text(input.amount, pcx, body, 700, BROWN, 'middle', pw - 60, 0.4)
    if (input.marks) {
      marksRow(nodes, input.marks, pcx, y, 56)
      y += 56
    }
    y += 26
    panel.h = y - 46
    const bottom = y
    // cột trái: logo, khẩu hiệu / tên ngân hàng, cây vàng
    y = 52
    if (brand.logo) {
      const l = logoBox(brand.logo, 280, 64)
      nodes.push({ t: 'rect', x: 220 - l.w / 2 - 24, y, w: l.w + 48, h: 92, r: 24, fill: '#FFFFFF' })
      nodes.push({ t: 'img', x: 220 - l.w / 2, y: y + 46 - l.h / 2, w: l.w, h: l.h, src: brand.logo.src })
      y += 92 + 18
    }
    text(brand.tagline ?? brand.name, 220, brand.tagline ? 22 : 34, 700, BROWN, 'middle', 370, 0.5)
    y += 10
    nodes.push(...moneyTree(60, y, 320, bottom - y - 6))
    y = bottom
    if (staff.length) {
      y += 24
      for (const line of staff) text(line, cx, staffSize, 600, BROWN, 'middle', 900)
      y -= 4
    }
    y += 40
    bg.h = y
    border.h = y - 10
  } else if (theme) {
    const on = theme.on
    nodes.push({ t: 'grad', x: 0, y: 0, w: W, h: 0, r: 48, from: theme.from, to: theme.to })
    y = 60
    if (brand.logo) {
      const l = logoBox(brand.logo, 400, 96)
      nodes.push({ t: 'rect', x: cx - l.w / 2 - 36, y, w: l.w + 72, h: 140, r: 32, fill: '#FFFFFF' })
      nodes.push({ t: 'img', x: cx - l.w / 2, y: y + 70 - l.h / 2, w: l.w, h: l.h, src: brand.logo.src })
      y += 140 + 26
      const name = brand.fullName ?? brand.name
      const words = name.split(' ')
      if (measure(name, 37, 700) <= 840 || words.length < 4) text(name, cx, 46, 700, on, 'middle', 840, 0.5)
      else {
        // tên đầy đủ quá dài: tách hai dòng gần bằng nhau thay vì thu chữ quá nhỏ
        let cut = 1
        for (let i = 1; i < words.length; i++)
          if (Math.abs(measure(words.slice(0, i).join(' '), 40, 700) - measure(name, 40, 700) / 2) < Math.abs(measure(words.slice(0, cut).join(' '), 40, 700) - measure(name, 40, 700) / 2)) cut = i
        text(words.slice(0, cut).join(' '), cx, 40, 700, on, 'middle', 840, 0.3)
        text(words.slice(cut).join(' '), cx, 40, 700, on, 'middle', 840, 0.5)
      }
    } else {
      y += 20
      text(brand.name, cx, 76, 700, on, 'middle', 840, 0.5)
    }
    nodes.push({ t: 'rect', x: cx - 80, y, w: 160, h: 8, r: 4, fill: theme.line })
    y += 8 + 36
    const top = y
    const panel: Node = { t: 'rect', x: 90, y: top, w: 820, h: 0, r: 44, fill: '#FFFFFF' }
    nodes.push(panel)
    y += 40
    nodes.push({ t: 'qr', x: 130, y, size: 740 })
    y += 740 + 16
    info(body, INK, GRAY, theme.strong, 740)
    y += 24
    panel.h = y - top
    if (staff.length) {
      y += 30
      for (const line of staff) text(line, cx, staffSize, 600, on, 'middle', theme.staffW)
    }
    y += 56
    ;(nodes[0] as { h: number }).h = y
    if (theme.deco) nodes.splice(1, 0, ...theme.deco(W, y))
  } else if (template === 'minimal') {
    y = 24
    text(brand.name, cx, 34, 600, GRAY, 'middle', 860, 0.6)
    nodes.push({ t: 'qr', x: 70, y, size: 860 })
    y += 860 + 14
    info(body, INK, GRAY, INK, 860)
    if (staff.length) {
      y += 14
      for (const line of staff) text(line, cx, staffSize, 600, GRAY, 'middle', 900)
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
    info(body, INK, GRAY, strong, 880)
    if (staff.length) {
      y += 26
      const top = y
      const box: Node = { t: 'rect', x: 60, y: top, w: 880, h: 0, r: 26, fill: shade(brand.primary, 0.9) }
      const bar: Node = { t: 'rect', x: 60, y: top, w: 14, h: 0, r: 7, fill: brand.accent }
      nodes.push(box, bar)
      y += 22
      for (const line of staff) text(line, 104, staffSize, 600, INK, 'start', 800)
      y += 12
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
    info(body, INK, GRAY, strong, 860)
    if (staff.length) {
      y += 20
      nodes.push({ t: 'rect', x: 110, y, w: 780, h: 4, r: 2, fill: brand.accent })
      y += 4 + 22
      for (const line of staff) text(line, cx, staffSize, 600, INK, 'middle', 880)
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
          return `<rect x="${r2(nd.x)}" y="${r2(nd.y)}" width="${r2(nd.w)}" height="${r2(nd.h)}"${nd.r ? ` rx="${nd.r}"` : ''} fill="${nd.fill}"${nd.stroke ? ` stroke="${nd.stroke}" stroke-width="${nd.sw ?? 2}"` : ''}/>`
        case 'path':
          return `<path d="${nd.d}" fill="${nd.fill ?? 'none'}"${nd.stroke ? ` stroke="${nd.stroke}" stroke-width="${r2(nd.sw ?? 2)}" stroke-linecap="round"` : ''}/>`
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
      if (nd.fill !== 'none') {
        ctx.fillStyle = nd.fill
        ctx.fill()
      }
      if (nd.stroke) {
        ctx.strokeStyle = nd.stroke
        ctx.lineWidth = nd.sw ?? 2
        ctx.stroke()
      }
    } else if (nd.t === 'path') {
      const path = new Path2D(nd.d)
      if (nd.fill) {
        ctx.fillStyle = nd.fill
        ctx.fill(path)
      }
      if (nd.stroke) {
        ctx.strokeStyle = nd.stroke
        ctx.lineWidth = nd.sw ?? 2
        ctx.lineCap = 'round'
        ctx.stroke(path)
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

export type BizTemplate = 'lpbank' | 'luxury' | 'blue' | 'lotus' | 'emerald' | 'silver'
export const BIZ_TEMPLATES: { id: BizTemplate; label: string }[] = [
  { id: 'lpbank', label: 'LPBank' },
  { id: 'luxury', label: 'Vàng Sang Trọng' },
  { id: 'blue', label: 'Xanh Dương Doanh Nhân' },
  { id: 'lotus', label: 'Hồng Sen Nhẹ Nhàng' },
  { id: 'emerald', label: 'Xanh Ngọc Lục Bảo' },
  { id: 'silver', label: 'Xám Bạc Tối Giản' },
]
export interface BizInfo {
  name: string
  title: string
  branch: string
  phone: string
  zalo: string
  email: string
  facebook: string
}
export const EMPTY_BIZ: BizInfo = { name: '', title: '', branch: '', phone: '', zalo: '', email: '', facebook: '' }
export const BIZ_W = 1050
export const BIZ_H = 600

interface BizTheme {
  from: string
  to: string
  name: string
  title: string
  line: string
  caption: string
  stroke: string
  deco: (W: number, H: number) => Node[]
}
/** các mẫu card visit trang trí (màu tự chọn, không phải màu thương hiệu) */
const BIZ_THEMES: Record<Exclude<BizTemplate, 'lpbank'>, BizTheme> = {
  luxury: {
    from: '#2E1B0E',
    to: '#0C0705',
    name: '#EBCB73',
    title: '#D4AF37',
    line: '#F3E3B0',
    caption: '#6B4E0F',
    stroke: '#D4AF37',
    deco: (W, H) => [
      { t: 'rect', x: 14, y: 14, w: W - 28, h: H - 28, r: 20, fill: 'none', stroke: '#D4AF37', sw: 3 },
      { t: 'rect', x: 24, y: 24, w: W - 48, h: H - 48, r: 14, fill: 'none', stroke: '#8A6A1E', sw: 1.5 },
      { t: 'rect', x: 64, y: 84, w: 90, h: 6, r: 3, fill: '#D4AF37' },
    ],
  },
  blue: {
    from: '#1F56B3',
    to: '#081B45',
    name: '#FFFFFF',
    title: '#9CC7FF',
    line: '#E6EEFB',
    caption: '#12397F',
    stroke: '#5AA9FF',
    deco: (W, H) => [
      { t: 'path', d: `M${W - 330} 0H${W - 210}L${W - 470} ${H}H${W - 590}Z`, fill: 'rgba(255,255,255,0.05)' },
      { t: 'path', d: `M${W - 170} 0H${W - 110}L${W - 370} ${H}H${W - 430}Z`, fill: 'rgba(255,255,255,0.05)' },
      { t: 'rect', x: 64, y: 84, w: 90, h: 6, r: 3, fill: '#5AA9FF' },
      { t: 'rect', x: 64, y: H - 46, w: W - 128, h: 2, fill: 'rgba(255,255,255,0.25)' },
    ],
  },
  lotus: {
    from: '#FFF5F8',
    to: '#F8C4D6',
    name: '#9D174D',
    title: '#D6336C',
    line: '#4A1D2F',
    caption: '#9D174D',
    stroke: '#EC8FB0',
    deco: (W, H) => [
      ...[-150, -120, -90, -60, -30].map((deg, i): Node => leaf(150, H + 6, i === 2 ? 190 : i % 2 ? 165 : 130, deg, 'rgba(219,39,119,0.13)')),
      ...[-140, -90, -40].map((deg): Node => leaf(W - 60, 0, 120, -deg, 'rgba(219,39,119,0.1)')),
      { t: 'rect', x: 64, y: 84, w: 90, h: 6, r: 3, fill: '#E86A9A' },
    ],
  },
  emerald: {
    from: '#12805F',
    to: '#032E20',
    name: '#F4E3A1',
    title: '#8FE3C0',
    line: '#E7F6EF',
    caption: '#0B5A41',
    stroke: '#D4AF37',
    deco: (W, H) => [
      { t: 'rect', x: 14, y: 14, w: W - 28, h: H - 28, r: 20, fill: 'none', stroke: '#D4AF37', sw: 2.5 },
      { t: 'path', d: `M0 ${H}L210 ${H - 150}L420 ${H}Z`, fill: 'rgba(255,255,255,0.05)' },
      { t: 'path', d: `M170 ${H}L340 ${H - 100}L510 ${H}Z`, fill: 'rgba(255,255,255,0.05)' },
      { t: 'path', d: 'M64 87l12 -12l12 12l-12 12Z', fill: '#D4AF37' },
      { t: 'rect', x: 98, y: 84, w: 70, h: 6, r: 3, fill: '#D4AF37' },
    ],
  },
  silver: {
    from: '#FAFAFB',
    to: '#C5CAD1',
    name: '#1F2937',
    title: '#6B7280',
    line: '#374151',
    caption: '#374151',
    stroke: '#9CA3AF',
    deco: (_W, H) => [
      { t: 'rect', x: 0, y: 0, w: 22, h: H, fill: '#374151' },
      { t: 'rect', x: 22, y: 0, w: 6, h: H, fill: '#9CA3AF' },
      { t: 'rect', x: 64, y: 84, w: 90, h: 6, r: 3, fill: '#374151' },
    ],
  },
}

/** Card visit tỉ lệ 3.5:2. Ô trống không in; caption là các dòng chú thích dưới mã, không có caption thì không có khung mã. */
export function layoutBizCard(template: BizTemplate, info: BizInfo, caption: string[] | undefined, logo?: Logo): Card {
  const hasQR = caption !== undefined
  const W = BIZ_W
  const H = BIZ_H
  const nodes: Node[] = []
  const theme = template === 'lpbank' ? undefined : BIZ_THEMES[template]
  const c = theme ?? { name: '#6D371A', title: '#C97A06', line: INK, caption: '#6D371A', stroke: '#F99D1C' }
  let y: number
  if (theme) {
    nodes.push({ t: 'grad', x: 0, y: 0, w: W, h: H, r: 28, from: theme.from, to: theme.to })
    nodes.push(...theme.deco(W, H))
    y = 120
  } else {
    nodes.push({ t: 'rect', x: 1, y: 1, w: W - 2, h: H - 2, r: 28, fill: '#FFFFFF', stroke: '#D4D4D4' })
    nodes.push({ t: 'rect', x: 0, y: 0, w: W, h: 124, r: 28, fill: '#6D371A' })
    nodes.push({ t: 'rect', x: 0, y: 60, w: W, h: 64, fill: '#6D371A' })
    nodes.push({ t: 'rect', x: 0, y: 124, w: W, h: 8, fill: '#F99D1C' })
    if (logo) {
      const l = logoBox(logo, 260, 56)
      nodes.push({ t: 'rect', x: 50, y: 24, w: l.w + 44, h: 78, r: 18, fill: '#FFFFFF' })
      nodes.push({ t: 'img', x: 72, y: 63 - l.h / 2, w: l.w, h: l.h, src: logo.src })
    }
    y = 164
  }
  const maxW = hasQR ? 600 : 920
  const text = (s: string, size: number, weight: Weight, fill: string, gap: number) => {
    const f = fit(s, maxW, size, weight)
    y += size
    nodes.push({ t: 'text', x: 64, y, text: f.text, size: f.size, weight, fill, anchor: 'start' })
    y += gap
  }
  const v = (k: keyof BizInfo) => info[k].trim()
  if (v('name')) text(v('name'), 62, 700, c.name, 14)
  if (v('title')) text(v('title'), 34, 600, c.title, 12)
  y += 18
  const lines: [string, string][] = [
    ['Chi nhánh', v('branch')],
    ['ĐT', v('phone')],
    ['Zalo', v('zalo')],
    ['Email', v('email')],
    ['Facebook', facebookText(info.facebook)],
  ]
  for (const [label, value] of lines) if (value) text(`${label}: ${value}`, 32, 400, c.line, 18)
  if (hasQR) {
    const size = 270
    const px = W - 64 - size - 40
    const py = theme ? 96 : 166
    const caps = caption
    nodes.push({ t: 'rect', x: px, y: py, w: size + 40, h: size + 54 + caps.length * 30, r: 24, fill: '#FFFFFF', stroke: c.stroke, sw: 3 })
    nodes.push({ t: 'qr', x: px + 20, y: py + 20, size })
    caps.forEach((line, i) => {
      const cap = fit(line, size, 24, 600)
      nodes.push({ t: 'text', x: px + 20 + size / 2, y: py + size + 58 + i * 30, text: cap.text, size: cap.size, weight: 600, fill: c.caption, anchor: 'middle' })
    })
  }
  return { w: W, h: H, nodes }
}
