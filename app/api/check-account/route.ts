// API công khai: kiểm tra STK / SĐT / link đã bị báo cáo lừa đảo chưa.
// GET /api/check-account?q=0123456789
import { db } from '@/lib/supabase';
import { allow, clientIp } from '@/lib/ratelimit';
import { maskIoc, queryCandidates } from '@/lib/ioc';
import type { CheckMatch, CheckResponse, IocType } from '@/lib/types';
import { userError } from '@/lib/server-error';

export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 300);
  const candidates = queryCandidates(q);
  if (candidates.length === 0) {
    return Response.json({ error: 'Nhập STK, SĐT hoặc link cần kiểm tra (q=...)' }, { status: 400, headers: CORS });
  }

  if (!(await allow(`check:${clientIp(req)}`, 3600, 300))) {
    return Response.json({ error: 'Tra cứu nhiều quá, thử lại sau nha.' }, { status: 429, headers: CORS });
  }

  try {
    const { data, error } = await db()
      .from('iocs')
      .select('type,value_normalized,bank,report_count,real_count,last_seen,scenarios(name)')
      .in('value_normalized', candidates)
      .order('report_count', { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const matches: CheckMatch[] = rows.map((row) => {
      const sc = row.scenarios as { name: string } | { name: string }[] | null;
      const scenario = Array.isArray(sc) ? sc[0]?.name ?? null : sc?.name ?? null;
      return {
        type: row.type as IocType,
        display: maskIoc(row.type as IocType, row.value_normalized as string),
        bank: (row.bank as string | null) ?? null,
        report_count: Number(row.report_count) || 0,
        real_count: Number(row.real_count) || 0,
        simulated_only: (Number(row.real_count) || 0) === 0,
        scenario,
        last_seen: row.last_seen as string,
      };
    });

    const total = matches.reduce((s, m) => s + m.report_count, 0);
    const res: CheckResponse = {
      query: q,
      flagged: matches.length > 0,
      risk_level: total >= 3 ? 'cao' : total > 0 ? 'trung_binh' : 'chua_ghi_nhan',
      matches,
    };
    return Response.json(res, { headers: CORS });
  } catch (e) {
    console.error('[api/check-account]', e);
    return Response.json({ error: userError(e, 'Lỗi tra cứu, thử lại sau.') }, { status: 500, headers: CORS });
  }
}
