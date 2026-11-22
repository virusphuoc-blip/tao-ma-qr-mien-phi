import { useState } from 'react'
import { BANKS } from './lib/banks'
import { TYPES } from './lib/payloads'
import { clearStats, loadStats } from './lib/stats'

function Table({ id, head, rows }: { id: string; head: string; rows: [string, number][] }) {
  return (
    <table id={id} className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-neutral-500">
          <th className="py-1.5 font-medium">{head}</th>
          <th className="py-1.5 text-right font-medium">Số mã</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={2} className="py-2 text-neutral-500">
              Chưa có dữ liệu.
            </td>
          </tr>
        )}
        {rows.map(([name, n]) => (
          <tr key={name} className="border-b border-neutral-100">
            <td className="py-1.5">{name}</td>
            <td className="py-1.5 text-right font-semibold tabular-nums">{n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Admin() {
  const [stats, setStats] = useState(loadStats)
  const sorted = (rec: Record<string, number>, name: (key: string) => string): [string, number][] =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => [name(k), n])
  const counters: [string, string, number][] = [
    ['stat-created', 'Mã QR đã tạo', stats.created],
    ['stat-downloads', 'Lượt tải về', stats.downloads],
    ['stat-cards', 'Card visit đã tạo', stats.cards],
  ]
  return (
    <main id="page-admin" className="flex-1 space-y-3 p-3">
      <section className="card">
        <h2 className="font-semibold">Quản trị – thống kê</h2>
        <p id="stat-note" className="mt-1 text-xs text-neutral-500">
          Số liệu chỉ được đếm trên thiết bị này (lưu trong trình duyệt), không gửi lên máy chủ. Một mã được tính là "đã tạo" ở lần đầu bạn tải, sao chép, chia sẻ
          hoặc gắn nó lên card visit.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {counters.map(([id, label, n]) => (
            <div key={id} className="rounded-xl bg-brand-soft p-3 text-center">
              <div id={id} className="text-2xl font-bold text-brand tabular-nums">
                {n}
              </div>
              <div className="text-xs text-neutral-600">{label}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h3 className="mb-1 font-semibold">Mã QR theo ngân hàng</h3>
        <Table id="stat-by-bank" head="Ngân hàng" rows={sorted(stats.byBank, (bin) => BANKS.find((b) => b.bin === bin)?.shortName ?? bin)} />
      </section>
      <section className="card">
        <h3 className="mb-1 font-semibold">Mã QR theo loại</h3>
        <Table id="stat-by-type" head="Loại mã" rows={sorted(stats.byType, (t) => TYPES.find((d) => d.type === t)?.label ?? t)} />
      </section>
      <button
        type="button"
        id="stat-clear"
        className="btn w-full border border-neutral-300 bg-white"
        onClick={() => {
          clearStats()
          setStats(loadStats())
        }}
      >
        Xóa thống kê trên máy này
      </button>
    </main>
  )
}
