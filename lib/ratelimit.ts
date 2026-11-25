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
  const { data, error } = await db().rpc('hit_rate_limit', {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    // Lỗi DB thì cho qua để demo không chết; spend limit bên Anthropic là chốt chặn cuối.
    console.error('[ratelimit]', error.message);
    return true;
  }
  return data === true;
}

/**
 * Kiểm tra giới hạn theo key + trần lượt gọi Claude toàn hệ thống trong ngày.
 * Trả về câu báo lỗi (giọng bà) nếu bị chặn, null nếu được đi tiếp.
 */
export async function guard(key: string, windowSeconds: number, max: number): Promise<string | null> {
  if (!(await allow(key, windowSeconds, max))) {
    return 'Con hỏi nhiều quá, nghỉ tay chút rồi hỏi bà tiếp nha.';
  }
  const cap = Number(process.env.DAILY_CLAUDE_CAP || 2000);
  if (!(await allow('global:claude', 86400, cap))) {
    return 'Hôm nay bà mệt rồi (hết lượt trong ngày), mai con quay lại nha.';
  }
  return null;
}
