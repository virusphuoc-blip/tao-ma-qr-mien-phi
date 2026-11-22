import type { Logo } from './render'

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function loadJSON<T extends object>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback
  } catch {
    return fallback
  }
}
export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* hết dung lượng lưu trữ: bỏ qua */
  }
}

const cache = new Map<string, Promise<Logo | undefined>>()
/** tải ảnh trong gói ứng dụng thành data URL để nhúng được vào SVG/PNG xuất ra */
export function loadDataLogo(logo: Logo | undefined): Promise<Logo | undefined> {
  if (!logo) return Promise.resolve(undefined)
  let p = cache.get(logo.src)
  if (!p) {
    p = fetch(logo.src)
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
    cache.set(logo.src, p)
  }
  return p
}
