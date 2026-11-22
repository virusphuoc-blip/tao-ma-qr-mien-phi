// Màu và logo lấy trực tiếp từ website chính thức của từng tổ chức (trường `source`), đối chiếu ngày 2026-11-22.
// Tổ chức không có trong bảng dùng kiểu xanh đậm trung tính, không đoán màu.
import { BANKS, DEFAULT_BIN, type Bank } from './banks'
import type { Logo } from './render'

interface Verified {
  primary: string
  accent: string
  w: number
  h: number
  source: string
}

const VERIFIED: Record<string, Verified> = {
  LPB: { primary: '#6D371A', accent: '#F99D1C', w: 216, h: 55, source: 'lpbank.com.vn' },
  VCB: { primary: '#00512A', accent: '#7DB741', w: 365, h: 124, source: 'www.vietcombank.com.vn' },
  ICB: { primary: '#006095', accent: '#D7153A', w: 480, h: 120, source: 'www.vietinbank.vn' },
  BIDV: { primary: '#00524E', accent: '#FFC62F', w: 124, h: 40, source: 'www.bidc.vn' },
  VBA: { primary: '#9D1D26', accent: '#FFDC00', w: 110, h: 108, source: 'www.agribank.com.vn' },
  TCB: { primary: '#EC1C24', accent: '#2E3D45', w: 480, h: 65, source: 'techcombank.com' },
  MB: { primary: '#141ED2', accent: '#ED2645', w: 328, h: 140, source: 'www.mbbank.com.vn' },
  ACB: { primary: '#0038A8', accent: '#00AFFF', w: 471, h: 189, source: 'acb.com.vn' },
  VPB: { primary: '#00B74F', accent: '#E10600', w: 480, h: 109, source: 'www.vpbank.com.vn' },
  TPB: { primary: '#573380', accent: '#DC893D', w: 214, h: 49, source: 'tpb.vn' },
  STB: { primary: '#0065A4', accent: '#F3B643', w: 480, h: 114, source: 'www.sacombank.com.vn' },
  HDB: { primary: '#BE1128', accent: '#FFDC00', w: 206, h: 72, source: 'hdbank.com.vn' },
  VIB: { primary: '#0066B3', accent: '#F6921E', w: 291, h: 132, source: 'www.vib.com.vn' },
  SHB: { primary: '#2F2E79', accent: '#F37021', w: 454, h: 200, source: 'www.shb.com.vn' },
  EIB: { primary: '#005D98', accent: '#3F85B1', w: 480, h: 99, source: 'eximbank.com.vn' },
  MSB: { primary: '#EB2228', accent: '#F26F21', w: 195, h: 115, source: 'www.msb.com.vn' },
  OCB: { primary: '#008C44', accent: '#E39717', w: 411, h: 120, source: 'ocb.com.vn' },
  SEAB: { primary: '#D71921', accent: '#D71921', w: 51, h: 51, source: 'seanet.vn' },
  ABB: { primary: '#159193', accent: '#F5821F', w: 200, h: 102, source: 'www.abbank.vn' },
  BAB: { primary: '#B88629', accent: '#CCA965', w: 299, h: 122, source: 'www.baca-bank.vn' },
  BVB: { primary: '#0066B3', accent: '#0089D0', w: 480, h: 119, source: 'www.baovietbank.vn' },
  BIDC: { primary: '#006B67', accent: '#FDB71A', w: 480, h: 120, source: 'www.bidc.vn' },
  CAKE: { primary: '#B54383', accent: '#BB7BA2', w: 382, h: 200, source: 'cake.vn' },
  CIMB: { primary: '#DA001A', accent: '#4E000D', w: 116, h: 96, source: 'www.cimbbank.com.vn' },
  CITIBANK: { primary: '#255BE3', accent: '#FF3C28', w: 346, h: 200, source: 'www.citigroup.com' },
  COOPBANK: { primary: '#004AA1', accent: '#EA1D24', w: 459, h: 51, source: 'www.co-opbank.vn' },
  DBS: { primary: '#FF3333', accent: '#FF5757', w: 480, h: 139, source: 'www.dbs.com' },
  GPB: { primary: '#F58221', accent: '#F04B2E', w: 478, h: 114, source: 'www.gpbank.com.vn' },
  HLBVN: { primary: '#002147', accent: '#DF1C01', w: 480, h: 89, source: 'www.hlbank.com.vn' },
  HSBC: { primary: '#DB0011', accent: '#DB0011', w: 373, h: 101, source: 'www.hsbc.com.vn' },
  IVB: { primary: '#006FBA', accent: '#80B7DD', w: 480, h: 31, source: 'www.indovinabank.com.vn' },
  KBank: { primary: '#61AC51', accent: '#EC4333', w: 342, h: 92, source: 'www.kasikornbank.com.vn' },
  momo: { primary: '#A50064', accent: '#BB408B', w: 144, h: 144, source: 'www.momo.vn' },
  MVAS: { primary: '#1B70B2', accent: '#ED3840', w: 200, h: 200, source: 'mobifonemoney.vn' },
  NAB: { primary: '#0074BC', accent: '#FFDD00', w: 330, h: 98, source: 'www.namabank.com.vn' },
  NCB: { primary: '#004E96', accent: '#EC2327', w: 211, h: 92, source: 'www.ncb-bank.vn' },
  PGB: { primary: '#293474', accent: '#33BBEC', w: 480, h: 138, source: 'www.pgbank.com.vn' },
  PBVN: { primary: '#E30613', accent: '#F07779', w: 480, h: 69, source: 'www.publicbank.com.vn' },
  SGICB: { primary: '#0072BB', accent: '#3691CA', w: 480, h: 65, source: 'www.saigonbank.com.vn' },
  SHBVN: { primary: '#0046FF', accent: '#7B9EFB', w: 480, h: 73, source: 'shinhan.com.vn' },
  SCVN: { primary: '#0473EA', accent: '#38D200', w: 479, h: 189, source: 'www.sc.com' },
  TIMO: { primary: '#563D82', accent: '#EB3300', w: 480, h: 76, source: 'timo.vn' },
  UOB: { primary: '#005CB9', accent: '#F5333F', w: 428, h: 120, source: 'www.uob.com.vn' },
  VAB: { primary: '#1E4485', accent: '#EC2227', w: 458, h: 111, source: 'www.vietabank.com.vn' },
  VIETBANK: { primary: '#0C56A5', accent: '#D3232D', w: 199, h: 49, source: 'www.vietbank.com.vn' },
  VCCB: { primary: '#2B3278', accent: '#03C2F3', w: 480, h: 166, source: 'bvbank.net.vn' },
  VTLMONEY: { primary: '#EE0033', accent: '#F23F65', w: 433, h: 200, source: 'viettelmoney.vn' },
  Vikki: { primary: '#3004E3', accent: '#DB3668', w: 480, h: 179, source: 'vikkibank.vn' },
  VNPTMONEY: { primary: '#21409A', accent: '#FCAF17', w: 212, h: 68, source: 'vnptmoney.vn' },
  VRB: { primary: '#0F3193', accent: '#FF0100', w: 328, h: 200, source: 'vrbank.com.vn' },
  WVN: { primary: '#0068B0', accent: '#408EC4', w: 480, h: 112, source: 'www.woori.com.vn' },
  ZALOPAY: { primary: '#0033C9', accent: '#00CF6A', w: 303, h: 200, source: 'zalopay.vn' },
}

const LOGO_URLS = import.meta.glob<string>('../assets/banks/*.png', { eager: true, query: '?url', import: 'default' })

export const NEUTRAL = { primary: '#1E3A5F', accent: '#4A6FA5' }

export interface BankStyle {
  bin: string
  code: string
  name: string
  primary: string
  accent: string
  verified: boolean
  source?: string
  logo?: Logo
}

function toStyle(bank: Bank): BankStyle {
  const v = VERIFIED[bank.code]
  const base = { bin: bank.bin, code: bank.code, name: bank.shortName }
  if (!v) return { ...base, ...NEUTRAL, verified: false }
  return {
    ...base,
    primary: v.primary,
    accent: v.accent,
    verified: true,
    source: v.source,
    logo: { src: LOGO_URLS[`../assets/banks/${bank.code}.png`], width: v.w, height: v.h },
  }
}

export const BANK_STYLES: BankStyle[] = BANKS.map(toStyle)
export const styleOf = (bin: string): BankStyle =>
  BANK_STYLES.find((s) => s.bin === bin) ?? BANK_STYLES.find((s) => s.bin === DEFAULT_BIN)!

const rgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
/** t > 0: pha với trắng, t < 0: pha với đen */
export function shade(hex: string, t: number): string {
  const to = t > 0 ? 255 : 0
  const k = Math.abs(t)
  return '#' + rgb(hex).map((c) => Math.round(c + (to - c) * k).toString(16).padStart(2, '0')).join('')
}
/** màu chữ đọc được trên nền `hex` */
export function onColor(hex: string): string {
  const [r, g, b] = rgb(hex)
  return r * 0.299 + g * 0.587 + b * 0.114 > 165 ? '#1F1F1F' : '#FFFFFF'
}

export function themeVars(s: BankStyle): Record<string, string> {
  return {
    '--color-brand': s.primary,
    '--color-brand-dark': shade(s.primary, -0.22),
    '--color-brand-soft': shade(s.primary, 0.9),
    '--color-on-brand': onColor(s.primary),
    '--color-accent': s.accent,
    '--color-accent-dark': shade(s.accent, -0.12),
    '--color-on-accent': onColor(s.accent),
  }
}
