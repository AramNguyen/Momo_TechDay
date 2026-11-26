// Chạy trên trình duyệt: đọc JSON từ API, báo lỗi dễ hiểu khi server sập hoặc trả về không phải JSON.

export async function readJson<T>(res: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Server sập giữa chừng (thường do thiếu biến trong .env.local) nên không có JSON để đọc
  }
  if (!res.ok || data === null) {
    const msg = (data as { error?: unknown } | null)?.error;
    throw new Error(
      typeof msg === 'string' && msg
        ? msg
        : `Máy chủ đang gặp lỗi (mã ${res.status}). Nếu đang chạy trên máy, xem terminal và kiểm tra file .env.local.`,
    );
  }
  return data as T;
}
