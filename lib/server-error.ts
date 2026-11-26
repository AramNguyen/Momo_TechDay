// Câu báo lỗi trả về cho trình duyệt. Khi chạy trên máy (dev) thì nói rõ thiếu cấu hình gì để dễ sửa.

export function userError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (process.env.NODE_ENV !== 'production' && msg.startsWith('Thiếu ')) {
    return `${msg}. Điền vào file .env.local rồi khởi động lại npm run dev.`;
  }
  return fallback;
}
