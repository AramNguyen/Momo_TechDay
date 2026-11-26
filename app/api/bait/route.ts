// "Thử lừa Bà": mỗi lượt client gửi toàn bộ lịch sử chat, bà Tư trả lời 1 tin.
import { callAI } from '@/lib/llm';
import { BAIT_SYSTEM } from '@/lib/prompts';
import { clientIp, guard } from '@/lib/ratelimit';
import { validateTurns } from '@/lib/turns';
import { userError } from '@/lib/server-error';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

  const turns = validateTurns(body.messages, 'user');
  if (typeof turns === 'string') return Response.json({ error: turns }, { status: 400 });

  const blocked = await guard(`bait:${clientIp(req)}`, 3600, 120);
  if (blocked) return Response.json({ error: blocked }, { status: 429 });

  try {
    const reply = await callAI({ system: BAIT_SYSTEM, messages: turns, maxTokens: 400, tier: 'chat' });
    return Response.json({ reply: reply || 'Alo... con nói gì bà nghe hông rõ.' });
  } catch (e) {
    console.error('[api/bait]', e);
    return Response.json({ error: userError(e, 'Bà rớt mạng rồi, con nhắn lại nha.') }, { status: 500 });
  }
}
