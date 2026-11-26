// Báo cáo cuối màn "Thử lừa Bà". Lưu vào bait_sessions (KHÔNG tính vào thống kê kịch bản thật).
import { callAI, parseJson } from '@/lib/llm';
import { BAIT_REPORT_SYSTEM } from '@/lib/prompts';
import { clientIp, guard } from '@/lib/ratelimit';
import { db } from '@/lib/supabase';
import { validateTurns } from '@/lib/turns';
import type { BaitReport } from '@/lib/types';
import { userError } from '@/lib/server-error';

export const runtime = 'nodejs';
export const maxDuration = 60;

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}
function strs(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, max) : [];
}

export async function POST(req: Request) {
  let body: { messages?: unknown; durationSec?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

  const turns = validateTurns(body.messages, 'any');
  if (typeof turns === 'string') return Response.json({ error: turns }, { status: 400 });
  const durationSec = Math.max(0, Math.min(24 * 3600, Math.round(Number(body.durationSec) || 0)));

  const blocked = await guard(`bait-report:${clientIp(req)}`, 3600, 20);
  if (blocked) return Response.json({ error: blocked }, { status: 429 });

  const transcript = turns.map((t) => `${t.role === 'user' ? 'NGƯỜI NHẮN' : 'BÀ TƯ'}: ${t.content}`).join('\n');

  try {
    const raw = await callAI({
      system: BAIT_REPORT_SYSTEM,
      messages: [{ role: 'user', content: `<hoi_thoai>\n${transcript}\n</hoi_thoai>` }],
      maxTokens: 1200,
      json: true,
    });
    const p = parseJson<Record<string, unknown>>(raw);
    const report: BaitReport = {
      is_scam: p.is_scam === true,
      scenario_name: str(p.scenario_name, 'Chưa rõ'),
      tactics: strs(p.tactics, 7),
      stages_reached: strs(p.stages_reached, 4),
      extracted_info: Array.isArray(p.extracted_info)
        ? (p.extracted_info as { label?: unknown; value?: unknown }[])
            .filter((x) => x && typeof x.label === 'string' && typeof x.value === 'string')
            .map((x) => ({ label: String(x.label), value: String(x.value) }))
            .slice(0, 12)
        : [],
      scammer_frustration: Math.max(0, Math.min(10, Math.round(Number(p.scammer_frustration) || 0))),
      highlights: strs(p.highlights, 2),
      summary: str(p.summary),
      lessons: strs(p.lessons, 3),
    };

    const { error } = await db()
      .from('bait_sessions')
      .insert({ turns: turns.length, duration_sec: durationSec, transcript: turns, report });
    if (error) console.error('[api/bait/report] lưu lỗi', error.message);

    return Response.json({ report });
  } catch (e) {
    console.error('[api/bait/report]', e);
    return Response.json({ error: userError(e, 'Bà chưa viết xong báo cáo, con bấm lại nha.') }, { status: 500 });
  }
}
