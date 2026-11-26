// Giới hạn lượt bằng bảng rate_limits trong Supabase (serverless nên không dùng bộ nhớ trong process được).
import { db } from './supabase';

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function allow(key: string, windowSeconds: number, max: number): Promise<boolean> {
  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await db().rpc('hit_rate_limit', {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    }));
  } catch (e) {
    // Thiếu biến môi trường Supabase: cho qua, route phía sau sẽ báo lỗi rõ ràng
    console.error('[ratelimit]', e instanceof Error ? e.message : e);
    return true;
  }
  if (error) {
    // Lỗi DB thì cho qua để demo không chết; quota free của Gemini/Groq tự chặn ở phía họ (lỗi 429, không tính tiền).
    console.error('[ratelimit]', error.message);
    return true;
  }
  return data === true;
}

/**
 * Kiểm tra giới hạn theo key + trần lượt gọi AI toàn hệ thống trong ngày.
 * Trả về câu báo lỗi (giọng bà) nếu bị chặn, null nếu được đi tiếp.
 */
export async function guard(key: string, windowSeconds: number, max: number): Promise<string | null> {
  if (!(await allow(key, windowSeconds, max))) {
    return 'Con hỏi nhiều quá, nghỉ tay chút rồi hỏi bà tiếp nha.';
  }
  const cap = Number(process.env.DAILY_AI_CAP || 500);
  if (!(await allow('global:ai', 86400, cap))) {
    return 'Hôm nay bà mệt rồi (hết lượt trong ngày), mai con quay lại nha.';
  }
  return null;
}
