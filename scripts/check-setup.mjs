// Kiểm tra nhanh cấu hình trước khi chạy app:  npm run check
// Đọc .env.local, thử kết nối Supabase, liệt kê model Gemini dùng được và gọi thử từng model đã cấu hình.
// Không in ra giá trị key.
import { existsSync, readFileSync } from 'node:fs';

const file = new URL('../.env.local', import.meta.url);
if (!existsSync(file)) {
  console.log('Chưa có file .env.local. Tạo file đó theo mẫu trong README (mục "Biến môi trường").');
  process.exit(1);
}
const env = {};
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

let problems = 0;
const ok = (s) => console.log(`  OK    ${s}`);
const bad = (s) => {
  problems++;
  console.log(`  LỖI   ${s}`);
};
const short = async (res) => (await res.text()).replace(/\s+/g, ' ').slice(0, 160);
const list = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ---------- 1. Supabase ----------
console.log('\n1. Supabase');
const sbUrl = env.SUPABASE_URL;
const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!sbUrl || !sbKey) {
  bad('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
} else {
  for (const table of ['scenarios', 'reports', 'iocs', 'bait_sessions', 'rate_limits']) {
    try {
      const res = await fetch(`${sbUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, Prefer: 'count=exact' },
      });
      if (res.ok) {
        const total = res.headers.get('content-range')?.split('/')[1] ?? '?';
        ok(`bảng ${table}: ${total} dòng`);
      } else if (res.status === 401 || res.status === 403) {
        bad(`bảng ${table}: key bị từ chối (${res.status}). Thử dùng key service_role (dạng eyJ...) ở mục "Legacy API keys".`);
        break;
      } else if (res.status === 404) {
        bad(`bảng ${table}: chưa có. Chạy supabase/schema.sql rồi seed.sql trong SQL Editor.`);
      } else {
        bad(`bảng ${table}: ${res.status} ${await short(res)}`);
      }
    } catch (e) {
      bad(`Không kết nối được Supabase: ${e.message}`);
      break;
    }
  }
}

// ---------- 2. Gemini ----------
console.log('\n2. Gemini');
const gKey = env.GEMINI_API_KEY;
if (!gKey) {
  bad('Thiếu GEMINI_API_KEY');
} else {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': gKey },
  });
  if (!res.ok) {
    bad(`Không lấy được danh sách model: ${res.status} ${await short(res)}`);
  } else {
    const data = await res.json();
    const names = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''))
      .filter((n) => /flash|gemma/i.test(n));
    console.log('  Model Flash/Gemma key này thấy được:');
    for (const n of names) console.log(`     - ${n}`);
  }

  const configured = [
    ...list(env.GEMINI_MODEL || 'gemini-flash-latest').map((m) => ['GEMINI_MODEL', m]),
    ...list(env.GEMINI_MODEL_CHAT).map((m) => ['GEMINI_MODEL_CHAT', m]),
  ];
  console.log('  Gọi thử từng model đã cấu hình:');
  for (const [name, model] of configured) {
    const t0 = Date.now();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': gKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Trả lời đúng một chữ: ok' }] }] }),
    });
    const ms = Date.now() - t0;
    if (r.ok) ok(`${name} = ${model} (${ms}ms)`);
    else if (r.status === 404) bad(`${name} = ${model}: không có model này, chọn tên trong danh sách ở trên`);
    else if (r.status === 429) bad(`${name} = ${model}: hết quota free (429). Đợi hoặc đổi model khác`);
    else bad(`${name} = ${model}: ${r.status} ${await short(r)}`);
  }
  console.log('  Xem quota từng model: AI Studio > Dashboard > Usage / Rate limit');
}

// ---------- 3. Groq (không bắt buộc) ----------
console.log('\n3. Groq (dự phòng, không bắt buộc)');
if (!env.GROQ_API_KEY) {
  console.log('  Bỏ qua: chưa có GROQ_API_KEY');
} else {
  const r = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
  });
  if (r.ok) ok('Key Groq hợp lệ');
  else bad(`Groq: ${r.status} ${await short(r)}`);
}

console.log(problems ? `\nCòn ${problems} lỗi cần sửa.\n` : '\nMọi thứ ổn, chạy npm run dev được rồi.\n');
process.exit(problems ? 1 : 0);
