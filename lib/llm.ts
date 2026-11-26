// Gọi AI miễn phí: Gemini (chính, đọc được ảnh) → Groq (dự phòng, chỉ chữ).
// Giữ nguyên dạng message/content block như trước để các chỗ gọi không phải sửa nhiều.

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface AIOptions {
  system: string;
  messages: AIMessage[];
  /** Độ dài câu trả lời mong muốn. Gemini Flash "suy nghĩ" ngầm và ăn vào giới hạn token, nên mình tự cộng thêm phần đệm. */
  maxTokens?: number;
  /** Bắt model trả JSON (dùng cho bước phân tích, báo cáo). */
  json?: boolean;
  /** 'main' cho phân tích ảnh/tin nhắn, 'chat' cho Thử lừa Bà (model nhẹ, quota rộng hơn). */
  tier?: 'main' | 'chat';
}

const THINKING_HEADROOM = 4096;
/** Mỗi model chỉ được chờ tối đa chừng này; quá thì nhảy sang model sau. */
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 25000);
/** Mức "suy nghĩ" của Gemini 3.x: low cho nhanh. Đặt GEMINI_THINKING_LEVEL= (trống) để tắt dòng này. */
const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL ?? 'low';

// Tin lừa đảo toàn chữ "khởi tố", "ma túy", dọa nạt... nên hạ bộ lọc xuống chỉ chặn mức cao.
const SAFETY = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

/**
 * Danh sách model theo thứ tự ưu tiên, ghi cách nhau bằng dấu phẩy trong env.
 * Mỗi model có quota free riêng: model đầu hết lượt thì tự nhảy sang model sau.
 */
function geminiModels(tier: 'main' | 'chat'): string[] {
  const parse = (v?: string) =>
    (v ?? '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  const main = parse(process.env.GEMINI_MODEL);
  const list = tier === 'chat' ? parse(process.env.GEMINI_MODEL_CHAT) : [];
  const out = list.length ? list : main;
  return out.length ? out : ['gemini-flash-latest'];
}

function hasImage(messages: AIMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image'));
}

function toText(content: AIMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
}

async function callGemini(o: AIOptions, model: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Thiếu GEMINI_API_KEY');

  const contents = o.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts:
      typeof m.content === 'string'
        ? [{ text: m.content }]
        : m.content.map((b) =>
            b.type === 'text' ? { text: b.text } : { inlineData: { mimeType: b.source.media_type, data: b.source.data } },
          ),
  }));

  const send = (withThinking: boolean) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: o.system }] },
        contents,
        safetySettings: SAFETY,
        generationConfig: {
          maxOutputTokens: (o.maxTokens ?? 1500) + THINKING_HEADROOM,
          ...(o.json ? { responseMimeType: 'application/json' } : {}),
          ...(withThinking && THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
        },
      }),
    });

  const t0 = Date.now();
  let res: Response;
  try {
    res = await send(true);
    // Model nào không hỗ trợ thinkingLevel thì gọi lại không kèm tùy chọn đó
    if (res.status === 400 && THINKING_LEVEL) {
      const body = await res.text();
      if (/thinking/i.test(body)) res = await send(false);
      else throw new Error(`Gemini 400 (${model}): ${body.slice(0, 300)}`);
    }
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`Gemini quá ${Math.round(TIMEOUT_MS / 1000)}s không trả lời (${model})`);
    }
    throw e;
  }
  console.log(`[ai] ${model}: ${res.status} sau ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status} (${model}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) {
    const why = data.promptFeedback?.blockReason || cand?.finishReason || 'không rõ';
    throw new Error(`Gemini trả rỗng (${why})`);
  }
  return text;
}

async function callGroq(o: AIOptions): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('Thiếu GROQ_API_KEY');
  if (hasImage(o.messages)) throw new Error('Groq dự phòng không đọc được ảnh');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      max_completion_tokens: (o.maxTokens ?? 1500) + THINKING_HEADROOM,
      ...(o.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: o.system },
        ...o.messages.map((m) => ({ role: m.role, content: toText(m.content) })),
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Groq trả rỗng');
  return text;
}

/**
 * Thử lần lượt từng model Gemini trong danh sách; tất cả đều lỗi (hết quota, bị lọc, rỗng...)
 * thì chuyển sang Groq nếu có key và không có ảnh.
 */
export async function callAI(o: AIOptions): Promise<string> {
  let lastError: unknown;
  for (const model of geminiModels(o.tier ?? 'main')) {
    try {
      return await callGemini(o, model);
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ai] Gemini lỗi:', msg);
      if (msg.startsWith('Thiếu ')) throw e; // thiếu key thì đổi model cũng vô ích
    }
  }
  if (!process.env.GROQ_API_KEY || hasImage(o.messages)) throw lastError;
  console.error('[ai] chuyển sang Groq');
  return await callGroq(o);
}

/** Lấy object JSON đầu tiên trong câu trả lời (phòng khi model lỡ bọc ```json). */
export function parseJson<T>(raw: string): T {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Model không trả về JSON');
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
