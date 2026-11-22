export type InAppBrowser = 'Zalo' | 'Messenger' | 'Facebook'

/** Trình duyệt nhúng trong ứng dụng (không tải được hình về máy); trả về tên ứng dụng, hoặc null nếu là trình duyệt thường. */
export function isInAppBrowser(ua: string = navigator.userAgent): InAppBrowser | null {
  if (/Zalo/i.test(ua)) return 'Zalo'
  if (/Messenger|FB_IAB\/Orca|FBAN\/Orca/i.test(ua)) return 'Messenger'
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook'
  return null
}

export function inAppNotice(app: InAppBrowser): { text: string; how: string } {
  return {
    text: `Bạn đang mở trang bằng trình duyệt ${app} — trình duyệt này không tải hình về được. Hãy mở bằng Chrome hoặc Safari để tải hình về máy.`,
    how: app === 'Zalo' ? 'Cách mở: bấm nút ⋯ rồi chọn "Mở bằng trình duyệt".' : 'Cách mở: bấm nút ⋯ rồi chọn "Mở bằng trình duyệt ngoài".',
  }
}
