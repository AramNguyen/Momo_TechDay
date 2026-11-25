// Vercel Cron gọi mỗi ngày để Supabase free không bị tạm dừng trong thời gian chấm.
import { db } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { count, error } = await db().from('scenarios').select('id', { count: 'exact', head: true });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, scenarios: count });
}
