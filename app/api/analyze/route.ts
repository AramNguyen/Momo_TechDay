import { analyzeAndStore } from '@/lib/analyze';
import { clientIp, guard } from '@/lib/ratelimit';
import { userError } from '@/lib/server-error';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_B64 = 4_000_000; // ~3MB ảnh; body request của Vercel tối đa 4.5MB (client đã nén trước khi gửi)

export async function POST(req: Request) {
  let body: { text?: unknown; image?: { data?: unknown; mediaType?: unknown } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.slice(0, 6000) : '';
  let image: { data: string; mediaType: string } | undefined;
  if (body.image && typeof body.image.data === 'string' && typeof body.image.mediaType === 'string') {
    if (!MEDIA_TYPES.includes(body.image.mediaType)) {
      return Response.json({ error: 'Bà chỉ đọc được ảnh JPG, PNG, WEBP thôi con.' }, { status: 400 });
    }
    if (body.image.data.length > MAX_IMAGE_B64) {
      return Response.json({ error: 'Ảnh to quá, con chụp lại nhỏ hơn giúp bà.' }, { status: 413 });
    }
    image = { data: body.image.data, mediaType: body.image.mediaType };
  }
  if (!text.trim() && !image) {
    return Response.json({ error: 'Con dán tin nhắn hoặc gửi ảnh cho bà xem với.' }, { status: 400 });
  }

  const blocked = await guard(`analyze:${clientIp(req)}`, 3600, 30);
  if (blocked) return Response.json({ error: blocked }, { status: 429 });

  try {
    const result = await analyzeAndStore({ text, image, source: 'web' });
    return Response.json(result);
  } catch (e) {
    console.error('[api/analyze]', e);
    return Response.json({ error: userError(e, 'Bà đang bận xíu, con thử lại sau nha.') }, { status: 500 });
  }
}
