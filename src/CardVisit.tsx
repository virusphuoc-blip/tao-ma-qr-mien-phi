import { useEffect, useMemo, useState } from 'react'
import { BANKS, DEFAULT_BIN } from './lib/banks'
import { BIZ_H, BIZ_TEMPLATES, BIZ_W, cardPNG, cardSVG, EMPTY_BIZ, layoutBizCard, type BizInfo, type BizTemplate } from './lib/card'
import type { HistoryItem } from './lib/history'
import { buildPayload, typeDef, type FormData } from './lib/payloads'
import { buildModel, DEFAULT_STYLE, type Logo } from './lib/render'
import { countCard, countDownload, countQR } from './lib/stats'
import { styleOf } from './lib/styles'
import { loadDataLogo, loadJSON, saveBlob, saveJSON } from './lib/util'

const KEY = 'tmqr.bizcard.v1'
/** 3.5 × 2 inch ở 600 dpi */
const PNG_W = 2100

interface Saved {
  info: BizInfo
  template: BizTemplate
  source: string
  qr: FormData
}
const FIELDS: { key: keyof BizInfo; label: string; placeholder: string; mode?: 'tel' | 'email' }[] = [
  { key: 'name', label: 'Họ tên', placeholder: 'Nguyễn Văn A' },
  { key: 'title', label: 'Chức vụ', placeholder: 'Chuyên viên quan hệ khách hàng' },
  { key: 'branch', label: 'Chi nhánh', placeholder: 'CN Sài Gòn' },
  { key: 'phone', label: 'Số điện thoại', placeholder: '0901234567', mode: 'tel' },
  { key: 'zalo', label: 'Zalo', placeholder: '0901234567', mode: 'tel' },
  { key: 'email', label: 'Email', placeholder: 'ten@example.com', mode: 'email' },
]
const NEW_QR: FormData = { ...typeDef('vietqr').defaults, bin: DEFAULT_BIN }

export default function CardVisit({ history, notify }: { history: HistoryItem[]; notify: (msg: string) => void }) {
  const [saved, setSaved] = useState<Saved>(() => {
    const s = loadJSON<Saved>(KEY, { info: EMPTY_BIZ, template: 'lpbank', source: 'new', qr: NEW_QR })
    return { ...s, info: { ...EMPTY_BIZ, ...s.info }, qr: { ...NEW_QR, ...s.qr } }
  })
  const [logo, setLogo] = useState<Logo>()
  useEffect(() => saveJSON(KEY, saved), [saved])
  useEffect(() => {
    loadDataLogo(styleOf(DEFAULT_BIN).logo).then(setLogo)
  }, [])
  const { info, template, qr } = saved
  const item = history.find((h) => h.id === saved.source)
  const source = item ? saved.source : 'new'
  const setInfo = (key: keyof BizInfo, value: string) => setSaved((s) => ({ ...s, info: { ...s.info, [key]: value } }))
  const setQR = (key: string, value: string) => setSaved((s) => ({ ...s, qr: { ...s.qr, [key]: value } }))

  const qrType = item ? item.type : 'vietqr'
  const qrForm = item ? item.form : qr
  const built = useMemo(() => buildPayload(qrType, qrForm), [qrType, qrForm])
  const model = useMemo(() => {
    try {
      return buildModel(built.payload ?? ' ', DEFAULT_STYLE)
    } catch {
      return null
    }
  }, [built.payload])
  const hasQR = !!built.payload && !!model
  const card = useMemo(() => layoutBizCard(template, info, hasQR, logo), [template, info, hasQR, logo])
  const svg = useMemo(() => (model ? cardSVG(card, model, DEFAULT_STYLE, undefined, BIZ_W) : ''), [card, model])
  const empty = !hasQR && Object.values(info).every((v) => !v.trim())

  const exported = () => {
    countCard(JSON.stringify([template, info, built.payload ?? '']))
    if (built.payload) countQR(qrType, built.payload, qrType === 'vietqr' ? qrForm.bin : undefined)
    countDownload()
  }
  const name = (ext: string) => `card-visit-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.${ext}`
  const downloadPNG = async () => {
    if (!model) return
    try {
      saveBlob(await cardPNG(card, model, DEFAULT_STYLE, undefined, PNG_W), name('png'))
      exported()
      notify(`Đã tải card visit PNG ${PNG_W}×${(PNG_W * BIZ_H) / BIZ_W}px`)
    } catch (e) {
      notify((e as Error).message)
    }
  }
  const downloadSVG = () => {
    if (!model) return
    saveBlob(new Blob([cardSVG(card, model, DEFAULT_STYLE, undefined, BIZ_W)], { type: 'image/svg+xml' }), name('svg'))
    exported()
    notify('Đã tải card visit SVG')
  }

  return (
    <main id="page-card" className="flex-1 space-y-3 p-3">
      <section className="card space-y-3">
        <h2 className="font-semibold">Card visit (danh thiếp)</h2>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`bc-${f.key}`}>
              {f.label}
            </label>
            <input
              id={`bc-${f.key}`}
              className="field"
              inputMode={f.mode}
              maxLength={80}
              placeholder={f.placeholder}
              value={info[f.key]}
              onChange={(e) => setInfo(f.key, e.target.value)}
            />
          </div>
        ))}
        <p className="text-xs text-neutral-500">Ô bỏ trống sẽ không in trên card. Thông tin được lưu trên máy này.</p>
      </section>

      <section className="card space-y-3">
        <div>
          <label className="label" htmlFor="bc-source">
            Mã QR trên card (quét để chuyển khoản)
          </label>
          <select id="bc-source" className="field" value={source} onChange={(e) => setSaved((s) => ({ ...s, source: e.target.value }))}>
            <option value="new">Tạo mã VietQR mới tại đây</option>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                Lịch sử: {typeDef(h.type).label} – {h.label}
              </option>
            ))}
          </select>
        </div>
        {source === 'new' && (
          <>
            <div>
              <label className="label" htmlFor="bc-bank">
                Ngân hàng nhận
              </label>
              <select id="bc-bank" className="field" value={qr.bin} onChange={(e) => setQR('bin', e.target.value)}>
                {BANKS.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.shortName} ({b.bin})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="bc-account">
                Số tài khoản
              </label>
              <input id="bc-account" className="field" inputMode="numeric" maxLength={19} value={qr.account} onChange={(e) => setQR('account', e.target.value.replace(/\D/g, ''))} />
            </div>
            <div>
              <label className="label" htmlFor="bc-amount">
                Số tiền (VND) – bỏ trống để người chuyển tự nhập
              </label>
              <input id="bc-amount" className="field" inputMode="numeric" maxLength={13} value={qr.amount} onChange={(e) => setQR('amount', e.target.value.replace(/\D/g, ''))} />
            </div>
            <div>
              <label className="label" htmlFor="bc-content">
                Nội dung chuyển khoản – không bắt buộc
              </label>
              <input id="bc-content" className="field" maxLength={50} value={qr.content} onChange={(e) => setQR('content', e.target.value)} />
            </div>
          </>
        )}
        {!hasQR && <p id="bc-noqr" className="text-sm text-neutral-600">{qr.account || item ? built.error : 'Nhập số tài khoản để gắn mã QR lên card. Chưa có mã thì card chỉ in thông tin.'}</p>}
      </section>

      <section className="card space-y-3">
        <div>
          <span className="label">Mẫu card</span>
          <div className="flex flex-wrap gap-2">
            {BIZ_TEMPLATES.map((t) => (
              <button key={t.id} type="button" data-bc-template={t.id} className={`chip ${template === t.id ? 'chip-on' : ''}`} onClick={() => setSaved((s) => ({ ...s, template: t.id }))}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {empty ? (
          <p className="text-sm text-neutral-600">Nhập thông tin ở trên để xem trước card.</p>
        ) : (
          <>
            <div id="bc-preview" data-template={template} className="overflow-hidden rounded-xl border border-neutral-200 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <button type="button" id="bc-png" className="btn btn-primary w-full" onClick={downloadPNG}>
              ⬇ Tải PNG (3.5 × 2 inch, {PNG_W}px)
            </button>
            <button type="button" id="bc-svg" className="btn w-full" onClick={downloadSVG}>
              Tải SVG
            </button>
          </>
        )}
      </section>
    </main>
  )
}
