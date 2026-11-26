# Bà Ngoại AI: Gặp lừa đảo? Gọi Bà

MoMo Techday 2026 · Chủ đề: **Chống lừa đảo + Trợ lý AI**

Người dân gửi tin nhắn hoặc ảnh chụp màn hình khả nghi cho Bà, Bà sẽ:
1. Phán có phải lừa đảo không, thuộc kịch bản nào, mức nguy hiểm.
2. Chỉ việc cần làm ngay.
3. Soạn sẵn **câu troll để câu giờ** kẻ lừa (copy dán lại).
4. Bóc STK/SĐT/link của kẻ lừa vào **sổ đen chung**, gom vào **kho kịch bản**, phát hiện **kịch bản MỚI**.
5. Ví điện tử gọi **API kiểm tra STK** để chặn trước khi người dùng chuyển tiền.

> Daisy ở Anh có 1 bà. Bọn mình có 100 triệu đứa cháu.

## Tính năng (MVP)

| Trang / API | Mô tả |
|---|---|
| `/` **Gọi Bà** | Dán text, upload hoặc Ctrl+V ảnh → cảnh báo + câu troll + "X người đã gặp" |
| `/thu-lua-ba` **Thử lừa Bà** | Giám khảo đóng vai scammer, bà Tư tự câu giờ; bấm Kết thúc để xem báo cáo |
| `/canh-bao` **Bản tin** | Kịch bản theo cộng đồng, tag MỚI (< 7 ngày), STK/SĐT đã che |
| `/kiem-tra-stk` | Tra STK/SĐT/link + màn **Ví Demo** mô phỏng chặn chuyển tiền |
| Bot Telegram | Forward tin hoặc gửi ảnh → kết quả rút gọn + câu troll (chạm để copy) |
| `GET /api/check-account?q=` | API công khai (CORS mở) cho ví/ngân hàng |

## Stack

Next.js 16 (App Router, Vercel) + Supabase Postgres + Google Gemini API (đọc được ảnh) + Groq API (dự phòng) + Telegram Bot API.
Toàn bộ chạy trên gói miễn phí, không cần thẻ.

```
app/
  page.tsx               Gọi Bà
  thu-lua-ba/page.tsx    Thử lừa Bà
  canh-bao/page.tsx      Bản tin (server component)
  kiem-tra-stk/page.tsx  Kiểm tra STK + Ví Demo
  api/analyze            Phân tích tin/ảnh (lõi)
  api/bait               Bà Tư trả lời 1 lượt chat
  api/bait/report        Báo cáo cuối màn
  api/check-account      Tra sổ đen
  api/telegram           Webhook bot
  api/cron/keepalive     Giữ Supabase free không bị tạm dừng
lib/
  prompts.ts             ★ Toàn bộ prompt của Bà, chỉnh giọng văn ở đây
  analyze.ts             Lõi: AI → kịch bản → lưu report + IOC → thống kê
  llm.ts                 Gọi Gemini (chính) → Groq (dự phòng), bằng fetch, không cần SDK
  ratelimit.ts           Giới hạn lượt theo IP + trần lượt gọi AI/ngày
  ioc.ts                 Chuẩn hóa và che STK/SĐT/link
supabase/
  schema.sql             Bảng, view scenario_stats, hàm RPC
  seed.sql               12 kịch bản + lượt báo/IOC MÔ PHỎNG
```

## Setup

### 1. Supabase
1. Tạo project trên supabase.com.
2. Vào **SQL Editor** → chạy `supabase/schema.sql` → chạy tiếp `supabase/seed.sql`.
3. **Project Settings → API**: lấy `Project URL` và `service_role` key.

### 2. AI (miễn phí)
1. **Gemini**: vào aistudio.google.com, đăng nhập Google, bấm **Get API key** → Create API key → dán vào `GEMINI_API_KEY`.
   `GEMINI_MODEL` nhận nhiều model cách nhau bằng dấu phẩy: model đầu hết quota free thì app tự dùng model sau (mỗi model có quota riêng). Chạy `npm run check` để xem tên model chính xác mà key của bạn gọi được.
2. **Groq** (dự phòng, không bắt buộc): console.groq.com → API Keys → Create → dán vào `GROQ_API_KEY`.

Hết quota free thì API chỉ trả lỗi 429, không tính tiền. `DAILY_AI_CAP` chặn trước để không đụng trần.

### 3. Telegram bot
Chat với @BotFather → `/newbot` → lấy token. Tự đặt một chuỗi bí mật cho `TELEGRAM_WEBHOOK_SECRET` (chỉ chữ, số, `_`, `-`).

### 4. Chạy local
Tạo file `.env.local` ở thư mục gốc theo mẫu trong mục **Biến môi trường** bên dưới, rồi:
```bash
npm install
npm run check   # soát Supabase, Gemini, Groq: kết nối được chưa, model nào gọi được
npm run dev     # http://localhost:3000
```

### 5. Deploy Vercel
1. Import repo trên vercel.com.
2. Khai báo các biến trong mục **Biến môi trường** ở **Settings → Environment Variables** (nhớ `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`).
3. **Settings → Functions → Region**: chọn Singapore (`sin1`) cho gần database Supabase.
4. Deploy xong thì đăng ký webhook Telegram (thay `<TOKEN>`, `<DOMAIN>`, `<SECRET>`):
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMAIN>/api/telegram&secret_token=<SECRET>&allowed_updates=%5B%22message%22%5D"
```
Kiểm tra: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## Biến môi trường
Tất cả dịch vụ đều có gói miễn phí, không cần thẻ. File `.env.local` đã nằm trong `.gitignore`, **không commit file này**.

```bash
# --- AI ---
# Google AI Studio (aistudio.google.com) > Get API key
GEMINI_API_KEY=
# Model phân tích tin nhắn + ảnh, theo thứ tự ưu tiên (cách nhau dấu phẩy)
GEMINI_MODEL=gemini-flash-latest,gemini-flash-lite-latest
# Model cho "Thử lừa Bà" (chat nhiều lượt). Bỏ trống = dùng GEMINI_MODEL
GEMINI_MODEL_CHAT=gemini-flash-lite-latest
# Dự phòng khi mọi model Gemini đều lỗi (chỉ xử lý chữ). console.groq.com > API Keys. Bỏ trống = không dùng
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
# Trần lượt gọi AI mỗi ngày (toàn hệ thống), để thấp hơn quota free
DAILY_AI_CAP=500

# --- Database: Supabase > Project Settings > API Keys (secret / service_role, CHỈ để ở server) ---
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# --- Telegram (không bắt buộc): tạo bot bằng @BotFather ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=

# --- Deploy ---
NEXT_PUBLIC_SITE_URL=
CRON_SECRET=
```

## Dữ liệu và quyền riêng tư
- Nội dung người dùng gửi được xử lý bằng **Gemini API bản miễn phí**. Google có thể dùng dữ liệu bản miễn phí để cải thiện sản phẩm, nên trang web nhắc người dùng che tên, SĐT của mình trước khi gửi.
- **Không lưu ảnh gốc, không lưu nguyên văn tin nhắn**: chỉ lưu trường đã bóc (kịch bản, chiêu tâm lý, câu đặc trưng, IOC của kẻ lừa).
- Mọi bảng bật RLS, không có policy → chỉ server (service_role) truy cập.
- Dữ liệu seed có `is_simulated = true` (IOC: `real_count = 0`), UI hiện riêng "(+N mẫu mô phỏng)". **Không báo số mô phỏng như số thật** trên slide.
- STK seed dùng đầu `9999…`, SĐT đầu `0123…` (không còn cấp), link đuôi `.example` để không trùng người thật.
- Lượt "Thử lừa Bà" lưu ở `bait_sessions`, không tính vào thống kê kịch bản.

## Guardrail của Bà
Không hướng dẫn chuyển tiền, không tạo biên lai giả, không đưa thông tin thật, không chửi bới khiêu khích, giữ vai trước prompt injection. Xem `lib/prompts.ts`.

## Giới hạn lượt mặc định
| Endpoint | Giới hạn |
|---|---|
| `/api/analyze` | 30 lượt/giờ/IP |
| `/api/bait` | 120 lượt/giờ/IP |
| `/api/bait/report` | 20 lượt/giờ/IP |
| Bot Telegram | 20 lượt/giờ/chat |
| `/api/check-account` | 300 lượt/giờ/IP |
| Toàn hệ thống | `DAILY_AI_CAP` lượt gọi AI/ngày |

## Tài sản có sẵn, thư viện và công cụ AI đã dùng

| Loại | Tên | Dùng để |
|---|---|---|
| Framework | Next.js, React (MIT) | Web + API |
| Thư viện | @supabase/supabase-js (MIT) | Kết nối database |
| Font | Be Vietnam Pro, Barlow Condensed (SIL OFL, Google Fonts) | Chữ giao diện |
| Dịch vụ | Supabase (gói free) | Postgres lưu kịch bản, sổ đen |
| Dịch vụ | Vercel (gói Hobby) | Hosting + cron |
| AI trong sản phẩm | Google Gemini API (gói free) | Phân tích tin nhắn, đọc ảnh chụp màn hình, đóng vai bà Tư |
| AI trong sản phẩm | Groq API, model gpt-oss-120b (gói free) | Dự phòng khi Gemini quá tải |
| Công cụ AI hỗ trợ làm bài | Claude (Anthropic) | Lên ý tưởng, viết code, viết prompt |

Dữ liệu seed (kịch bản, câu mẫu) do nhóm tự viết dựa trên các cảnh báo công khai của cơ quan chức năng; STK/SĐT/link trong seed là số giả.
