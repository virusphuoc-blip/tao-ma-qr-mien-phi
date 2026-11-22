import { useEffect, useMemo, useRef, useState } from 'react'
import lpbankLogo from './assets/lpbank-logo.png?inline'
import { BANKS, DEFAULT_BIN } from './lib/banks'
import { cardPNG, cardSVG, EMPTY_STAFF, layoutCard, TEMPLATES, type CardInput, type Staff, type Template } from './lib/card'
import { addHistory, clearHistory, loadHistory, type HistoryItem } from './lib/history'
import { buildPayload, typeDef, TYPES, type FormData, type QRType } from './lib/payloads'
import {
  buildModel,
  DEFAULT_STYLE,
  loadImage,
  scanWarnings,
  toPNG,
  toSVG,
  type ECLevel,
  type Logo,
  type QRModel,
  type QRStyle,
} from './lib/render'
import { BANK_STYLES, styleOf, themeVars } from './lib/styles'
import { toTransferContent } from './lib/vietqr'
import { APP_NAME, APP_VERSION } from './version'

const BRAND_BROWN = '#6D371A'
const LPBANK_LOGO: Logo = { src: lpbankLogo, width: 216, height: 55 }
const PRESETS = [
  { label: '50K', value: '50000' },
  { label: '100K', value: '100000' },
  { label: '200K', value: '200000' },
  { label: '500K', value: '500000' },
  { label: '1M', value: '1000000' },
]
const PNG_SIZES = [512, 1024, 2048]
const FG_COLORS = [
  { label: 'Đen', value: '#000000' },
  { label: 'Nâu LPBank', value: BRAND_BROWN },
  { label: 'Xanh đậm', value: '#0B3D91' },
]

const initialForms = () =>
  Object.fromEntries(TYPES.map((t) => [t.type, { ...t.defaults }])) as Record<QRType, FormData>

const formatVnd = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

function describe(type: QRType, form: FormData, payload: string): string {
  if (type === 'vietqr') {
    const bank = BANKS.find((b) => b.bin === form.bin)
    return [bank?.shortName, form.account, form.amount && formatVnd(form.amount) + 'đ'].filter(Boolean).join(' · ')
  }
  const text = form.name || form.ssid || form.phone || form.to || payload
  return text.length > 40 ? text.slice(0, 40) + '…' : text
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const ZALO_URL = 'https://zalo.me/0988474228'
const STAFF_KEY = 'tmqr.staff.v1'
const CARD_KEY = 'tmqr.card.v1'

function loadJSON<T extends object>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback
  } catch {
    return fallback
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* hết dung lượng lưu trữ: bỏ qua */
  }
}

const brandLogoCache = new Map<string, Promise<Logo | undefined>>()
/** logo ngân hàng dạng data URL để nhúng được vào SVG/PNG xuất ra */
function loadBrandLogo(bin: string): Promise<Logo | undefined> {
  let p = brandLogoCache.get(bin)
  if (!p) {
    const logo = styleOf(bin).logo
    p = !logo
      ? Promise.resolve(undefined)
      : fetch(logo.src)
          .then((r) => r.blob())
          .then(
            (blob) =>
              new Promise<Logo | undefined>((resolve) => {
                const reader = new FileReader()
                reader.onload = () => resolve({ ...logo, src: String(reader.result) })
                reader.onerror = () => resolve(undefined)
                reader.readAsDataURL(blob)
              }),
          )
          .catch(() => undefined)
    brandLogoCache.set(bin, p)
  }
  return p
}

interface CardChoice {
  template: Template
  styleBin: string
}

function cardInput(choice: CardChoice, brandLogo: Logo | undefined, type: QRType, form: FormData, staff: Staff): CardInput {
  const brand = styleOf(choice.styleBin)
  const bank = type === 'vietqr' ? BANKS.find((b) => b.bin === form.bin) : undefined
  return {
    template: choice.template,
    brand: { name: brand.name, primary: brand.primary, accent: brand.accent, logo: brandLogo },
    title: bank && form.name.trim() ? form.name.trim().toUpperCase() : undefined,
    subtitle: bank ? `${bank.shortName} · ${form.account}` : undefined,
    amount: bank && form.amount ? formatVnd(form.amount) + ' đ' : undefined,
    staffBank: bank?.shortName ?? brand.name,
    staff,
  }
}

function renderSVG(model: QRModel, style: QRStyle, logo: Logo | undefined, size: number, input: CardInput): string {
  return input.template === 'plain' ? toSVG(model, style, logo, size) : cardSVG(layoutCard(input), model, style, logo, size)
}
function renderPNG(model: QRModel, style: QRStyle, logo: Logo | undefined, size: number, input: CardInput): Promise<Blob> {
  return input.template === 'plain' ? toPNG(model, style, logo, size) : cardPNG(layoutCard(input), model, style, logo, size)
}

async function resolveLogo(style: QRStyle, styleBin: string): Promise<Logo | undefined> {
  if (style.logo === 'lpbank') return LPBANK_LOGO
  if (style.logo === 'bank') return loadBrandLogo(styleBin)
  if (style.logo === 'custom' && style.customLogo) {
    const img = await loadImage(style.customLogo)
    return { src: style.customLogo, width: img.naturalWidth || 1, height: img.naturalHeight || 1 }
  }
  return undefined
}

function safeModel(payload: string | undefined, style: QRStyle, logo?: Logo): QRModel | null {
  if (!payload) return null
  try {
    return buildModel(payload, style, logo)
  } catch {
    return null
  }
}

export default function App() {
  const [type, setType] = useState<QRType>('vietqr')
  const [forms, setForms] = useState(initialForms)
  const [style, setStyle] = useState<QRStyle>(DEFAULT_STYLE)
  const [customLogo, setCustomLogo] = useState<Logo>()
  const [pngSize, setPngSize] = useState(1024)
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)
  const [bankQuery, setBankQuery] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)
  const [choice, setChoice] = useState<CardChoice>(() => {
    const c = loadJSON<CardChoice>(CARD_KEY, { template: 'standard', styleBin: DEFAULT_BIN })
    return { template: TEMPLATES.some((t) => t.id === c.template) ? c.template : 'standard', styleBin: styleOf(c.styleBin).bin }
  })
  const [staff, setStaff] = useState<Staff>(() => loadJSON(STAFF_KEY, EMPTY_STAFF))
  const [brandLogo, setBrandLogo] = useState<{ bin: string; logo?: Logo }>()
  const bankStyle = styleOf(choice.styleBin)

  useEffect(() => saveJSON(CARD_KEY, choice), [choice])
  useEffect(() => saveJSON(STAFF_KEY, staff), [staff])
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(themeVars(bankStyle))) root.style.setProperty(k, v)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bankStyle.primary)
    let live = true
    loadBrandLogo(bankStyle.bin).then((l) => live && setBrandLogo({ bin: bankStyle.bin, logo: l }))
    return () => {
      live = false
    }
  }, [bankStyle])
  const currentBrandLogo = brandLogo?.bin === bankStyle.bin ? brandLogo.logo : undefined
  const setStaffField = (key: keyof Staff, value: string) => setStaff((v) => ({ ...v, [key]: value }))
  const hasStaff = !!(staff.branch || staff.name || staff.phone)

  const form = forms[type]
  const setField = (key: string, value: string) =>
    setForms((f) => ({ ...f, [type]: { ...f[type], [key]: value } }))
  const patchStyle = (patch: Partial<QRStyle>) => setStyle((s) => ({ ...s, ...patch }))

  const notify = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    let live = true
    if (style.logo === 'custom' && style.customLogo) {
      resolveLogo(style, '').then(
        (l) => live && setCustomLogo(l),
        () => live && setCustomLogo(undefined),
      )
    }
    return () => {
      live = false
    }
  }, [style])

  const logo =
    style.logo === 'lpbank'
      ? LPBANK_LOGO
      : style.logo === 'bank'
        ? currentBrandLogo
        : style.logo === 'custom' && customLogo?.src === style.customLogo
        ? customLogo
        : undefined

  const built = useMemo(() => buildPayload(type, form), [type, form])
  const model = useMemo(() => safeModel(built.payload, style, logo), [built.payload, style, logo])
  const tooLong = !!built.payload && !model
  const card = useMemo(() => cardInput(choice, currentBrandLogo, type, form, staff), [choice, currentBrandLogo, type, form, staff])
  const svg = useMemo(() => (model ? renderSVG(model, style, logo, 1024, card) : ''), [model, style, logo, card])
  const warnings = useMemo(() => scanWarnings(model, style), [model, style])

  const banks = useMemo(() => {
    const q = bankQuery.trim().toLowerCase()
    const list = q
      ? BANKS.filter((b) => `${b.shortName} ${b.name} ${b.code} ${b.bin}`.toLowerCase().includes(q))
      : BANKS
    return list.some((b) => b.bin === form.bin) || type !== 'vietqr'
      ? list
      : [...BANKS.filter((b) => b.bin === forms.vietqr.bin), ...list]
  }, [bankQuery, form.bin, forms.vietqr.bin, type])
  const bank = BANKS.find((b) => b.bin === forms.vietqr.bin)

  const remember = () => {
    if (!built.payload) return
    setHistory((h) => addHistory(h, { type, form, style, card: choice, label: describe(type, form, built.payload) }))
  }
  const fileName = (ext: string) => `qr-${type}-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.${ext}`

  const downloadPNG = async () => {
    if (!model) return
    try {
      saveBlob(await renderPNG(model, style, logo, pngSize, card), fileName('png'))
      remember()
      notify(`Đã tải PNG ${pngSize}px`)
    } catch (e) {
      notify((e as Error).message)
    }
  }
  const downloadSVG = () => {
    if (!model) return
    saveBlob(new Blob([renderSVG(model, style, logo, pngSize, card)], { type: 'image/svg+xml' }), fileName('svg'))
    remember()
    notify('Đã tải SVG')
  }
  const copyImage = async () => {
    if (!model) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderPNG(model, style, logo, pngSize, card) })])
      remember()
      notify('Đã sao chép ảnh')
    } catch {
      notify('Trình duyệt không cho phép sao chép ảnh. Hãy dùng Tải PNG.')
    }
  }
  const share = async () => {
    if (!model) return
    try {
      const file = new File([await renderPNG(model, style, logo, pngSize, card)], fileName('png'), { type: 'image/png' })
      if (!navigator.canShare?.({ files: [file] })) {
        notify('Trình duyệt không hỗ trợ chia sẻ ảnh. Hãy dùng Tải PNG.')
        return
      }
      await navigator.share({ files: [file], title: 'Mã QR' })
      remember()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') notify('Không chia sẻ được. Hãy dùng Tải PNG.')
    }
  }

  const onLogoFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Vui lòng chọn tệp ảnh.')
    if (file.size > 1_000_000) return notify('Logo tối đa 1MB.')
    const reader = new FileReader()
    reader.onload = () => patchStyle({ logo: 'custom', customLogo: String(reader.result), ec: 'H' })
    reader.readAsDataURL(file)
  }

  const restore = (item: HistoryItem) => {
    setType(item.type)
    setForms((f) => ({ ...f, [item.type]: { ...typeDef(item.type).defaults, ...item.form } }))
    setStyle({ ...DEFAULT_STYLE, ...item.style })
    if (item.card) setChoice(item.card)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    notify('Đã tạo lại mã từ lịch sử')
  }
  const redownload = async (item: HistoryItem) => {
    try {
      const built = buildPayload(item.type, item.form)
      const itemStyle = { ...DEFAULT_STYLE, ...item.style }
      const itemChoice = item.card ?? choice
      const itemLogo = await resolveLogo(itemStyle, itemChoice.styleBin)
      const m = safeModel(built.payload, itemStyle, itemLogo)
      if (!m) return notify('Không tạo lại được mã này.')
      const input = cardInput(itemChoice, await loadBrandLogo(itemChoice.styleBin), item.type, { ...typeDef(item.type).defaults, ...item.form }, staff)
      saveBlob(await renderPNG(m, itemStyle, itemLogo, pngSize, input), `qr-${item.type}-${item.id}.png`)
      notify(`Đã tải PNG ${pngSize}px`)
    } catch (e) {
      notify((e as Error).message)
    }
  }

  const transferContent = toTransferContent(forms.vietqr.content)

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="border-b-4 border-accent bg-brand px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-on-brand">
        <h1 className="text-xl font-bold">Tạo Mã QR Miễn Phí</h1>
        <p className="text-sm opacity-90">VietQR chuyển khoản, WiFi, danh thiếp… Không cần đăng nhập.</p>
      </header>

      <main className="flex-1 space-y-3 p-3">
        <nav className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" aria-label="Loại mã QR">
          {TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              data-type={t.type}
              aria-pressed={t.type === type}
              onClick={() => setType(t.type)}
              className={`chip shrink-0 ${t.type === type ? 'chip-on' : ''}`}
            >
              <span aria-hidden>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>

        <section className="card space-y-3">
          {type === 'vietqr' ? (
            <>
              <div>
                <label className="label" htmlFor="bank">
                  Ngân hàng nhận
                </label>
                <input
                  className="field mb-2"
                  placeholder="Tìm ngân hàng (tên, mã, BIN)…"
                  value={bankQuery}
                  onChange={(e) => setBankQuery(e.target.value)}
                  aria-label="Tìm ngân hàng"
                />
                <select id="bank" className="field" value={form.bin} onChange={(e) => {
                    setField('bin', e.target.value)
                    setChoice((c) => ({ ...c, styleBin: e.target.value }))
                  }}
                >
                  {banks.map((b) => (
                    <option key={b.bin} value={b.bin}>
                      {b.shortName} – {b.name} ({b.bin})
                    </option>
                  ))}
                </select>
                {bank && !bank.transfer && (
                  <p className="mt-1 text-sm text-amber-700">
                    Theo danh sách VietQR, {bank.shortName} có thể chưa hỗ trợ nhận chuyển khoản nhanh qua QR.
                  </p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="account">
                  Số tài khoản
                </label>
                <input
                  id="account"
                  className="field"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={19}
                  placeholder="Chỉ nhập chữ số"
                  value={form.account}
                  onChange={(e) => setField('account', e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div>
                <label className="label" htmlFor="holder">
                  Tên chủ tài khoản
                </label>
                <input
                  id="holder"
                  className="field uppercase"
                  placeholder="NGUYEN VAN A"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Chỉ để hiển thị dưới mã. App ngân hàng tự tra tên thật theo số tài khoản.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="amount">
                  Số tiền (VND) <span className="font-normal text-neutral-500">– bỏ trống để người chuyển tự nhập</span>
                </label>
                <input
                  id="amount"
                  className="field"
                  inputMode="numeric"
                  placeholder="Không bắt buộc"
                  value={formatVnd(form.amount)}
                  onChange={(e) => setField('amount', e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13))}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={`chip ${form.amount === p.value ? 'chip-on' : ''}`}
                      onClick={() => setField('amount', form.amount === p.value ? '' : p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label" htmlFor="content">
                  Nội dung chuyển khoản <span className="font-normal text-neutral-500">– không bắt buộc</span>
                </label>
                <input
                  id="content"
                  className="field"
                  maxLength={50}
                  placeholder="Ví dụ: Tiền ăn trưa"
                  value={form.content}
                  onChange={(e) => setField('content', e.target.value)}
                />
                {form.content && transferContent !== form.content.trim() && (
                  <p className="mt-1 text-xs text-neutral-500">
                    Ghi vào mã dạng không dấu để mọi app ngân hàng đọc được: <b>{transferContent || '(trống)'}</b>
                  </p>
                )}
              </div>
            </>
          ) : (
            typeDef(type).fields.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={`f-${f.key}`}>
                  {f.label}
                </label>
                {f.kind === 'textarea' ? (
                  <textarea
                    id={`f-${f.key}`}
                    className="field"
                    rows={3}
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                ) : f.kind === 'select' ? (
                  <select id={`f-${f.key}`} className="field" value={form[f.key]} onChange={(e) => setField(f.key, e.target.value)}>
                    {f.options!.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`f-${f.key}`}
                    className="field"
                    type={f.kind ?? 'text'}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                )}
              </div>
            ))
          )}
        </section>

        <section className="card" aria-live="polite">
          {model ? (
            <>
              <div
                id="qr-preview"
                data-template={choice.template}
                className="mx-auto w-full max-w-80 overflow-hidden rounded-xl border border-neutral-200 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              {type === 'vietqr' && choice.template === 'plain' && (
                <div className="mt-2 text-center text-sm">
                  {form.name.trim() && <div className="font-semibold uppercase">{form.name.trim()}</div>}
                  <div className="text-neutral-600">
                    {bank?.shortName} · {form.account}
                  </div>
                  <div className="font-semibold text-brand">
                    {form.amount ? formatVnd(form.amount) + ' đ' : 'Số tiền: người chuyển tự nhập'}
                  </div>
                </div>
              )}
              {warnings.length > 0 && (
                <ul id="warnings" className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  {warnings.map((w) => (
                    <li key={w}>⚠️ {w}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-700">Cỡ ảnh</span>
                {PNG_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-size={s}
                    className={`chip ${pngSize === s ? 'chip-on' : ''}`}
                    onClick={() => setPngSize(s)}
                  >
                    {s}px
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" id="dl-png" className="btn btn-primary col-span-2 text-base" onClick={downloadPNG}>
                  ⬇️ Tải PNG ({pngSize}px)
                </button>
                <button type="button" id="dl-svg" className="btn col-span-2" onClick={downloadSVG}>
                  ⬇️ Tải SVG
                </button>
                <button type="button" id="copy" className="btn" onClick={copyImage}>
                  📋 Sao chép ảnh
                </button>
                <button type="button" id="share" className="btn" onClick={share}>
                  📤 Chia sẻ
                </button>
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-medium text-neutral-700">Xem chuỗi dữ liệu trong mã</summary>
                <pre id="payload" className="mt-2 rounded-xl bg-neutral-100 p-3 text-xs break-all whitespace-pre-wrap">
                  {built.payload}
                </pre>
              </details>
            </>
          ) : (
            <p id="empty" className="py-8 text-center text-sm text-neutral-500">
              {tooLong ? 'Nội dung quá dài, không tạo được mã QR. Hãy rút ngắn lại.' : built.error}
            </p>
          )}
        </section>

        <section className="card space-y-4">
          <div>
            <label className="label" htmlFor="style-bank">
              Phong cách (màu + logo ngân hàng)
            </label>
            <div className="flex items-center gap-2">
              <span className="size-6 shrink-0 rounded-full border border-neutral-200" style={{ background: bankStyle.primary }} />
              <span className="size-6 shrink-0 rounded-full border border-neutral-200" style={{ background: bankStyle.accent }} />
              <select id="style-bank" className="field" value={choice.styleBin} onChange={(e) => setChoice((c) => ({ ...c, styleBin: e.target.value }))}>
                {BANK_STYLES.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.name}
                    {b.verified ? '' : ' (kiểu trung tính)'}
                  </option>
                ))}
              </select>
            </div>
            <p id="style-note" className="mt-1 text-xs text-neutral-500">
              {bankStyle.verified
                ? `Màu và logo lấy từ ${bankStyle.source}. Chọn ngân hàng nhận ở trên sẽ tự đổi phong cách; bạn có thể đổi lại tại đây.`
                : 'Chưa xác minh được màu chính thức của tổ chức này nên dùng kiểu xanh đậm trung tính, không có logo.'}
            </p>
          </div>
          <div>
            <span className="label">Mẫu thẻ QR</span>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-template-btn={t.id}
                  title={t.hint}
                  className={`chip ${choice.template === t.id ? 'chip-on' : ''}`}
                  onClick={() => setChoice((c) => ({ ...c, template: t.id }))}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-neutral-500">{TEMPLATES.find((t) => t.id === choice.template)?.hint}. Ảnh PNG/SVG tải về đúng như bản xem trước.</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="label">Thông tin cán bộ phụ trách</span>
              {hasStaff && (
                <button type="button" id="clear-staff" className="text-sm font-medium text-brand" onClick={() => setStaff(EMPTY_STAFF)}>
                  Xóa
                </button>
              )}
            </div>
            <div className="space-y-2">
              <input id="staff-branch" className="field" placeholder="Chi nhánh (ví dụ: CN Sài Gòn)" maxLength={60} value={staff.branch} onChange={(e) => setStaffField('branch', e.target.value)} />
              <input id="staff-name" className="field" placeholder="Tên nhân viên" maxLength={60} value={staff.name} onChange={(e) => setStaffField('name', e.target.value)} />
              <input id="staff-phone" className="field" inputMode="tel" placeholder="Số điện thoại" maxLength={20} value={staff.phone} onChange={(e) => setStaffField('phone', e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Không bắt buộc. Chỉ in thành chữ dưới mã trên thẻ, không nằm trong dữ liệu mã QR. Ô bỏ trống sẽ không hiện; được lưu trên máy này.
            </p>
          </div>
        </section>

        <details className="card group" open>
          <summary className="cursor-pointer font-semibold">Tùy chỉnh mã QR</summary>
          <div className="mt-3 space-y-4">
            <div>
              <span className="label">Màu mã</span>
              <div className="flex flex-wrap items-center gap-2">
                {FG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`chip ${style.fg.toUpperCase() === c.value ? 'chip-on' : ''}`}
                    onClick={() => patchStyle({ fg: c.value })}
                  >
                    <span className="mr-1 inline-block size-3 rounded-full border border-white align-middle" style={{ background: c.value }} />
                    {c.label}
                  </button>
                ))}
                <input type="color" aria-label="Chọn màu mã" className="h-9 w-12 rounded" value={style.fg} onChange={(e) => patchStyle({ fg: e.target.value })} />
              </div>
            </div>
            <div>
              <span className="label">Màu nền</span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" id="bg-white" className={`chip ${style.bg.toUpperCase() === '#FFFFFF' ? 'chip-on' : ''}`} onClick={() => patchStyle({ bg: '#FFFFFF' })}>
                  Trắng
                </button>
                <input id="bg-color" type="color" aria-label="Chọn màu nền" className="h-9 w-12 rounded" value={style.bg} onChange={(e) => patchStyle({ bg: e.target.value })} />
                <span className="text-xs text-neutral-500">Nên giữ nền trắng hoặc sáng.</span>
              </div>
            </div>
            <div>
              <span className="label">Mức sửa lỗi</span>
              <div className="flex gap-2">
                {(['M', 'Q', 'H'] as ECLevel[]).map((l) => (
                  <button key={l} type="button" data-ec={l} className={`chip ${style.ec === l ? 'chip-on' : ''}`} onClick={() => patchStyle({ ec: l })}>
                    {l} {l === 'M' ? '(15%)' : l === 'Q' ? '(25%)' : '(30%)'}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input id="rounded" type="checkbox" className="size-5 accent-brand" checked={style.rounded} onChange={(e) => patchStyle({ rounded: e.target.checked })} />
              Bo tròn các ô
            </label>
            <div>
              <span className="label">Logo ở giữa</span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" data-logo="none" className={`chip ${style.logo === 'none' ? 'chip-on' : ''}`} onClick={() => patchStyle({ logo: 'none' })}>
                  Không
                </button>
                {bankStyle.logo && bankStyle.code !== 'LPB' && (
                  <button type="button" data-logo="bank" className={`chip ${style.logo === 'bank' ? 'chip-on' : ''}`} onClick={() => patchStyle({ logo: 'bank', ec: 'H' })}>
                    Logo {bankStyle.name}
                  </button>
                )}
                <button type="button" data-logo="lpbank" className={`chip ${style.logo === 'lpbank' ? 'chip-on' : ''}`} onClick={() => patchStyle({ logo: 'lpbank', ec: 'H' })}>
                  Logo LPBank
                </button>
                <label className={`chip cursor-pointer ${style.logo === 'custom' ? 'chip-on' : ''}`}>
                  Tải logo của bạn
                  <input
                    id="logo-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    onChange={(e) => {
                      onLogoFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              <p className="mt-1 text-xs text-neutral-500">Khi thêm logo, mức sửa lỗi tự chuyển sang H.</p>
            </div>
          </div>
        </details>

        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Lịch sử</h2>
            {history.length > 0 && (
              <button
                type="button"
                id="clear-history"
                className="text-sm font-medium text-brand"
                onClick={() => {
                  if (!window.confirm('Xóa toàn bộ lịch sử?')) return
                  clearHistory()
                  setHistory([])
                }}
              >
                Xóa lịch sử
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">Mã bạn tải, sao chép hoặc chia sẻ sẽ được lưu tại đây (chỉ trên máy này).</p>
          ) : (
            <ul id="history" className="mt-2 divide-y divide-neutral-100">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-2 py-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => restore(h)}>
                    <div className="truncate text-sm font-medium">
                      {typeDef(h.type).icon} {h.label}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {typeDef(h.type).label} · {new Date(h.time).toLocaleString('vi-VN')}
                    </div>
                  </button>
                  <button type="button" className="btn shrink-0" aria-label="Tải lại PNG" onClick={() => redownload(h)}>
                    ⬇️ PNG
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <a
        id="promo"
        href={ZALO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-3 mb-2 block rounded-xl border-l-4 border-[#F99D1C] bg-[#6D371A] px-3 py-2 text-center text-sm font-medium text-white"
      >
        Mở TK LPBank miễn phí: liên hệ ngay VH Phước <span className="font-bold whitespace-nowrap text-[#F99D1C]">Zalo 0988474228</span>
      </a>

      <footer className="px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-neutral-600">
        <p className="font-medium">Công cụ miễn phí, không phải sản phẩm chính thức của LPBank.</p>
        <p className="mt-1">Mọi dữ liệu chỉ xử lý trên trình duyệt của bạn, không gửi lên máy chủ.</p>
        <p id="copyright" className="mt-2">
          © 2026 VH Phước. Mọi nội dung thuộc về VH Phước.{' '}
          <span id="app-version" className="whitespace-nowrap">
            {APP_NAME} v{APP_VERSION}
          </span>
        </p>
      </footer>

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-6 z-10 mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
