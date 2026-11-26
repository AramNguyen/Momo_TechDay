// Webhook bot Telegram "Gọi Bà". Đăng ký bằng setWebhook (xem README).
import { analyzeAndStore } from '@/lib/analyze';
import { guard } from '@/lib/ratelimit';
import { IOC_TYPE_LABELS } from '@/lib/ioc';
import { isNewScenario, VERDICT_META, type AnalyzeResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface TgPhoto {
  file_id: string;
  file_size?: number;
}
interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: TgPhoto[];
  document?: { file_id: string; mime_type?: string; file_size?: number };
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tg(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Thiếu TELEGRAM_BOT_TOKEN');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

function send(chatId: number, text: string, replyTo?: number) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
}

async function downloadImage(fileId: string): Promise<{ data: string; mediaType: string }> {
  const file = (await tg('getFile', { file_id: fileId })) as { file_path?: string; file_size?: number };
  if (!file.file_path) throw new Error('Không lấy được file');
  if (file.file_size && file.file_size > MAX_FILE_BYTES) throw new Error('Ảnh quá lớn');
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!res.ok) throw new Error('Tải ảnh lỗi');
  const buf = Buffer.from(await res.arrayBuffer());
  const lower = file.file_path.toLowerCase();
  const mediaType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return { data: buf.toString('base64'), mediaType };
}

function formatResult(r: AnalyzeResponse): string {
  const meta = VERDICT_META[r.verdict];
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const lines: string[] = [`<b>${meta.label.toUpperCase()}</b> (mức nguy hiểm ${r.risk}/100)`];

  if (r.scenario) {
    const isNew = r.scenario.just_created || isNewScenario(r.scenario.first_report);
    lines.push(
      `Kịch bản: <b>${esc(r.scenario.name)}</b>${isNew ? ' (mới)' : ''}`,
      `${r.scenario.real_count} người đã gửi cho bà kịch bản này`,
    );
  }
  if (r.summary) lines.push('', esc(r.summary));
  if (r.red_flags.length) lines.push('', '<b>Dấu hiệu:</b>', ...r.red_flags.map((x) => `- ${esc(x)}`));
  if (r.advice.length) lines.push('', '<b>Con nên làm ngay:</b>', ...r.advice.map((x) => `- ${esc(x)}`));
  if (r.iocs.length) {
    lines.push('', '<b>Bà đã ghi vào sổ đen:</b>', ...r.iocs.map((i) => `- ${IOC_TYPE_LABELS[i.type]}: ${esc(i.value)}`));
  }
  if (r.grandma_note) lines.push('', `<i>${esc(r.grandma_note)}</i>`);
  if (r.troll_replies.length) lines.push('', 'Muốn câu giờ kẻ lừa? Chạm vào tin bên dưới để copy rồi gửi lại cho nó:');
  if (site) lines.push('', `Bản tin lừa đảo: ${site}/canh-bao`);
  return lines.join('\n');
}

const WELCOME = [
  '<b>Bà Ngoại AI đây con.</b>',
  '',
  'Gặp tin nhắn, cuộc gọi hay đoạn chat khả nghi thì <b>chuyển tiếp (forward)</b>, dán nội dung, hoặc <b>gửi ảnh chụp màn hình</b> cho bà.',
  'Bà sẽ:',
  '- Nói con nghe có phải lừa đảo không, chiêu gì',
  '- Chỉ con việc cần làm ngay',
  '- Soạn sẵn câu để con câu giờ kẻ lừa',
  '',
  'Mỗi tin con gửi giúp cả nước biết thêm một chiêu lừa mới đó.',
].join('\n');

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const update = (await req.json().catch(() => null)) as { message?: TgMessage } | null;
  const msg = update?.message;
  if (!msg?.chat?.id) return new Response('ok');
  const chatId = msg.chat.id;

  try {
    const text = (msg.text ?? msg.caption ?? '').trim();
    if (/^\/(start|help)\b/.test(text)) {
      await send(chatId, WELCOME);
      return new Response('ok');
    }

    const photoId =
      msg.photo?.at(-1)?.file_id ?? (msg.document?.mime_type?.startsWith('image/') ? msg.document.file_id : undefined);
    if (!text && !photoId) {
      await send(chatId, 'Con gửi bà nội dung tin nhắn hoặc ảnh chụp màn hình nha.');
      return new Response('ok');
    }

    const blocked = await guard(`tg:${chatId}`, 3600, 20);
    if (blocked) {
      await send(chatId, esc(blocked));
      return new Response('ok');
    }

    await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined);
    const image = photoId ? await downloadImage(photoId) : undefined;
    const result = await analyzeAndStore({ text, image, source: 'telegram' });

    await send(chatId, formatResult(result), msg.message_id);
    for (const reply of result.troll_replies) {
      await send(chatId, `<code>${esc(reply)}</code>`);
    }
  } catch (e) {
    console.error('[api/telegram]', e);
    await send(chatId, 'Bà đang bận xíu, con gửi lại sau nha.').catch(() => undefined);
  }
  // Luôn trả 200 để Telegram không gửi lại update
  return new Response('ok');
}
